import type { SupabaseClient, User } from "@supabase/supabase-js";
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
import { ApiError } from "@/lib/supabase/server";
import { dbError } from "./http";
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

export async function createSessionForUser(admin: SupabaseClient, user: User, rawConfig: unknown): Promise<PracticeSession> {
  const config = normalizeConfig(sessionConfigSchema.parse(rawConfig));
  if (!getTrack(config.track)) throw new ApiError(400, "unknown_track", "That exam or course does not exist.");
  await ensureQuestionBank(admin);

  // Durable spam guard: limit how many sessions can be started per hour.
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count, error: countError } = await admin
    .from("study_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since);
  if (countError) dbError(countError, "count sessions");
  if ((count ?? 0) >= 120) throw new ApiError(429, "rate_limited", "You've started a lot of sessions this hour. Take a short break and try again.");

  const now = new Date();
  const id = randomId();
  const { questionIds, dailyKey } = selectQuestions(config, `${user.id}:${id}`, now);
  if (questionIds.length === 0) throw new ApiError(400, "no_questions", "No questions match those filters yet. Try broadening your selection.");

  const row = {
    id,
    user_id: user.id,
    mode: config.mode,
    track: config.track,
    title: sessionTitle(config),
    config: { ...config, count: questionIds.length },
    question_ids: questionIds,
    daily_key: dailyKey ?? null,
    started_at: now.toISOString(),
    deadline: deadlineFor(now, config.timeLimitSec),
  };
  const { data, error } = await admin.from("study_sessions").insert(row).select("*").single();
  if (error) dbError(error, "insert session");
  return toSession(data as SessionRow);
}

export async function getSessionForUser(userDb: SupabaseClient, sessionId: string) {
  // RLS restricts this to the caller's own sessions.
  const { data, error } = await userDb.from("study_sessions").select("*").eq("id", sessionId).maybeSingle();
  if (error) {
    if (error.code === "22P02") return null; // invalid uuid
    dbError(error, "get session");
  }
  if (!data) return null;
  const row = data as SessionRow;
  return { session: toSession(row), draft: row.draft, result: row.result };
}

export async function listInProgressForUser(userDb: SupabaseClient): Promise<PracticeSession[]> {
  const { data, error } = await userDb
    .from("study_sessions")
    .select("*")
    .eq("status", "in_progress")
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) dbError(error, "list in-progress");
  return ((data ?? []) as SessionRow[]).map(toSession);
}

const draftSchemaLimit = 60_000;

