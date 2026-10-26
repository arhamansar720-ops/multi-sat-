import type { SupabaseClient, User } from "@supabase/supabase-js";
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
import { ApiError } from "@/lib/supabase/server";
import { dbError } from "./http";
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

export async function broadcastRoom(admin: SupabaseClient, code: string, reason: string): Promise<void> {
  const channel = admin.channel(`room:${code}`, { config: { private: true } });
  try {
    await channel.httpSend("state", { reason, at: Date.now() }, { timeout: 3000 });
  } catch (err) {
    // Clients also poll, so a failed broadcast only delays updates.
    console.warn("[realtime] broadcast failed", err);
  } finally {
    await admin.removeChannel(channel);
  }
}

async function loadRoom(admin: SupabaseClient, rawCode: string): Promise<RoomRow> {
  const code = normalizeRoomCode(rawCode);
  if (!code) throw new ApiError(400, "invalid_code", "Room codes are 6 letters or numbers, like K7Q2MZ.");
  const { data, error } = await admin.from("multiplayer_rooms").select("*").eq("code", code).maybeSingle();
  if (error) dbError(error, "load room");
  const room = data as RoomRow | null;
  if (!room || room.status === "closed") throw new ApiError(404, "room_not_found", "We couldn't find an open room with that code. Check the code or ask your host for a new one.");
  if (new Date(room.expires_at).getTime() < Date.now()) {
    await admin.from("multiplayer_rooms").update({ status: "closed" }).eq("id", room.id);
    throw new ApiError(410, "room_expired", "This room has expired. Ask your host to create a new one.");
  }
  return room;
}

async function loadMembers(admin: SupabaseClient, roomId: string): Promise<MemberRow[]> {
  const { data, error } = await admin.from("room_members").select("*").eq("room_id", roomId).order("joined_at");
  if (error) dbError(error, "load members");
  return (data ?? []) as MemberRow[];
}

function requireMember(members: MemberRow[], userId: string, opts: { active?: boolean } = {}): MemberRow {
  const me = members.find((m) => m.user_id === userId);
  if (!me || (opts.active && me.left_at)) throw new ApiError(403, "not_member", "Join this room before taking that action.");
  return me;
}

async function touchRoom(admin: SupabaseClient, roomId: string, patch: Partial<RoomRow> = {}) {
  const expires = new Date(Date.now() + ROOM_TTL_HOURS * 3_600_000).toISOString();
  const { error } = await admin.from("multiplayer_rooms").update({ last_activity_at: new Date().toISOString(), expires_at: expires, ...patch }).eq("id", roomId);
  if (error) dbError(error, "touch room");
}

async function resolveDisplayName(admin: SupabaseClient, user: User, requested: unknown): Promise<string> {
  if (typeof requested === "string" && requested.trim()) return displayNameSchema.parse(requested);
  const { data } = await admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  return (data?.display_name as string | undefined) ?? "Player";
}

export async function createRoom(admin: SupabaseClient, user: User, body: { settings: unknown; displayName?: unknown }) {
  const settings = roomSettingsSchema.parse(body.settings);
  if (!getTrack(settings.track)) throw new ApiError(400, "unknown_track", "That exam or course does not exist.");
  const displayName = await resolveDisplayName(admin, user, body.displayName);
  await ensureQuestionBank(admin);

  // Durable spam protection: at most 10 rooms per user per hour.
  const { count, error: countError } = await admin
    .from("multiplayer_rooms")
    .select("id", { count: "exact", head: true })
    .eq("host_id", user.id)
    .gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
  if (countError) dbError(countError, "count rooms");
  if ((count ?? 0) >= 10) throw new ApiError(429, "rate_limited", "You've created several rooms recently. Reuse an existing room or try again in a bit.");

  if (Math.random() < 0.2) await admin.rpc("cleanup_stale_rooms");
  // Close this host's previous open lobbies so abandoned rooms don't pile up.
  await admin.from("multiplayer_rooms").update({ status: "closed" }).eq("host_id", user.id).eq("status", "lobby");

  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateRoomCode();
    const id = randomId();
    const { error } = await admin.from("multiplayer_rooms").insert({ id, code, host_id: user.id, settings });
    if (error) {
      if (error.code === "23505") continue; // code collision, try another
      dbError(error, "create room");
    }
    const { error: memberError } = await admin
      .from("room_members")
      .insert({ room_id: id, user_id: user.id, display_name: displayName, role: "host", is_ready: true });
    if (memberError) dbError(memberError, "add host");
    return { code };
  }
  throw new ApiError(503, "code_exhausted", "Couldn't generate a room code. Please try again.");
}

