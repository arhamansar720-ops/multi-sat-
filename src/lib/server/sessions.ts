import { getTrack } from "@/lib/content/catalog";
import { randomId } from "@/lib/content/random";
import { finalizeSession, isLate, rewardContextFromHistory } from "@/lib/engine/finalize";
import { deadlineFor, normalizeConfig, selectQuestions, sessionTitle } from "@/lib/engine/selection";
import {
  DEFAULT_PREFERENCES,
  sessionConfigSchema,
  type EarnedAchievement,
  type MatchSummary,
  type PracticeSession,
  type Preferences,
  type SessionDraft,
  type SessionResult,
  type UserActivity,
  type XpEntry,
  type XpReason,
} from "@/lib/engine/types";
import { newAchievements } from "@/lib/progression/achievements";
import { localDateKey, safeTimeZone } from "@/lib/progression/dates";
import { computeProgress } from "@/lib/progression/stats";
import { XP_RULES } from "@/lib/progression/xp";
import type { AuthUser } from "./auth";
import { json, maybeOne, query } from "./db";
import { ApiError } from "./errors";
import { ensureQuestionBank } from "./question-sync";

interface SessionRow {
  id: string;
  user_id: string;
  title: string;
  config: PracticeSession["config"];
  question_ids: string[];
  daily_key: string | null;
  status: "in_progress" | "completed" | "abandoned";
  started_at: string;
  deadline: string | null;
  draft: SessionDraft | null;
  draft_saved_at: string | null;
  result: SessionResult | null;
}

interface MatchRow {
  match_id: string;
  score: number;
  correct: number;
  rank: number;
  xp_awarded: number;
  finished_at: string;
  question_count: number;
  human_players: number;
  room_code: string | null;
}

function toSession(row: SessionRow): PracticeSession {
  return {
    id: row.id,
    title: row.title,
    config: row.config,
    questionIds: row.question_ids,
    startedAt: row.started_at,
    deadline: row.deadline,
    status: row.status === "completed" ? "completed" : "in_progress",
    dailyKey: row.daily_key ?? undefined,
  };
}

