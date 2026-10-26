import { describe, expect, it } from "vitest";
import { computeSoloRewards, computeMatchRewards, levelInfo, timedChallengeScore, xpForLevel, XP_RULES } from "@/lib/progression/xp";
import { addDays, computeStreak, localDateKey, weekStart } from "@/lib/progression/dates";
import { computeSkillMastery } from "@/lib/progression/mastery";
import { newAchievements } from "@/lib/progression/achievements";
import { recommendNext } from "@/lib/progression/recommendations";

describe("levels", () => {
  it("uses the 50·L·(L−1) threshold formula", () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(300);
    expect(levelInfo(0).level).toBe(1);
    expect(levelInfo(99).level).toBe(1);
    expect(levelInfo(100).level).toBe(2);
    expect(levelInfo(299).level).toBe(2);
    expect(levelInfo(300)).toMatchObject({ level: 3, intoLevel: 0, needed: 300 });
    expect(levelInfo(-50).level).toBe(1);
    for (let xp = 0; xp < 20000; xp += 137) {
      const info = levelInfo(xp);
      expect(xp).toBeGreaterThanOrEqual(info.levelStartXp);
      expect(xp).toBeLessThan(info.nextLevelXp);
    }
  });
});

describe("solo rewards", () => {
  const base = {
    correct: [
      { questionId: "a", difficulty: "easy" as const },
      { questionId: "b", difficulty: "hard" as const },
    ],
    answeredCount: 5,
    isDailyChallenge: false,
    dailyAlreadyRewarded: false,
    recentlyRewardedQuestionIds: new Set<string>(),
    soloCorrectXpToday: 0,
    hadQualifyingActivityToday: false,
  };
  it("awards correct answers, completion, and the first-session-of-day bonus", () => {
    const r = computeSoloRewards(base);
    expect(r.total).toBe(8 + 14 + XP_RULES.sessionComplete + XP_RULES.streakBonus);
    expect(r.rewardedQuestionIds).toEqual(["a", "b"]);
  });
  it("does not pay twice for a recently rewarded question (replay protection)", () => {
    const r = computeSoloRewards({ ...base, recentlyRewardedQuestionIds: new Set(["a", "b"]), hadQualifyingActivityToday: true });
    expect(r.awards.find((a) => a.reason === "correct_answers")).toBeUndefined();
    expect(r.total).toBe(XP_RULES.sessionComplete);
  });
  it("respects the daily cap", () => {
    const r = computeSoloRewards({ ...base, soloCorrectXpToday: XP_RULES.dailySoloCorrectCap - 5 });
    expect(r.awards.find((a) => a.reason === "correct_answers")?.amount).toBe(5);
  });
  it("only pays the daily challenge once", () => {
    expect(computeSoloRewards({ ...base, isDailyChallenge: true }).awards.some((a) => a.reason === "daily_challenge")).toBe(true);
    expect(computeSoloRewards({ ...base, isDailyChallenge: true, dailyAlreadyRewarded: true }).awards.some((a) => a.reason === "daily_challenge")).toBe(false);
  });
  it("gives no completion XP for tiny sessions and no correct XP when late", () => {
    expect(computeSoloRewards({ ...base, answeredCount: 2 }).awards.some((a) => a.reason === "session_complete")).toBe(false);
    expect(computeSoloRewards({ ...base, late: true }).awards.some((a) => a.reason === "correct_answers")).toBe(false);
  });
});

describe("match rewards and timed score", () => {
  it("needs two humans for a victory bonus", () => {
    expect(computeMatchRewards({ correctCount: 3, rank: 1, humanPlayers: 1, answeredCount: 3 }).awards.some((a) => a.reason === "match_win")).toBe(false);
    expect(computeMatchRewards({ correctCount: 3, rank: 1, humanPlayers: 2, answeredCount: 3 }).awards.some((a) => a.reason === "match_win")).toBe(true);
  });
  it("timed score is dominated by correctness", () => {
    expect(timedChallengeScore(5, 10, 600, 600)).toBe(500);
    expect(timedChallengeScore(5, 10, 0, 600)).toBe(600);
    expect(timedChallengeScore(6, 10, 600, 600)).toBeGreaterThan(timedChallengeScore(5, 10, 0, 600) - 1);
  });
});

describe("dates and streaks", () => {
  it("converts to the student's timezone", () => {
    // 03:30 UTC on Mar 10 is still Mar 9 in New York.
    expect(localDateKey("2026-03-10T03:30:00Z", "America/New_York")).toBe("2026-03-09");
    expect(localDateKey("2026-03-10T03:30:00Z", "Not/AZone")).toBe("2026-03-10");
  });
  it("handles month boundaries and week starts", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(weekStart("2026-10-25")).toBe("2026-10-19"); // Sunday -> Monday before
  });
  it("counts consecutive days, allowing today to be pending", () => {
    const days = ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-24", "2026-10-25"];
    expect(computeStreak(days, "2026-10-25")).toMatchObject({ current: 2, best: 3, activeToday: true });
    expect(computeStreak(days, "2026-10-26")).toMatchObject({ current: 2, activeToday: false });
    expect(computeStreak(days, "2026-10-27").current).toBe(0);
    expect(computeStreak(["2026-10-25", "2026-10-25"], "2026-10-25").current).toBe(1);
  });
});

describe("mastery and recommendations", () => {
  const at = (i: number) => new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString();
  it("requires a minimum sample before rating", () => {
    const m = computeSkillMastery([
      { questionId: "sat-math-alg-003", correct: true, at: at(1), difficulty: "medium" },
      { questionId: "sat-math-alg-004", correct: false, at: at(2), difficulty: "hard" },
    ]);
    expect(m[0]?.score).toBeNull();
    expect(m[0]?.band).toBe("insufficient");
  });
  it("recommends the weakest rated skill with an explanation", () => {
    const attempts = [
      ...[1, 2, 3, 4].map((i) => ({ questionId: "sat-math-alg-001", correct: true, at: at(i), difficulty: "easy" as const })),
      ...[5, 6, 7].map((i) => ({ questionId: "sat-math-adv-003", correct: false, at: at(i), difficulty: "hard" as const })),
    ];
    const rec = recommendNext(computeSkillMastery(attempts), ["sat"]);
    expect(rec.config.mode).toBe("focus");
    expect(rec.config.skills).toEqual(["Nonlinear functions"]);
    expect(rec.reason).toMatch(/strong accuracy in linear equations in one variable/);
  });
  it("starts brand-new students with quick practice", () => {
    expect(recommendNext([], ["ap-statistics"]).config).toMatchObject({ mode: "quick", track: "ap-statistics" });
  });
});

describe("achievements", () => {
  it("are awarded once, based on history", () => {
    const result = { answeredCount: 10, correctCount: 10, total: 10 } as never;
    const ctx = { results: [result], matches: [], weeklyMinutes: 0, weeklyGoalMinutes: 100, currentStreak: 1 };
    expect(newAchievements(ctx, []).sort()).toEqual(["first-session", "sharp-shooter", "ten-correct"]);
    expect(newAchievements(ctx, [{ id: "first-session", earnedAt: "" }, { id: "ten-correct", earnedAt: "" }, { id: "sharp-shooter", earnedAt: "" }])).toEqual([]);
  });
});