export async function previewRoom(admin: SupabaseClient, rawCode: string): Promise<RoomPreview> {
  const room = await loadRoom(admin, rawCode);
  const members = await loadMembers(admin, room.id);
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

export async function joinRoom(admin: SupabaseClient, user: User, rawCode: string, requestedName: unknown) {
  const room = await loadRoom(admin, rawCode);
  const members = await loadMembers(admin, room.id);
  const existing = members.find((m) => m.user_id === user.id);
  const displayName = await resolveDisplayName(admin, user, requestedName ?? existing?.display_name);
  const now = new Date().toISOString();

  if (existing) {
    // Reconnect: existing members can always come back to their room.
    const { error } = await admin
      .from("room_members")
      .update({ left_at: null, last_seen_at: now, display_name: displayName })
      .eq("room_id", room.id)
      .eq("user_id", user.id);
    if (error) dbError(error, "rejoin");
  } else {
    if (room.status === "playing") throw new ApiError(409, "in_progress", "A match is already in progress in this room. You can join when it ends.");
    const active = members.filter((m) => !m.left_at).length;
    if (active >= room.settings.maxPlayers) throw new ApiError(409, "room_full", `This room is full (${room.settings.maxPlayers} players).`);
    const { error } = await admin.from("room_members").insert({ room_id: room.id, user_id: user.id, display_name: displayName, role: "player" });
    if (error && error.code !== "23505") dbError(error, "join");
  }
  await touchRoom(admin, room.id);
  await broadcastRoom(admin, room.code, "join");
  return { code: room.code };
}

export async function setReady(admin: SupabaseClient, user: User, rawCode: string, ready: boolean) {
  const room = await loadRoom(admin, rawCode);
  const members = await loadMembers(admin, room.id);
  requireMember(members, user.id, { active: true });
  if (room.status === "playing") throw new ApiError(409, "in_progress", "You can't change ready status during a match.");
  const { error } = await admin.from("room_members").update({ is_ready: ready, last_seen_at: new Date().toISOString() }).eq("room_id", room.id).eq("user_id", user.id);
  if (error) dbError(error, "ready");
  await broadcastRoom(admin, room.code, "ready");
  return { ok: true };
}

export async function updateRoomSettings(admin: SupabaseClient, user: User, rawCode: string, rawSettings: unknown) {
  const room = await loadRoom(admin, rawCode);
  if (room.host_id !== user.id) throw new ApiError(403, "not_host", "Only the host can change room settings.");
  if (room.status === "playing") throw new ApiError(409, "in_progress", "Settings can't change during a match.");
  const settings = roomSettingsSchema.parse(rawSettings);
  if (!getTrack(settings.track)) throw new ApiError(400, "unknown_track", "That exam or course does not exist.");
  await touchRoom(admin, room.id, { settings });
  // Players must re-confirm readiness after settings change.
  await admin.from("room_members").update({ is_ready: false }).eq("room_id", room.id).neq("user_id", room.host_id);
  await broadcastRoom(admin, room.code, "settings");
}

export async function leaveRoom(admin: SupabaseClient, user: User, rawCode: string) {
  const room = await loadRoom(admin, rawCode);
  const members = await loadMembers(admin, room.id);
  requireMember(members, user.id);
  const now = new Date().toISOString();
  const { error } = await admin.from("room_members").update({ left_at: now, is_ready: false }).eq("room_id", room.id).eq("user_id", user.id);
  if (error) dbError(error, "leave");
  if (room.host_id === user.id) {
    const nextHost = members.find((m) => m.user_id !== user.id && !m.left_at);
    if (nextHost) {
      await admin.from("room_members").update({ role: "player" }).eq("room_id", room.id).eq("user_id", user.id);
      await admin.from("room_members").update({ role: "host", is_ready: true }).eq("room_id", room.id).eq("user_id", nextHost.user_id);
      await touchRoom(admin, room.id, { host_id: nextHost.user_id });
    } else {
      await admin.from("multiplayer_rooms").update({ status: "closed" }).eq("id", room.id);
    }
  }
  await broadcastRoom(admin, room.code, "leave");
  return { ok: true };
}

export async function startMatch(admin: SupabaseClient, user: User, rawCode: string) {
  const room = await loadRoom(admin, rawCode);
  if (room.host_id !== user.id) throw new ApiError(403, "not_host", "Only the host can start the match.");
  if (room.status === "playing") throw new ApiError(409, "in_progress", "A match is already running.");
  const members = (await loadMembers(admin, room.id)).filter((m) => !m.left_at);
  const now = Date.now();
  const present = members.filter((m) => isOnline(m, now) || m.user_id === user.id);
  if (present.length < room.settings.minPlayers) {
    throw new ApiError(409, "not_enough_players", `This room needs at least ${room.settings.minPlayers} players online to start.`);
  }
  const notReady = present.filter((m) => m.role !== "host" && !m.is_ready);
  if (notReady.length) throw new ApiError(409, "not_ready", `Waiting for ${notReady.map((m) => m.display_name).join(", ")} to get ready.`);
  await ensureQuestionBank(admin);

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

  const { data: prev } = await admin.from("multiplayer_matches").select("round").eq("room_id", room.id).order("round", { ascending: false }).limit(1).maybeSingle();
  const startedAt = new Date(now);
  const { error: matchError } = await admin.from("multiplayer_matches").insert({
    id: matchId,
    room_id: room.id,
    round: ((prev?.round as number | undefined) ?? 0) + 1,
    phase: "countdown",
    current_index: 0,
    phase_started_at: startedAt.toISOString(),
    phase_ends_at: new Date(now + COUNTDOWN_MS).toISOString(),
    question_count: questionIds.length,
    seconds_per_question: settings.secondsPerQuestion,
    scoring: settings.scoring,
    settings,
    human_players: present.length,
    started_at: startedAt.toISOString(),
  });
  if (matchError) {
    if (matchError.code === "23505") throw new ApiError(409, "in_progress", "A match was just started.");
    dbError(matchError, "create match");
  }
  const { error: qError } = await admin.from("match_questions").insert(questionIds.map((qid, position) => ({ match_id: matchId, position, question_id: qid })));
  if (qError) dbError(qError, "match questions");
  const { error: pError } = await admin
    .from("match_participants")
    .insert(present.map((m) => ({ match_id: matchId, user_id: m.user_id, display_name: m.display_name })));
  if (pError) dbError(pError, "participants");
  // Only one match can be current: this conditional update fails if another start won the race.
  const { data: claimed, error: roomError } = await admin
    .from("multiplayer_rooms")
    .update({ status: "playing", current_match_id: matchId, last_activity_at: startedAt.toISOString() })
    .eq("id", room.id)
    .neq("status", "playing")
    .select("id");
  if (roomError) dbError(roomError, "start room");
  if (!claimed?.length) {
    await admin.from("multiplayer_matches").delete().eq("id", matchId);
    throw new ApiError(409, "in_progress", "A match was just started.");
  }
  await admin.from("room_members").update({ is_ready: false }).eq("room_id", room.id).neq("user_id", room.host_id);
  await broadcastRoom(admin, room.code, "start");
  return { matchId };
}

async function loadMatchBundle(admin: SupabaseClient, matchId: string) {
  const [match, questions, participants, answers] = await Promise.all([
    admin.from("multiplayer_matches").select("*").eq("id", matchId).single(),
    admin.from("match_questions").select("position, question_id").eq("match_id", matchId).order("position"),
    admin.from("match_participants").select("*").eq("match_id", matchId),
    admin.from("match_answers").select("*").eq("match_id", matchId),
  ]);
  for (const r of [match, questions, participants, answers]) if (r.error) dbError(r.error, "load match");
  return {
    match: match.data as MatchRow,
    questionIds: ((questions.data ?? []) as { position: number; question_id: string }[]).map((q) => q.question_id),
    participants: (participants.data ?? []) as ParticipantRow[],
    answers: (answers.data ?? []) as AnswerRow[],
  };
}

/**
 * Applies a due phase transition, if any. Conditional on the phase/index we
 * read, so concurrent callers can't double-advance. Returns true if changed.
 */
async function advanceIfDue(admin: SupabaseClient, room: RoomRow, members: MemberRow[]): Promise<boolean> {
  if (!room.current_match_id) return false;
  const bundle = await loadMatchBundle(admin, room.current_match_id);
  const { match, participants, answers } = bundle;
  if (match.phase === "finished") {
    if (!match.finalized_at) await finalizeMatch(admin, room, bundle);
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

  const { data: updated, error } = await admin
    .from("multiplayer_matches")
    .update({
      phase: next.phase,
      current_index: next.index,
      phase_started_at: new Date(next.phaseStartedAt).toISOString(),
      phase_ends_at: new Date(next.phaseEndsAt).toISOString(),
      finished_at: next.phase === "finished" ? new Date(now).toISOString() : null,
    })
    .eq("id", match.id)
    .eq("phase", match.phase)
    .eq("current_index", match.current_index)
    .select("*");
  if (error) dbError(error, "advance");
  if (!updated?.length) return false; // someone else advanced first
  if (next.phase === "finished") await finalizeMatch(admin, room, { ...bundle, match: updated[0] as MatchRow });
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
  admin: SupabaseClient,
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
    admin
      .from("match_participants")
      .select("user_id, rank, multiplayer_matches!inner(finished_at, human_players, finalized_at)")
      .in("user_id", userIds)
      .neq("match_id", match.id)
      .not("rank", "is", null),
    admin.from("user_achievements").select("user_id, achievement_id").in("user_id", userIds),
    admin.from("user_preferences").select("user_id, timezone").in("user_id", userIds),
  ]);
  type HistoryRow = { user_id: string; rank: number; multiplayer_matches: { finished_at: string; human_players: number } };
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

    const past = ((history.data ?? []) as unknown as HistoryRow[]).filter((h) => h.user_id === p.user_id);
    const matches = [
      ...past.map((h) => ({ finishedAt: h.multiplayer_matches.finished_at, won: h.rank === 1 && h.multiplayer_matches.human_players >= 2, humanPlayers: h.multiplayer_matches.human_players })),
      { finishedAt, won: r.rank === 1 && humanPlayers >= 2, humanPlayers },
    ].map((m, i) => ({ matchId: String(i), roomCode: null, kind: "online" as const, rank: 0, players: m.humanPlayers, score: 0, correct: 0, total: 0, xpTotal: 0, ...m }));
    const have = new Set(((earned.data ?? []) as { user_id: string; achievement_id: string }[]).filter((e) => e.user_id === p.user_id).map((e) => e.achievement_id));
    for (const id of qualifyingAchievements({ results: [], matches, weeklyMinutes: 0, weeklyGoalMinutes: 0, currentStreak: 0 })) {
      if (!have.has(id)) achievementPayload.push({ user_id: p.user_id, achievement_id: id });
    }
    const tz = ((prefs.data ?? []) as { user_id: string; timezone: string }[]).find((x) => x.user_id === p.user_id)?.timezone ?? "UTC";
    activityPayload.push({ user_id: p.user_id, activity_date: localDateKey(finishedAt, tz), questions: p.answered, correct: p.correct, xp: rewards.total });
  }

  const { error } = await admin.rpc("finalize_match", {
    p_match_id: match.id,
    p_participants: participantsPayload,
    p_xp: xpPayload,
    p_achievements: achievementPayload,
    p_activity: activityPayload,
  });
  if (error) dbError(error, "finalize match");
  await admin.from("multiplayer_rooms").update({ status: "finished", last_activity_at: new Date().toISOString() }).eq("id", room.id).eq("current_match_id", match.id);
}

