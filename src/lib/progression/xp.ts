import type { Difficulty } from "@/lib/content/types";
import type { XpAward } from "@/lib/engine/types";

/**
 * XP rules. Kept in one place and shown to students on the Progress page so
 * the system is transparent. Server and demo mode use the same functions.
 */
export const XP_RULES = {
  correct: { easy: 8, medium: 10, hard: 14 } satisfies Record<Difficulty, number>,
  /** Completing a session with at least MIN_ANSWERED answers. */
  sessionComplete: 5,
  minAnsweredForCompletion: 3,
  dailyChallenge: 25,
  /** First qualifying session of a calendar day (user's timezone). */
  streakBonus: 10,
  /** Correct-answer XP is only paid once per question in this window. */
  freshWindowDays: 7,
  /** Cap on XP from solo correct answers per calendar day. */
  dailySoloCorrectCap: 400,
  match: {
    correct: 10,
    participation: 10,
    /** Only when at least two human players took part. */
    win: 15,
  },
} as const;

/** Cumulative XP needed to reach a level: level L needs 50·L·(L−1). */
export function xpForLevel(level: number): number {
  return 50 * level * (level - 1);
}

export interface LevelInfo {
  level: number;
  totalXp: number;
  levelStartXp: number;
  nextLevelXp: number;
  intoLevel: number;
  needed: number;
  progress: number; // 0..1
}

export function levelInfo(totalXp: number): LevelInfo {
  const xp = Math.max(0, Math.floor(totalXp));
  // Solve 50 L (L-1) <= xp for the largest integer L.
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * xp) / 50)) / 2));
  while (xpForLevel(level + 1) <= xp) level++;
  while (level > 1 && xpForLevel(level) > xp) level--;
  const start = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return {
    level,
    totalXp: xp,
    levelStartXp: start,
    nextLevelXp: next,
    intoLevel: xp - start,
    needed: next - start,
    progress: (xp - start) / (next - start),
  };
}

export interface SoloRewardInput {
  /** Correct answers in this session with their difficulty and question id. */
  correct: { questionId: string; difficulty: Difficulty }[];
  answeredCount: number;
  isDailyChallenge: boolean;
  /** Daily challenge already rewarded for this daily key. */
  dailyAlreadyRewarded: boolean;
  /** Question ids that already earned correct-answer XP within the fresh window. */
  recentlyRewardedQuestionIds: ReadonlySet<string>;
  /** Solo correct-answer XP already earned today. */
  soloCorrectXpToday: number;
  /** Whether the user already had a qualifying session today (no streak bonus again). */
  hadQualifyingActivityToday: boolean;
  /** Session ended after deadline + grace; only participation is awarded. */
  late?: boolean;
}

export interface SoloRewardOutput {
  awards: XpAward[];
  total: number;
  /** Question ids that earned correct-answer XP (to record in the attempt log). */
  rewardedQuestionIds: string[];
}

export function computeSoloRewards(input: SoloRewardInput): SoloRewardOutput {
  const awards: XpAward[] = [];
  const rewardedQuestionIds: string[] = [];
  const qualifies = input.answeredCount >= XP_RULES.minAnsweredForCompletion;

  if (!input.late) {
    let correctXp = 0;
    let remainingCap = Math.max(0, XP_RULES.dailySoloCorrectCap - input.soloCorrectXpToday);
    for (const c of input.correct) {
      if (input.recentlyRewardedQuestionIds.has(c.questionId)) continue;
      const value = Math.min(XP_RULES.correct[c.difficulty], remainingCap);
      if (value <= 0) break;
      correctXp += value;
      remainingCap -= value;
      rewardedQuestionIds.push(c.questionId);
    }
    if (correctXp > 0) {
      const repeats = input.correct.length - rewardedQuestionIds.length;
      awards.push({
        reason: "correct_answers",
        amount: correctXp,
        label: repeats > 0 ? `Correct answers (${repeats} repeat${repeats === 1 ? "" : "s"} or capped, no XP)` : "Correct answers",
      });
    }
  }

  if (qualifies) {
    awards.push({ reason: "session_complete", amount: XP_RULES.sessionComplete, label: "Session completed" });
    if (!input.hadQualifyingActivityToday) {
      awards.push({ reason: "streak_bonus", amount: XP_RULES.streakBonus, label: "First session today" });
    }
  }

  if (input.isDailyChallenge && !input.dailyAlreadyRewarded && !input.late && input.answeredCount > 0) {
    awards.push({ reason: "daily_challenge", amount: XP_RULES.dailyChallenge, label: "Daily Challenge completed" });
  }

  return { awards, total: awards.reduce((s, a) => s + a.amount, 0), rewardedQuestionIds };
}

export interface MatchRewardInput {
  correctCount: number;
  rank: number;
  humanPlayers: number;
  answeredCount: number;
}

export function computeMatchRewards(input: MatchRewardInput): { awards: XpAward[]; total: number } {
  const awards: XpAward[] = [];
  if (input.correctCount > 0) {
    awards.push({ reason: "match_correct", amount: input.correctCount * XP_RULES.match.correct, label: "Correct answers" });
  }
  if (input.answeredCount > 0) {
    awards.push({ reason: "match_participation", amount: XP_RULES.match.participation, label: "Match completed" });
  }
  if (input.rank === 1 && input.humanPlayers >= 2 && input.correctCount > 0) {
    awards.push({ reason: "match_win", amount: XP_RULES.match.win, label: "Victory bonus" });
  }
  return { awards, total: awards.reduce((s, a) => s + a.amount, 0) };
}

/** Timed Challenge score: 100 per correct answer plus up to 20 per correct answer for unused time. */
export function timedChallengeScore(correct: number, total: number, usedSec: number, limitSec: number): number {
  if (total === 0 || limitSec <= 0) return 0;
  const unused = Math.max(0, Math.min(1, 1 - usedSec / limitSec));
  return correct * 100 + Math.round(correct * 20 * unused);
}
