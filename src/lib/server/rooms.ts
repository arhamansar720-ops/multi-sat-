import type { PoolClient } from "pg";
import { getQuestion, toPublicQuestion } from "@/lib/content/bank";
import { getTrack } from "@/lib/content/catalog";
import { formatCorrectAnswer, isResponseCorrect, sanitizeResponse } from "@/lib/content/grading";
import { randomId } from "@/lib/content/random";
import type { AnswerResponse, PublicQuestion } from "@/lib/content/types";
import { selectQuestions } from "@/lib/engine/selection";
import { qualifyingAchievements } from "@/lib/progression/achievements";
import { localDateKey } from "@/lib/progression/dates";
import { computeMatchRewards } from "@/lib/progression/xp";
import {
  canAcceptAnswer,
  COUNTDOWN_MS,
  displayNameSchema,
  generateRoomCode,
  nextClock,
  normalizeRoomCode,
  pointsFor,
  rankStandings,
  ROOM_TTL_HOURS,
  roomSettingsSchema,
  type MatchClock,
  type MatchPhase,
  type RoomSettings,
} from "@/lib/multiplayer/rules";
import type { AuthUser } from "./auth";
import { isUniqueViolation, json, maybeOne, query, tx } from "./db";
import { ApiError } from "./errors";
import { ensureQuestionBank } from "./question-sync";

/** A member counts as connected if they polled or pinged within this window. */
const ONLINE_WINDOW_MS = 20_000;
const LAST_SEEN_THROTTLE_MS = 5_000;

interface RoomRow {
  id: string;
  code: string;
  host_id: string;
  status: "lobby" | "playing" | "finished" | "closed";
  settings: RoomSettings;
  current_match_id: string | null;
  created_at: string;
  last_activity_at: string;
  expires_at: string;
}
interface MemberRow {
  room_id: string;
  user_id: string;
  display_name: string;
  role: "host" | "player";
  is_ready: boolean;
  joined_at: string;
  last_seen_at: string;
  left_at: string | null;
}
interface MatchRow {
  id: string;
  room_id: string;
  round: number;
  phase: MatchPhase;
  current_index: number;
  phase_started_at: string;
  phase_ends_at: string;
  question_count: number;
  seconds_per_question: number;
  scoring: RoomSettings["scoring"];
  settings: RoomSettings;
  human_players: number;
  started_at: string;
  finished_at: string | null;
  finalized_at: string | null;
}
interface ParticipantRow {
  match_id: string;
  user_id: string;
  display_name: string;
  score: number;
  correct: number;
  answered: number;
  best_streak: number;
  fastest_correct_ms: number | null;
  correct_time_ms: number;
  rank: number | null;
  xp_awarded: number;
  joined_at: string;
}
interface HistoryRow {
  user_id: string;
  rank: number;
  finished_at: string;
  human_players: number;
}
interface AnswerRow {
  match_id: string;
  position: number;
  user_id: string;
  response: AnswerResponse;
  is_correct: boolean;
  points: number;
  response_ms: number;
  submitted_at: string;
}

export interface RoomMemberView {
  userId: string;
  displayName: string;
  role: "host" | "player";
  isReady: boolean;
  online: boolean;
  isMe: boolean;
}

export interface StandingView {
  userId: string;
  displayName: string;
  score: number;
  correct: number;
  answered: number;
  rank: number;
  isMe: boolean;
  lastPoints: number | null;
  bestStreak?: number;
  fastestCorrectMs?: number | null;
  xpAwarded?: number;
}

export interface RoomState {
  serverNow: number;
  room: { code: string; status: RoomRow["status"]; hostId: string; settings: RoomSettings; expiresAt: string };
  me: { userId: string; displayName: string; isHost: boolean };
  members: RoomMemberView[];
  match: null | {
    id: string;
    round: number;
    phase: MatchPhase;
    index: number;
    phaseStartedAt: number;
    phaseEndsAt: number;
    questionCount: number;
    secondsPerQuestion: number;
    scoring: RoomSettings["scoring"];
    isParticipant: boolean;
    question: PublicQuestion | null;
    myAnswer: AnswerResponse | null;
    answeredCount: number;
    participantCount: number;
    reveal: null | {
      correct: string[];
      correctText: string;
      explanation: string;
      myCorrect: boolean | null;
      myPoints: number;
      results: { userId: string; displayName: string; correct: boolean; points: number; answered: boolean }[];
    };
    standings: StandingView[];
  };
}