export async function submitMatchAnswer(admin: SupabaseClient, user: User, rawCode: string, body: { matchId?: unknown; index?: unknown; response?: unknown }) {
  const room = await loadRoom(admin, rawCode);
  if (typeof body.matchId !== "string" || body.matchId !== room.current_match_id) {
    throw new ApiError(409, "stale_match", "That match is no longer active.");
  }
  if (typeof body.index !== "number" || !Number.isInteger(body.index)) throw new ApiError(400, "invalid_input", "Missing question index.");
  const members = await loadMembers(admin, room.id);
  requireMember(members, user.id, { active: true });

  const { data: matchData, error: matchError } = await admin.from("multiplayer_matches").select("*").eq("id", room.current_match_id).single();
  if (matchError) dbError(matchError, "load match");
  const match = matchData as MatchRow;
  const now = Date.now();
  const check = canAcceptAnswer(clockOf(match), body.index, now);
  if (!check.ok) throw new ApiError(409, "answer_closed", check.reason);

  const { data: mq, error: mqError } = await admin.from("match_questions").select("question_id").eq("match_id", match.id).eq("position", body.index).single();
  if (mqError) dbError(mqError, "load match question");
  const question = getQuestion(mq.question_id as string);
  if (!question) throw new ApiError(500, "missing_question", "This question is no longer available.");
  const response = sanitizeResponse(question, body.response);
  if (!response) throw new ApiError(400, "invalid_answer", "Choose an answer before submitting.");

  const correct = isResponseCorrect(question, response);
  const responseMs = Math.max(0, now - new Date(match.phase_started_at).getTime());
  const points = pointsFor(correct, responseMs, match.seconds_per_question * 1000, match.scoring);
  const { data: status, error } = await admin.rpc("record_match_answer", {
    p_match_id: match.id,
    p_position: body.index,
    p_user_id: user.id,
    p_response: response,
    p_is_correct: correct,
    p_points: points,
    p_response_ms: responseMs,
  });
  if (error) dbError(error, "record answer");
  if (status === "duplicate") throw new ApiError(409, "duplicate_answer", "You already answered this question. Answers can't be changed.");
  if (status === "not_participant") throw new ApiError(403, "not_participant", "You joined after this match started, so you're spectating this round.");
  if (status !== "ok") throw new ApiError(409, "answer_closed", "Time is up for this question.");

  await admin.from("room_members").update({ last_seen_at: new Date().toISOString() }).eq("room_id", room.id).eq("user_id", user.id);
  const refreshedMembers = await loadMembers(admin, room.id);
  await advanceIfDue(admin, room, refreshedMembers);
  await broadcastRoom(admin, room.code, "answer");
  // Correctness is not revealed until the reveal phase.
  return { accepted: true };
}