export async function saveDraftForUser(admin: SupabaseClient, user: User, sessionId: string, draft: SessionDraft) {
  const serialized = JSON.stringify(draft);
  if (serialized.length > draftSchemaLimit) throw new ApiError(413, "too_large", "Draft is too large.");
  const { data, error } = await admin
    .from("study_sessions")
    .select("id, status, deadline, started_at, config, question_ids, title, daily_key, draft, draft_saved_at, result, user_id")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) dbError(error, "load session for draft");
  if (!data) throw new ApiError(404, "not_found", "Session not found.");
  const row = data as SessionRow;
  if (row.status !== "in_progress") return { saved: false, reason: "completed" as const };
  // After the deadline (plus grace) the draft is frozen: answers can no longer change.
  if (isLate(toSession(row), new Date())) return { saved: false, reason: "deadline" as const };
  const { error: updateError } = await admin
    .from("study_sessions")
    .update({ draft, draft_saved_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("status", "in_progress");
  if (updateError) dbError(updateError, "save draft");
  return { saved: true as const };
}

/** Loads everything progress calculations need, through the user's RLS-scoped client. */
export async function loadActivity(userDb: SupabaseClient, user: User, opts: { sinceDays?: number } = {}): Promise<UserActivity> {
  const since = opts.sinceDays ? new Date(Date.now() - opts.sinceDays * 86_400_000).toISOString() : null;
  let sessionsQuery = userDb
    .from("study_sessions")
    .select("result, completed_at")
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(500);
  if (since) sessionsQuery = sessionsQuery.gte("completed_at", since);
  let ledgerQuery = userDb.from("xp_transactions").select("id, amount, reason, source_id, created_at").order("created_at", { ascending: false }).limit(5000);
  if (since) ledgerQuery = ledgerQuery.gte("created_at", since);

  const [sessions, ledger, achievements, saved, prefs, profile, matches] = await Promise.all([
    sessionsQuery,
    ledgerQuery,
    userDb.from("user_achievements").select("achievement_id, earned_at"),
    userDb.from("saved_questions").select("question_id"),
    userDb.from("user_preferences").select("*").eq("user_id", user.id).maybeSingle(),
    userDb.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    userDb
      .from("match_participants")
      .select("match_id, score, correct, rank, xp_awarded, multiplayer_matches!inner(finished_at, question_count, human_players, finalized_at, room_id, multiplayer_rooms!multiplayer_matches_room_id_fkey(code))")
      .not("rank", "is", null)
      .limit(500),
  ]);
  for (const [res, label] of [
    [sessions, "sessions"],
    [ledger, "ledger"],
    [achievements, "achievements"],
    [saved, "saved"],
    [prefs, "preferences"],
    [profile, "profile"],
    [matches, "matches"],
  ] as const) {
    if (res.error) dbError(res.error, `load ${label}`);
  }

  const p = prefs.data as Record<string, unknown> | null;
  const pr = profile.data as Record<string, unknown> | null;
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

  type MatchRow = {
    match_id: string;
    score: number;
    correct: number;
    rank: number;
    xp_awarded: number;
    multiplayer_matches: { finished_at: string; question_count: number; human_players: number; multiplayer_rooms: { code: string } | null };
  };
  const matchSummaries: MatchSummary[] = ((matches.data ?? []) as unknown as MatchRow[]).map((m) => ({
    matchId: m.match_id,
    roomCode: m.multiplayer_matches.multiplayer_rooms?.code ?? null,
    kind: "online",
    finishedAt: m.multiplayer_matches.finished_at,
    rank: m.rank,
    players: m.multiplayer_matches.human_players,
    humanPlayers: m.multiplayer_matches.human_players,
    score: m.score,
    correct: m.correct,
    total: m.multiplayer_matches.question_count,
    won: m.rank === 1 && m.multiplayer_matches.human_players >= 2,
    xpTotal: m.xp_awarded,
  }));

  return {
    results: ((sessions.data ?? []) as { result: SessionResult }[]).map((s) => s.result).filter(Boolean),
    matches: matchSummaries,
    xpLedger: ((ledger.data ?? []) as { id: number; amount: number; reason: XpReason; source_id: string; created_at: string }[]).map((e) => ({
      id: String(e.id),
      amount: e.amount,
      reason: e.reason,
      sourceId: e.source_id,
      createdAt: e.created_at,
    })) satisfies XpEntry[],
    achievements: ((achievements.data ?? []) as { achievement_id: string; earned_at: string }[]).map((a) => ({
      id: a.achievement_id,
      earnedAt: a.earned_at,
    })) satisfies EarnedAchievement[],
    saved: ((saved.data ?? []) as { question_id: string }[]).map((s) => s.question_id),
    preferences,
  };
}

/**
 * Grades and completes a session exactly once. If the session is already
 * complete, returns the stored result (idempotent resubmission).
 */
export async function submitSessionForUser(
  admin: SupabaseClient,
  userDb: SupabaseClient,
  user: User,
  sessionId: string,
  submitted: Pick<SessionDraft, "answers" | "flagged" | "timeSpentMs">,
): Promise<SessionResult> {
  await ensureQuestionBank(admin);
  const { data, error } = await admin.from("study_sessions").select("*").eq("id", sessionId).eq("user_id", user.id).maybeSingle();
  if (error) dbError(error, "load session");
  if (!data) throw new ApiError(404, "not_found", "Session not found.");
  const row = data as SessionRow;
  if (row.status === "completed" && row.result) return row.result;

  const session = toSession(row);
  const now = new Date();
  // Late submissions are graded from the last draft saved before the deadline,
  // so answers cannot be changed after time expires.
  const late = isLate(session, now);
  const source = late ? (row.draft ?? { answers: {}, flagged: [], timeSpentMs: {} }) : submitted;

  const activity = await loadActivity(userDb, user, { sinceDays: XP_RULES.freshWindowDays + 1 });
  const ctx = rewardContextFromHistory({ ...activity, timezone: activity.preferences.timezone }, session, now);
  if (session.config.mode === "timed") {
    const { data: best } = await admin
      .from("study_sessions")
      .select("challenge_score")
      .eq("user_id", user.id)
      .eq("mode", "timed")
      .eq("track", session.config.track)
      .eq("total", session.questionIds.length)
      .eq("status", "completed")
      .order("challenge_score", { ascending: false })
      .limit(1)
      .maybeSingle();
    ctx.previousBest = (best?.challenge_score as number | null | undefined) ?? null;
  }
  const result = finalizeSession(session, source, ctx, now);

  // Achievements are evaluated against complete history plus this result.
  const history = await loadActivity(userDb, user);
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
  const { data: completed, error: rpcError } = await admin.rpc("complete_study_session", {
    p_session_id: session.id,
    p_user_id: user.id,
    p_result: result,
    p_answers: answers,
    p_xp: result.xp.map((a) => ({ reason: a.reason, amount: a.amount })),
    p_xp_question_ids: result.xpQuestionIds,
    p_achievements: result.newAchievements,
    p_activity_date: localDateKey(now, activity.preferences.timezone),
  });
  if (rpcError) dbError(rpcError, "complete session");
  // Either we completed it, or a concurrent request did: return the stored version.
  const { data: stored, error: storedError } = await admin.from("study_sessions").select("result").eq("id", session.id).single();
  if (storedError) dbError(storedError, "reload result");
  if (!completed && !stored?.result) throw new ApiError(409, "conflict", "This session could not be completed. Please refresh.");
  return (stored?.result as SessionResult) ?? result;
}