export interface RoomPreview {
  code: string;
  status: RoomRow["status"];
  trackName: string;
  players: number;
  maxPlayers: number;
  hostName: string;
}

function clockOf(m: MatchRow): MatchClock {
  return {
    phase: m.phase,
    index: m.current_index,
    phaseStartedAt: new Date(m.phase_started_at).getTime(),
    phaseEndsAt: new Date(m.phase_ends_at).getTime(),
    questionCount: m.question_count,
    secondsPerQuestion: m.seconds_per_question,
  };
}

function isOnline(member: MemberRow, now: number): boolean {
  return !member.left_at && now - new Date(member.last_seen_at).getTime() < ONLINE_WINDOW_MS;
}

async function loadRoom(rawCode: string): Promise<RoomRow> {
  const code = normalizeRoomCode(rawCode);
  if (!code) throw new ApiError(400, "invalid_code", "Room codes are 6 letters or numbers, like K7Q2MZ.");
  const room = await maybeOne<RoomRow>("select * from public.multiplayer_rooms where code = $1", [code]);
  if (!room || room.status === "closed") throw new ApiError(404, "room_not_found", "We couldn't find an open room with that code. Check the code or ask your host for a new one.");
  if (new Date(room.expires_at).getTime() < Date.now()) {
    await query("update public.multiplayer_rooms set status = 'closed' where id = $1", [room.id]);
    throw new ApiError(410, "room_expired", "This room has expired. Ask your host to create a new one.");
  }
  return room;
}

async function loadMembers(roomId: string): Promise<MemberRow[]> {
  return query<MemberRow>("select * from public.room_members where room_id = $1 order by joined_at", [roomId]);
}

function requireMember(members: MemberRow[], userId: string, opts: { active?: boolean } = {}): MemberRow {
  const me = members.find((m) => m.user_id === userId);
  if (!me || (opts.active && me.left_at)) throw new ApiError(403, "not_member", "Join this room before taking that action.");
  return me;
}

async function touchRoom(roomId: string, patch: { settings?: RoomSettings; host_id?: string } = {}) {
  const expires = new Date(Date.now() + ROOM_TTL_HOURS * 3_600_000).toISOString();
  await query(
    `update public.multiplayer_rooms
        set last_activity_at = now(), expires_at = $2,
            settings = coalesce($3::jsonb, settings), host_id = coalesce($4::uuid, host_id)
      where id = $1`,
    [roomId, expires, patch.settings ? json(patch.settings) : null, patch.host_id ?? null],
  );
}

function resolveDisplayName(user: AuthUser, requested: unknown): string {
  if (typeof requested === "string" && requested.trim()) return displayNameSchema.parse(requested);
  return user.displayName || "Player";
}

export async function createRoom(user: AuthUser, body: { settings: unknown; displayName?: unknown }) {
  const settings = roomSettingsSchema.parse(body.settings);
  if (!getTrack(settings.track)) throw new ApiError(400, "unknown_track", "That exam or course does not exist.");
  const displayName = resolveDisplayName(user, body.displayName);
  await ensureQuestionBank();

  // Durable spam protection: at most 10 rooms per user per hour.
  const recent = await maybeOne<{ n: number }>(
    "select count(*)::int as n from public.multiplayer_rooms where host_id = $1 and created_at >= now() - interval '1 hour'",
    [user.id],
  );
  if ((recent?.n ?? 0) >= 10) throw new ApiError(429, "rate_limited", "You've created several rooms recently. Reuse an existing room or try again in a bit.");

  if (Math.random() < 0.2) await query("select public.cleanup_stale_rooms()");
  // Close this host's previous open lobbies so abandoned rooms don't pile up.
  await query("update public.multiplayer_rooms set status = 'closed' where host_id = $1 and status = 'lobby'", [user.id]);

  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateRoomCode();
    const id = randomId();
    try {
      await tx(async (client) => {
        await client.query("insert into public.multiplayer_rooms (id, code, host_id, settings) values ($1, $2, $3, $4::jsonb)", [id, code, user.id, json(settings)]);
        await client.query(
          "insert into public.room_members (room_id, user_id, display_name, role, is_ready) values ($1, $2, $3, 'host', true)",
          [id, user.id, displayName],
        );
      });
    } catch (err) {
      if (isUniqueViolation(err)) continue; // code collision, try another
      throw err;
    }
    return { code };
  }
  throw new ApiError(503, "code_exhausted", "Couldn't generate a room code. Please try again.");
}