export async function advanceRoom(admin: SupabaseClient, user: User, rawCode: string) {
  const room = await loadRoom(admin, rawCode);
  const members = await loadMembers(admin, room.id);
  requireMember(members, user.id);
  const changed = await advanceIfDue(admin, room, members);
  if (changed) await broadcastRoom(admin, room.code, "advance");
  return { changed };
}

export async function getRoomState(admin: SupabaseClient, user: User, rawCode: string): Promise<{ state: RoomState } | { preview: RoomPreview }> {
  let room = await loadRoom(admin, rawCode);
  let members = await loadMembers(admin, room.id);
  const me = members.find((m) => m.user_id === user.id);
  if (!me || me.left_at) return { preview: await previewRoom(admin, room.code) };

  const now = Date.now();
  if (now - new Date(me.last_seen_at).getTime() > LAST_SEEN_THROTTLE_MS) {
    await admin.from("room_members").update({ last_seen_at: new Date(now).toISOString() }).eq("room_id", room.id).eq("user_id", user.id);
    me.last_seen_at = new Date(now).toISOString();
  }
  // Lazy, server-validated progression: any member's poll can apply a due transition.
  if (room.status === "playing" && (await advanceIfDue(admin, room, members))) {
    await broadcastRoom(admin, room.code, "advance");
    room = await loadRoom(admin, room.code);
    members = await loadMembers(admin, room.id);
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
    const { match, questionIds, participants, answers } = await loadMatchBundle(admin, room.current_match_id);
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
