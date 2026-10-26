import { getQuestion } from "@/lib/content/bank";
import { isResponseCorrect, sanitizeResponse } from "@/lib/content/grading";
import { localDateKey } from "@/lib/progression/dates";
import { computeSoloRewards, timedChallengeScore, XP_RULES } from "@/lib/progression/xp";
import type { PracticeSession, ResultItem, SessionDraft, SessionResult, UserActivity } from "./types";

/** Submissions this long after the deadline are treated as late (network grace). */
export const DEADLINE_GRACE_MS = 30_000;
/** Time on a single question is capped so an idle tab doesn't inflate study time. */
const MAX_TIME_PER_QUESTION_MS = 10 * 60_000;

export interface RewardContext {
  recentlyRewardedQuestionIds: Set<string>;
  soloCorrectXpToday: number;
  hadQualifyingActivityToday: boolean;
  dailyAlreadyRewarded: boolean;
  previousBest: number | null;
}

/**
 * Builds reward context from prior history. Used directly by demo mode and
 * by the server after loading the same fields from the database.
 */
export function rewardContextFromHistory(
  history: Pick<UserActivity, "results" | "xpLedger"> & { timezone: string },
  session: PracticeSession,
  now: Date,
): RewardContext {
  const windowStart = now.getTime() - XP_RULES.freshWindowDays * 86_400_000;
  const todayKey = localDateKey(now, history.timezone);
  const prior = history.results.filter((r) => r.sessionId !== session.id);
  const recentlyRewardedQuestionIds = new Set<string>();
  for (const r of prior) {
    if (new Date(r.completedAt).getTime() >= windowStart) r.xpQuestionIds?.forEach((id) => recentlyRewardedQuestionIds.add(id));
  }
  const soloCorrectXpToday = history.xpLedger
    .filter((e) => e.reason === "correct_answers" && localDateKey(e.createdAt, history.timezone) === todayKey)
    .reduce((s, e) => s + e.amount, 0);
  const hadQualifyingActivityToday = prior.some(
    (r) => r.answeredCount >= XP_RULES.minAnsweredForCompletion && localDateKey(r.completedAt, history.timezone) === todayKey,
  );
  const dailyAlreadyRewarded =
    session.config.mode === "daily" &&
    prior.some((r) => r.dailyKey === session.dailyKey && r.xp.some((a) => a.reason === "daily_challenge"));
  const sameChallenge = prior.filter(
    (r) => r.config.mode === "timed" && r.config.track === session.config.track && r.total === session.questionIds.length,
  );
  const previousBest = sameChallenge.length ? Math.max(...sameChallenge.map((r) => r.challengeScore ?? 0)) : null;
  return { recentlyRewardedQuestionIds, soloCorrectXpToday, hadQualifyingActivityToday, dailyAlreadyRewarded, previousBest };
}

export function isLate(session: PracticeSession, now: Date): boolean {
  return Boolean(session.deadline && now.getTime() > new Date(session.deadline).getTime() + DEADLINE_GRACE_MS);
}

/**
 * Grades a session from raw responses (never from client-claimed correctness)
 * and computes XP. Pure: callers persist the result.
 */
export function finalizeSession(
  session: PracticeSession,
  draft: Pick<SessionDraft, "answers" | "flagged" | "timeSpentMs">,
  context: RewardContext,
  now: Date,
): SessionResult {
  const flagged = new Set(draft.flagged);
  const items: ResultItem[] = session.questionIds.map((id) => {
    const q = getQuestion(id);
    const response = q ? sanitizeResponse(q, draft.answers[id]) : null;
    const rawTime = Number(draft.timeSpentMs[id] ?? 0);
    const timeMs = Number.isFinite(rawTime) ? Math.max(0, Math.min(MAX_TIME_PER_QUESTION_MS, Math.round(rawTime))) : 0;
    return { questionId: id, response, correct: q ? isResponseCorrect(q, response) : false, timeMs, flagged: flagged.has(id) };
  });

  const wallMs = Math.max(0, now.getTime() - new Date(session.startedAt).getTime());
  const limitMs = session.config.timeLimitSec ? session.config.timeLimitSec * 1000 : Infinity;
  const trackedMs = items.reduce((s, i) => s + i.timeMs, 0);
  const durationSec = Math.round(Math.min(trackedMs || wallMs, wallMs || trackedMs, limitMs) / 1000);

  const correctItems = items.filter((i) => i.correct);
  const answeredCount = items.filter((i) => i.response).length;
  const late = isLate(session, now);
  const rewards = computeSoloRewards({
    correct: correctItems.map((i) => ({ questionId: i.questionId, difficulty: getQuestion(i.questionId)!.difficulty })),
    answeredCount,
    isDailyChallenge: session.config.mode === "daily",
    dailyAlreadyRewarded: context.dailyAlreadyRewarded,
    recentlyRewardedQuestionIds: context.recentlyRewardedQuestionIds,
    soloCorrectXpToday: context.soloCorrectXpToday,
    hadQualifyingActivityToday: context.hadQualifyingActivityToday,
    late,
  });

  const result: SessionResult = {
    sessionId: session.id,
    title: session.title,
    config: session.config,
    startedAt: session.startedAt,
    completedAt: now.toISOString(),
    durationSec,
    items,
    correctCount: correctItems.length,
    answeredCount,
    total: items.length,
    accuracy: items.length ? correctItems.length / items.length : 0,
    xp: rewards.awards,
    xpTotal: rewards.total,
    xpQuestionIds: rewards.rewardedQuestionIds,
    newAchievements: [],
    late,
    dailyKey: session.dailyKey,
  };

  if (session.config.mode === "timed" && session.config.timeLimitSec) {
    const score = timedChallengeScore(result.correctCount, result.total, durationSec, session.config.timeLimitSec);
    result.challengeScore = score;
    result.previousBest = context.previousBest;
    result.isPersonalBest = context.previousBest === null || score > context.previousBest;
  }
  return result;
}