export async function previewRoom(rawCode: string): Promise<RoomPreview> {
  const room = await loadRoom(rawCode);
  const members = await loadMembers(room.id);
  const host = members.find((m) => m.user_id === room.host_id);
  return {
    code: room.code,
    status: room.status,
    trackName: getTrack(room.settings.track)?.name ?? room.settings.track,
    players: members.filter((m) => !m.left_at).length,
    maxPlayers: room.settings.maxPlayers,
    hostName: host?.display_name ?? "Host",
  };
}

export async function joinRoom(user: AuthUser, rawCode: string, requestedName: unknown) {
  const room = await loadRoom(rawCode);
  const members = await loadMembers(room.id);
  const existing = members.find((m) => m.user_id === user.id);
  const displayName = resolveDisplayName(user, requestedName ?? existing?.display_name);
  const now = new Date().toISOString();

  if (existing) {
    // Reconnect: existing members can always come back to their room.
    await query("update public.room_members set left_at = null, last_seen_at = $3, display_name = $4 where room_id = $1 and user_id = $2", [
      room.id,
      user.id,
      now,
      displayName,
    ]);
  } else {
    if (room.status === "playing") throw new ApiError(409, "in_progress", "A match is already in progress in this room. You can join when it ends.");
    const active = members.filter((m) => !m.left_at).length;
    if (active >= room.settings.maxPlayers) throw new ApiError(409, "room_full", `This room is full (${room.settings.maxPlayers} players).`);
    await query(
      "insert into public.room_members (room_id, user_id, display_name, role) values ($1, $2, $3, 'player') on conflict do nothing",
      [room.id, user.id, displayName],
    );
  }
  await touchRoom(room.id);
  return { code: room.code };
}

export async function setReady(user: AuthUser, rawCode: string, ready: boolean) {
  const room = await loadRoom(rawCode);
  const members = await loadMembers(room.id);
  requireMember(members, user.id, { active: true });
  if (room.status === "playing") throw new ApiError(409, "in_progress", "You can't change ready status during a match.");
  await query("update public.room_members set is_ready = $3, last_seen_at = now() where room_id = $1 and user_id = $2", [room.id, user.id, ready]);
  return { ok: true };
}

export async function updateRoomSettings(user: AuthUser, rawCode: string, rawSettings: unknown) {
  const room = await loadRoom(rawCode);
  if (room.host_id !== user.id) throw new ApiError(403, "not_host", "Only the host can change room settings.");
  if (room.status === "playing") throw new ApiError(409, "in_progress", "Settings can't change during a match.");
  const settings = roomSettingsSchema.parse(rawSettings);
  if (!getTrack(settings.track)) throw new ApiError(400, "unknown_track", "That exam or course does not exist.");
  await touchRoom(room.id, { settings });
  // Players must re-confirm readiness after settings change.
  await query("update public.room_members set is_ready = false where room_id = $1 and user_id <> $2", [room.id, room.host_id]);
}

export async function leaveRoom(user: AuthUser, rawCode: string) {
  const room = await loadRoom(rawCode);
  const members = await loadMembers(room.id);
  requireMember(members, user.id);
  const now = new Date().toISOString();
  await query("update public.room_members set left_at = $3, is_ready = false where room_id = $1 and user_id = $2", [room.id, user.id, now]);
  if (room.host_id === user.id) {
    const nextHost = members.find((m) => m.user_id !== user.id && !m.left_at);
    if (nextHost) {
      await query("update public.room_members set role = 'player' where room_id = $1 and user_id = $2", [room.id, user.id]);
      await query("update public.room_members set role = 'host', is_ready = true where room_id = $1 and user_id = $2", [room.id, nextHost.user_id]);
      await touchRoom(room.id, { host_id: nextHost.user_id });
    } else {
      await query("update public.multiplayer_rooms set status = 'closed' where id = $1", [room.id]);
    }
  }
  return { ok: true };
}