export async function createSessionForUser(user: AuthUser, rawConfig: unknown): Promise<PracticeSession> {
  const config = normalizeConfig(sessionConfigSchema.parse(rawConfig));
  if (!getTrack(config.track)) throw new ApiError(400, "unknown_track", "That exam or course does not exist.");
  await ensureQuestionBank();

  // Durable spam guard: limit how many sessions can be started per hour.
  const recent = await maybeOne<{ n: number }>(
    "select count(*)::int as n from public.study_sessions where user_id = $1 and created_at >= now() - interval '1 hour'",
    [user.id],
  );
  if ((recent?.n ?? 0) >= 120) throw new ApiError(429, "rate_limited", "You've started a lot of sessions this hour. Take a short break and try again.");

  const now = new Date();
  const id = randomId();
  const { questionIds, dailyKey } = selectQuestions(config, `${user.id}:${id}`, now);
  if (questionIds.length === 0) throw new ApiError(400, "no_questions", "No questions match those filters yet. Try broadening your selection.");

  const row = await maybeOne<SessionRow>(
    `insert into public.study_sessions (id, user_id, mode, track, title, config, question_ids, daily_key, started_at, deadline)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10) returning *`,
    [
      id,
      user.id,
      config.mode,
      config.track,
      sessionTitle(config),
      json({ ...config, count: questionIds.length }),
      questionIds,
      dailyKey ?? null,
      now.toISOString(),
      deadlineFor(now, config.timeLimitSec),
    ],
  );
  return toSession(row!);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadOwnSession(userId: string, sessionId: string): Promise<SessionRow | null> {
  if (!UUID_RE.test(sessionId)) return null;
  return maybeOne<SessionRow>("select * from public.study_sessions where id = $1 and user_id = $2", [sessionId, userId]);
}

export async function getSessionForUser(user: AuthUser, sessionId: string) {
  const row = await loadOwnSession(user.id, sessionId);
  if (!row) return null;
  return { session: toSession(row), draft: row.draft, result: row.result };
}

export async function listInProgressForUser(user: AuthUser): Promise<PracticeSession[]> {
  const rows = await query<SessionRow>(
    "select * from public.study_sessions where user_id = $1 and status = 'in_progress' order by created_at desc limit 5",
    [user.id],
  );
  return rows.map(toSession);
}

const draftSchemaLimit = 60_000;

export async function saveDraftForUser(user: AuthUser, sessionId: string, draft: SessionDraft) {
  const serialized = JSON.stringify(draft);
  if (serialized.length > draftSchemaLimit) throw new ApiError(413, "too_large", "Draft is too large.");
  const row = await loadOwnSession(user.id, sessionId);
  if (!row) throw new ApiError(404, "not_found", "Session not found.");
  if (row.status !== "in_progress") return { saved: false, reason: "completed" as const };
  // After the deadline (plus grace) the draft is frozen: answers can no longer change.
  if (isLate(toSession(row), new Date())) return { saved: false, reason: "deadline" as const };
  await query("update public.study_sessions set draft = $3::jsonb, draft_saved_at = now() where id = $1 and user_id = $2 and status = 'in_progress'", [
    sessionId,
    user.id,
    serialized,
  ]);
  return { saved: true as const };
}

/** Loads everything progress calculations need for one user. */
export async function loadActivity(user: AuthUser, opts: { sinceDays?: number } = {}): Promise<UserActivity> {
  const since = opts.sinceDays ? new Date(Date.now() - opts.sinceDays * 86_400_000).toISOString() : null;
  const [sessions, ledger, achievements, saved, prefRows, profileRows, matches] = await Promise.all([
    query<{ result: SessionResult }>(
      `select result from public.study_sessions
        where user_id = $1 and status = 'completed' and ($2::timestamptz is null or completed_at >= $2)
        order by completed_at desc limit 500`,
      [user.id, since],
    ),
    query<{ id: number; amount: number; reason: XpReason; source_id: string; created_at: string }>(
      `select id, amount, reason, source_id, created_at from public.xp_transactions
        where user_id = $1 and ($2::timestamptz is null or created_at >= $2)
        order by created_at desc limit 5000`,
      [user.id, since],
    ),
    query<{ achievement_id: string; earned_at: string }>("select achievement_id, earned_at from public.user_achievements where user_id = $1", [user.id]),
    query<{ question_id: string }>("select question_id from public.saved_questions where user_id = $1", [user.id]),
    query<Record<string, unknown>>("select * from public.user_preferences where user_id = $1", [user.id]),
    query<Record<string, unknown>>("select * from public.profiles where id = $1", [user.id]),
    query<MatchRow>(
      `select mp.match_id, mp.score, mp.correct, mp.rank, mp.xp_awarded,
              m.finished_at, m.question_count, m.human_players, r.code as room_code
         from public.match_participants mp
         join public.multiplayer_matches m on m.id = mp.match_id
         left join public.multiplayer_rooms r on r.id = m.room_id
        where mp.user_id = $1 and mp.rank is not null
        limit 500`,
      [user.id],
    ),
  ]);

  const p = prefRows[0] ?? null;
  const pr = profileRows[0] ?? null;
  const preferences: Preferences = {
    ...DEFAULT_PREFERENCES,
    displayName: (pr?.display_name as string) ?? DEFAULT_PREFERENCES.displayName,
    leaderboardOptIn: (pr?.leaderboard_opt_in as boolean) ?? true,
    shareActivityWithFriends: (pr?.share_activity_with_friends as boolean) ?? true,
    tracks: (p?.tracks as string[]) ?? DEFAULT_PREFERENCES.tracks,
    classes: (p?.classes as string[]) ?? [],
    targetDate: (p?.target_date as string | null) ?? null,
    targetScore: (p?.target_score as number | null) ?? null,
    dailyMinutes: (p?.daily_minutes as number) ?? DEFAULT_PREFERENCES.dailyMinutes,
    focusSkills: (p?.focus_skills as string[]) ?? [],
    timezone: safeTimeZone(p?.timezone as string),
    onboarded: (p?.onboarded as boolean) ?? false,
    reminderEmails: (p?.reminder_emails as boolean) ?? false,
  };

  const matchSummaries: MatchSummary[] = matches.map((m) => ({
    matchId: m.match_id,
    roomCode: m.room_code,
    kind: "online",
    finishedAt: m.finished_at,
    rank: m.rank,
    players: m.human_players,
    humanPlayers: m.human_players,
    score: m.score,
    correct: m.correct,
    total: m.question_count,
    won: m.rank === 1 && m.human_players >= 2,
    xpTotal: m.xp_awarded,
  }));

  return {
    results: sessions.map((s) => s.result).filter(Boolean),
    matches: matchSummaries,
    xpLedger: ledger.map((e) => ({
      id: String(e.id),
      amount: e.amount,
      reason: e.reason,
      sourceId: e.source_id,
      createdAt: e.created_at,
    })) satisfies XpEntry[],
    achievements: achievements.map((a) => ({
      id: a.achievement_id,
      earnedAt: a.earned_at,
    })) satisfies EarnedAchievement[],
    saved: saved.map((s) => s.question_id),
    preferences,
  };
}

/**
 * Grades and completes a session exactly once. If the session is already
 * complete, returns the stored result (idempotent resubmission).
 */
export async function submitSessionForUser(
  user: AuthUser,
  sessionId: string,
  submitted: Pick<SessionDraft, "answers" | "flagged" | "timeSpentMs">,
): Promise<SessionResult> {
  await ensureQuestionBank();
  const row = await loadOwnSession(user.id, sessionId);
  if (!row) throw new ApiError(404, "not_found", "Session not found.");
  if (row.status === "completed" && row.result) return row.result;

  const session = toSession(row);
  const now = new Date();
  // Late submissions are graded from the last draft saved before the deadline,
  // so answers cannot be changed after time expires.
  const late = isLate(session, now);
  const source = late ? (row.draft ?? { answers: {}, flagged: [], timeSpentMs: {} }) : submitted;

  const activity = await loadActivity(user, { sinceDays: XP_RULES.freshWindowDays + 1 });
  const ctx = rewardContextFromHistory({ ...activity, timezone: activity.preferences.timezone }, session, now);
  if (session.config.mode === "timed") {
    const best = await maybeOne<{ challenge_score: number | null }>(
      `select challenge_score from public.study_sessions
        where user_id = $1 and mode = 'timed' and track = $2 and total = $3 and status = 'completed'
        order by challenge_score desc nulls last limit 1`,
      [user.id, session.config.track, session.questionIds.length],
    );
    ctx.previousBest = (best?.challenge_score as number | null | undefined) ?? null;
  }
  const result = finalizeSession(session, source, ctx, now);

  // Achievements are evaluated against complete history plus this result.
  const history = await loadActivity(user);
  const after: UserActivity = {
    ...history,
    results: [result, ...history.results],
    xpLedger: [
      ...result.xp.map((a, i) => ({ id: `new-${i}`, amount: a.amount, reason: a.reason, sourceId: session.id, createdAt: result.completedAt })),
      ...history.xpLedger,
    ],
  };
  const snapshot = computeProgress(after, now);
  result.newAchievements = newAchievements(
    {
      results: after.results,
      matches: after.matches,
      weeklyMinutes: snapshot.week.minutes,
      weeklyGoalMinutes: snapshot.week.goalMinutes,
      currentStreak: snapshot.streak.current,
    },
    history.achievements,
  );

  const answers = result.items.map((item, position) => ({
    question_id: item.questionId,
    position,
    response: item.response,
    is_correct: item.correct,
    time_ms: item.timeMs,
    flagged: item.flagged,
  }));
  const completed = await maybeOne<{ ok: boolean }>(
    "select public.complete_study_session($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7, $8) as ok",
    [
      session.id,
      user.id,
      json(result),
      json(answers),
      json(result.xp.map((a) => ({ reason: a.reason, amount: a.amount }))),
      result.xpQuestionIds,
      result.newAchievements,
      localDateKey(now, activity.preferences.timezone),
    ],
  );
  // Either we completed it, or a concurrent request did: return the stored version.
  const stored = await maybeOne<{ result: SessionResult | null }>("select result from public.study_sessions where id = $1", [session.id]);
  if (!completed?.ok && !stored?.result) throw new ApiError(409, "conflict", "This session could not be completed. Please refresh.");
  return stored?.result ?? result;
}