export async function startMatch(user: AuthUser, rawCode: string) {
  const room = await loadRoom(rawCode);
  if (room.host_id !== user.id) throw new ApiError(403, "not_host", "Only the host can start the match.");
  if (room.status === "playing") throw new ApiError(409, "in_progress", "A match is already running.");
  const members = (await loadMembers(room.id)).filter((m) => !m.left_at);
  const now = Date.now();
  const present = members.filter((m) => isOnline(m, now) || m.user_id === user.id);
  if (present.length < room.settings.minPlayers) {
    throw new ApiError(409, "not_enough_players", `This room needs at least ${room.settings.minPlayers} players online to start.`);
  }
  const notReady = present.filter((m) => m.role !== "host" && !m.is_ready);
  if (notReady.length) throw new ApiError(409, "not_ready", `Waiting for ${notReady.map((m) => m.display_name).join(", ")} to get ready.`);
  await ensureQuestionBank();

  const matchId = randomId();
  const settings = room.settings;
  const { questionIds } = selectQuestions(
    {
      mode: "quick",
      track: settings.track,
      sections: settings.sections,
      topics: settings.topics,
      difficulty: settings.difficulty,
      count: settings.questionCount,
      timeLimitSec: null,
      feedback: "end",
      hints: false,
    },
    `match:${matchId}`,
  );
  if (questionIds.length === 0) throw new ApiError(400, "no_questions", "No questions match this room's settings. Try a broader topic or difficulty.");

  const startedAt = new Date(now);
  const claimed = await tx(async (client) => {
    // Lock the room row: only one start can win, and it sees the latest status.
    const { rows } = await client.query<{ status: RoomRow["status"] }>("select status from public.multiplayer_rooms where id = $1 for update", [room.id]);
    if (rows[0]?.status === "playing") return false;
    await client.query(
      `insert into public.multiplayer_matches
         (id, room_id, round, phase, current_index, phase_started_at, phase_ends_at, question_count, seconds_per_question, scoring, settings, human_players, started_at)
       values ($1, $2, (select coalesce(max(round), 0) + 1 from public.multiplayer_matches where room_id = $2), 'countdown', 0, $3, $4, $5, $6, $7, $8::jsonb, $9, $3)`,
      [
        matchId,
        room.id,
        startedAt.toISOString(),
        new Date(now + COUNTDOWN_MS).toISOString(),
        questionIds.length,
        settings.secondsPerQuestion,
        settings.scoring,
        json(settings),
        present.length,
      ],
    );
    await client.query(
      "insert into public.match_questions (match_id, position, question_id) select $1, q.ord - 1, q.id from unnest($2::text[]) with ordinality as q(id, ord)",
      [matchId, questionIds],
    );
    await client.query(
      "insert into public.match_participants (match_id, user_id, display_name) select $1, p.user_id, p.display_name from unnest($2::uuid[], $3::text[]) as p(user_id, display_name)",
      [matchId, present.map((m) => m.user_id), present.map((m) => m.display_name)],
    );
    await client.query("update public.multiplayer_rooms set status = 'playing', current_match_id = $2, last_activity_at = $3 where id = $1", [
      room.id,
      matchId,
      startedAt.toISOString(),
    ]);
    await client.query("update public.room_members set is_ready = false where room_id = $1 and user_id <> $2", [room.id, room.host_id]);
    return true;
  });
  if (!claimed) throw new ApiError(409, "in_progress", "A match was just started.");
  return { matchId };
}

async function loadMatchBundle(matchId: string) {
  const [match, questions, participants, answers] = await Promise.all([
    maybeOne<MatchRow>("select * from public.multiplayer_matches where id = $1", [matchId]),
    query<{ position: number; question_id: string }>("select position, question_id from public.match_questions where match_id = $1 order by position", [matchId]),
    query<ParticipantRow>("select * from public.match_participants where match_id = $1", [matchId]),
    query<AnswerRow>("select * from public.match_answers where match_id = $1", [matchId]),
  ]);
  if (!match) throw new ApiError(404, "match_not_found", "That match no longer exists.");
  return { match, questionIds: questions.map((q) => q.question_id), participants, answers };
}

/**
 * Applies a due phase transition, if any. Conditional on the phase/index we
 * read, so concurrent callers can't double-advance. Returns true if changed.
 */
async function advanceIfDue(room: RoomRow, members: MemberRow[]): Promise<boolean> {
  if (!room.current_match_id) return false;
  const bundle = await loadMatchBundle(room.current_match_id);
  const { match, participants, answers } = bundle;
  if (match.phase === "finished") {
    if (!match.finalized_at) await finalizeMatch(room, bundle);
    return false;
  }
  const now = Date.now();
  const clock = clockOf(match);
  const connected = participants.filter((p) => {
    const m = members.find((mm) => mm.user_id === p.user_id);
    return m && isOnline(m, now);
  });
  const answeredNow = new Set(answers.filter((a) => a.position === match.current_index).map((a) => a.user_id));
  const allAnswered = connected.length > 0 && connected.every((p) => answeredNow.has(p.user_id));
  const next = nextClock(clock, allAnswered, now);
  if (!next) return false;

  const updated = await query<MatchRow>(
    `update public.multiplayer_matches
        set phase = $4, current_index = $5, phase_started_at = $6, phase_ends_at = $7, finished_at = $8
      where id = $1 and phase = $2 and current_index = $3
      returning *`,
    [
      match.id,
      match.phase,
      match.current_index,
      next.phase,
      next.index,
      new Date(next.phaseStartedAt).toISOString(),
      new Date(next.phaseEndsAt).toISOString(),
      next.phase === "finished" ? new Date(now).toISOString() : null,
    ],
  );
  if (!updated.length) return false; // someone else advanced first
  if (next.phase === "finished") await finalizeMatch(room, { ...bundle, match: updated[0]! });
  return true;
}

function bestStreakFor(userId: string, count: number, answers: AnswerRow[]): number {
  let best = 0;
  let run = 0;
  for (let i = 0; i < count; i++) {
    const a = answers.find((x) => x.user_id === userId && x.position === i);
    run = a?.is_correct ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

async function finalizeMatch(
  room: RoomRow,
  bundle: { match: MatchRow; participants: ParticipantRow[]; answers: AnswerRow[] },
) {
  const { match, participants, answers } = bundle;
  const ranked = rankStandings(
    participants.map((p) => ({ id: p.user_id, score: p.score, correct: p.correct, correctTimeMs: Number(p.correct_time_ms), joinedAt: p.joined_at, p })),
  );
  const humanPlayers = match.human_players;
  const userIds = participants.map((p) => p.user_id);
  const [history, earned, prefs] = await Promise.all([
    query<HistoryRow>(
      `select mp.user_id, mp.rank, m.finished_at, m.human_players
         from public.match_participants mp
         join public.multiplayer_matches m on m.id = mp.match_id
        where mp.user_id = any($1::uuid[]) and mp.match_id <> $2 and mp.rank is not null`,
      [userIds, match.id],
    ),
    query<{ user_id: string; achievement_id: string }>("select user_id, achievement_id from public.user_achievements where user_id = any($1::uuid[])", [userIds]),
    query<{ user_id: string; timezone: string }>("select user_id, timezone from public.user_preferences where user_id = any($1::uuid[])", [userIds]),
  ]);
  const finishedAt = match.finished_at ?? new Date().toISOString();

  const participantsPayload: { user_id: string; rank: number; best_streak: number; xp: number }[] = [];
  const xpPayload: { user_id: string; reason: string; amount: number }[] = [];
  const achievementPayload: { user_id: string; achievement_id: string }[] = [];
  const activityPayload: { user_id: string; activity_date: string; questions: number; correct: number; xp: number }[] = [];

  for (const r of ranked) {
    const p = r.p;
    const rewards = computeMatchRewards({ correctCount: p.correct, rank: r.rank, humanPlayers, answeredCount: p.answered });
    participantsPayload.push({ user_id: p.user_id, rank: r.rank, best_streak: bestStreakFor(p.user_id, match.question_count, answers), xp: rewards.total });
    for (const a of rewards.awards) xpPayload.push({ user_id: p.user_id, reason: a.reason, amount: a.amount });

    const past = history.filter((h) => h.user_id === p.user_id);
    const matches = [
      ...past.map((h) => ({ finishedAt: h.finished_at, won: h.rank === 1 && h.human_players >= 2, humanPlayers: h.human_players })),
      { finishedAt, won: r.rank === 1 && humanPlayers >= 2, humanPlayers },
    ].map((m, i) => ({ matchId: String(i), roomCode: null, kind: "online" as const, rank: 0, players: m.humanPlayers, score: 0, correct: 0, total: 0, xpTotal: 0, ...m }));
    const have = new Set(earned.filter((e) => e.user_id === p.user_id).map((e) => e.achievement_id));
    for (const id of qualifyingAchievements({ results: [], matches, weeklyMinutes: 0, weeklyGoalMinutes: 0, currentStreak: 0 })) {
      if (!have.has(id)) achievementPayload.push({ user_id: p.user_id, achievement_id: id });
    }
    const tz = prefs.find((x) => x.user_id === p.user_id)?.timezone ?? "UTC";
    activityPayload.push({ user_id: p.user_id, activity_date: localDateKey(finishedAt, tz), questions: p.answered, correct: p.correct, xp: rewards.total });
  }

  await tx(async (client: PoolClient) => {
    await client.query("select public.finalize_match($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb)", [
      match.id,
      json(participantsPayload),
      json(xpPayload),
      json(achievementPayload),
      json(activityPayload),
    ]);
    await client.query("update public.multiplayer_rooms set status = 'finished', last_activity_at = now() where id = $1 and current_match_id = $2", [room.id, match.id]);
  });
}

export async function submitMatchAnswer(user: AuthUser, rawCode: string, body: { matchId?: unknown; index?: unknown; response?: unknown }) {
  const room = await loadRoom(rawCode);
  if (typeof body.matchId !== "string" || body.matchId !== room.current_match_id) {
    throw new ApiError(409, "stale_match", "That match is no longer active.");
  }
  if (typeof body.index !== "number" || !Number.isInteger(body.index)) throw new ApiError(400, "invalid_input", "Missing question index.");
  const members = await loadMembers(room.id);
  requireMember(members, user.id, { active: true });

  const match = await maybeOne<MatchRow>("select * from public.multiplayer_matches where id = $1", [room.current_match_id]);
  if (!match) throw new ApiError(409, "stale_match", "That match is no longer active.");
  const now = Date.now();
  const check = canAcceptAnswer(clockOf(match), body.index, now);
  if (!check.ok) throw new ApiError(409, "answer_closed", check.reason);

  const mq = await maybeOne<{ question_id: string }>("select question_id from public.match_questions where match_id = $1 and position = $2", [match.id, body.index]);
  const question = mq ? getQuestion(mq.question_id) : undefined;
  if (!question) throw new ApiError(500, "missing_question", "This question is no longer available.");
  const response = sanitizeResponse(question, body.response);
  if (!response) throw new ApiError(400, "invalid_answer", "Choose an answer before submitting.");

  const correct = isResponseCorrect(question, response);
  const responseMs = Math.max(0, now - new Date(match.phase_started_at).getTime());
  const points = pointsFor(correct, responseMs, match.seconds_per_question * 1000, match.scoring);
  const recorded = await maybeOne<{ status: string }>("select public.record_match_answer($1, $2, $3, $4::jsonb, $5, $6, $7) as status", [
    match.id,
    body.index,
    user.id,
    json(response),
    correct,
    points,
    responseMs,
  ]);
  const status = recorded?.status;
  if (status === "duplicate") throw new ApiError(409, "duplicate_answer", "You already answered this question. Answers can't be changed.");
  if (status === "not_participant") throw new ApiError(403, "not_participant", "You joined after this match started, so you're spectating this round.");
  if (status !== "ok") throw new ApiError(409, "answer_closed", "Time is up for this question.");

  await query("update public.room_members set last_seen_at = now() where room_id = $1 and user_id = $2", [room.id, user.id]);
  const refreshedMembers = await loadMembers(room.id);
  await advanceIfDue(room, refreshedMembers);
  // Correctness is not revealed until the reveal phase.
  return { accepted: true };
}

export async function advanceRoom(user: AuthUser, rawCode: string) {
  const room = await loadRoom(rawCode);
  const members = await loadMembers(room.id);
  requireMember(members, user.id);
  const changed = await advanceIfDue(room, members);
  return { changed };
}

export async function getRoomState(user: AuthUser, rawCode: string): Promise<{ state: RoomState } | { preview: RoomPreview }> {
  let room = await loadRoom(rawCode);
  let members = await loadMembers(room.id);
  const me = members.find((m) => m.user_id === user.id);
  if (!me || me.left_at) return { preview: await previewRoom(room.code) };

  const now = Date.now();
  if (now - new Date(me.last_seen_at).getTime() > LAST_SEEN_THROTTLE_MS) {
    await query("update public.room_members set last_seen_at = $3 where room_id = $1 and user_id = $2", [room.id, user.id, new Date(now).toISOString()]);
    me.last_seen_at = new Date(now).toISOString();
  }
  // Lazy, server-validated progression: any member's poll can apply a due transition.
  if (room.status === "playing" && (await advanceIfDue(room, members))) {
    room = await loadRoom(room.code);
    members = await loadMembers(room.id);
  }

  const memberViews: RoomMemberView[] = members
    .filter((m) => !m.left_at)
    .map((m) => ({ userId: m.user_id, displayName: m.display_name, role: m.role, isReady: m.is_ready || m.role === "host", online: isOnline(m, now) || m.user_id === user.id, isMe: m.user_id === user.id }));

  const state: RoomState = {
    serverNow: Date.now(),
    room: { code: room.code, status: room.status, hostId: room.host_id, settings: room.settings, expiresAt: room.expires_at },
    me: { userId: user.id, displayName: me.display_name, isHost: room.host_id === user.id },
    members: memberViews,
    match: null,
  };

  if (room.current_match_id && (room.status === "playing" || room.status === "finished")) {
    const { match, questionIds, participants, answers } = await loadMatchBundle(room.current_match_id);
    const index = match.current_index;
    const showQuestion = match.phase === "question" || match.phase === "reveal";
    const qid = questionIds[index];
    const question = showQuestion && qid ? getQuestion(qid) : undefined;
    const mine = answers.find((a) => a.user_id === user.id && a.position === index);
    // During the question phase, standings exclude the current question's points so they reveal nothing.
    const hidden = match.phase === "question" ? index : match.phase === "countdown" ? 0 : Number.POSITIVE_INFINITY;
    const visibleScore = (p: ParticipantRow) =>
      answers.filter((a) => a.user_id === p.user_id && a.position < hidden).reduce((s, a) => s + a.points, 0);
    const visibleCorrect = (p: ParticipantRow) => answers.filter((a) => a.user_id === p.user_id && a.position < hidden && a.is_correct).length;
    const ranked = rankStandings(
      participants.map((p) => ({
        id: p.user_id,
        score: visibleScore(p),
        correct: visibleCorrect(p),
        correctTimeMs: answers.filter((a) => a.user_id === p.user_id && a.position < hidden && a.is_correct).reduce((s, a) => s + a.response_ms, 0),
        joinedAt: p.joined_at,
        p,
      })),
    );
    const finished = match.phase === "finished";
    const standings: StandingView[] = ranked.map((r) => {
      const last = answers.find((a) => a.user_id === r.id && a.position === index);
      return {
        userId: r.id,
        displayName: r.p.display_name,
        score: r.score,
        correct: r.correct,
        answered: answers.filter((a) => a.user_id === r.id && a.position < hidden).length,
        rank: finished && r.p.rank ? r.p.rank : r.rank,
        isMe: r.id === user.id,
        lastPoints: match.phase === "reveal" ? (last?.points ?? 0) : null,
        ...(finished
          ? { bestStreak: r.p.best_streak, fastestCorrectMs: r.p.fastest_correct_ms, xpAwarded: r.p.xp_awarded }
          : {}),
      };
    });

    state.match = {
      id: match.id,
      round: match.round,
      phase: match.phase,
      index,
      phaseStartedAt: new Date(match.phase_started_at).getTime(),
      phaseEndsAt: new Date(match.phase_ends_at).getTime(),
      questionCount: match.question_count,
      secondsPerQuestion: match.seconds_per_question,
      scoring: match.scoring,
      isParticipant: participants.some((p) => p.user_id === user.id),
      question: question ? toPublicQuestion(question) : null,
      myAnswer: mine?.response ?? null,
      answeredCount: answers.filter((a) => a.position === index).length,
      participantCount: participants.length,
      reveal:
        match.phase === "reveal" && question
          ? {
              correct: question.correct,
              correctText: formatCorrectAnswer(question),
              explanation: question.explanation,
              myCorrect: mine ? mine.is_correct : null,
              myPoints: mine?.points ?? 0,
              results: participants.map((p) => {
                const a = answers.find((x) => x.user_id === p.user_id && x.position === index);
                return { userId: p.user_id, displayName: p.display_name, correct: Boolean(a?.is_correct), points: a?.points ?? 0, answered: Boolean(a) };
              }),
            }
          : null,
      standings,
    };
  }
  return { state };
}
