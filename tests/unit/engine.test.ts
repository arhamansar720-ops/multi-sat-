import { describe, expect, it } from "vitest";
import { getQuestion } from "@/lib/content/bank";
import { dailyChallengeIds, selectQuestions } from "@/lib/engine/selection";
import { DEADLINE_GRACE_MS, finalizeSession, rewardContextFromHistory } from "@/lib/engine/finalize";
import type { PracticeSession, SessionConfig } from "@/lib/engine/types";

const config = (over: Partial<SessionConfig> = {}): SessionConfig => ({
  mode: "quick", track: "sat", difficulty: "mixed", count: 10, timeLimitSec: null, feedback: "end", hints: false, ...over,
});

describe("selection", () => {
  it("is deterministic per seed and respects filters", () => {
    const a = selectQuestions(config({ sections: ["Math"] }), "seed-1").questionIds;
    expect(a).toEqual(selectQuestions(config({ sections: ["Math"] }), "seed-1").questionIds);
    expect(a).toHaveLength(10);
    for (const id of a) expect(getQuestion(id)?.course).toBe("sat-math");
  });
  it("limits PSAT tracks to easy and medium", () => {
    const ids = selectQuestions(config({ track: "psat-nmsqt", count: 40 }), "x").questionIds;
    expect(ids.length).toBeGreaterThan(10);
    for (const id of ids) expect(getQuestion(id)?.difficulty).not.toBe("hard");
  });
  it("gives everyone the same daily challenge for a UTC day", () => {
    const now = new Date("2026-10-26T15:00:00Z");
    const a = selectQuestions(config({ mode: "daily", count: 5 }), "user-a", now);
    const b = selectQuestions(config({ mode: "daily", count: 5, track: "ap-statistics" }), "user-b", now);
    expect(a.questionIds).toEqual(b.questionIds);
    expect(a.dailyKey).toBe("2026-10-26");
    expect(dailyChallengeIds("2026-10-27")).not.toEqual(a.questionIds);
  });
  it("review mode ignores unknown ids", () => {
    expect(selectQuestions(config({ mode: "review", questionIds: ["sat-math-alg-001", "nope"] }), "s").questionIds).toEqual(["sat-math-alg-001"]);
  });
  it("orders simulations by section", () => {
    const ids = selectQuestions(config({ mode: "simulation", count: 20 }), "sim").questionIds;
    const sections = ids.map((id) => getQuestion(id)!.section);
    const firstChange = sections.findIndex((s) => s !== sections[0]);
    expect(sections.slice(firstChange).every((s) => s === sections[firstChange])).toBe(true);
  });
});

describe("finalizeSession", () => {
  const start = new Date("2026-10-26T12:00:00Z");
  const session: PracticeSession = {
    id: "s1", title: "t", config: config({ count: 3 }), questionIds: ["sat-math-alg-001", "sat-math-alg-002", "sat-math-alg-003"],
    startedAt: start.toISOString(), deadline: null, status: "in_progress",
  };
  const emptyCtx = rewardContextFromHistory({ results: [], xpLedger: [], timezone: "UTC" }, session, start);

  it("grades on the server-side key, not on client claims", () => {
    const r = finalizeSession(session, {
      answers: { "sat-math-alg-001": ["C"], "sat-math-alg-002": ["-1"], "sat-math-alg-003": ["A"] },
      flagged: ["sat-math-alg-003"], timeSpentMs: { "sat-math-alg-001": 30_000 },
    }, emptyCtx, new Date(start.getTime() + 120_000));
    expect(r.correctCount).toBe(2);
    expect(r.items[2]).toMatchObject({ correct: false, flagged: true });
    expect(r.xpTotal).toBeGreaterThan(0);
    expect(r.durationSec).toBe(30);
  });

  it("drops invalid responses", () => {
    const r = finalizeSession(session, { answers: { "sat-math-alg-001": ["Z"] as never }, flagged: [], timeSpentMs: {} }, emptyCtx, start);
    expect(r.answeredCount).toBe(0);
  });

  it("marks late submissions and withholds correct-answer XP", () => {
    const timed = { ...session, config: config({ count: 3, mode: "timed", timeLimitSec: 60 }), deadline: new Date(start.getTime() + 60_000).toISOString() };
    const r = finalizeSession(timed, { answers: { "sat-math-alg-001": ["C"] }, flagged: [], timeSpentMs: {} }, emptyCtx, new Date(start.getTime() + 60_000 + DEADLINE_GRACE_MS + 1));
    expect(r.late).toBe(true);
    expect(r.xp.some((a) => a.reason === "correct_answers")).toBe(false);
    expect(r.challengeScore).toBeDefined();
  });

  it("does not re-award questions rewarded in the last week", () => {
    const first = finalizeSession(session, { answers: { "sat-math-alg-001": ["C"] }, flagged: [], timeSpentMs: {} }, emptyCtx, start);
    const s2 = { ...session, id: "s2" };
    const ctx = rewardContextFromHistory({ results: [first], xpLedger: [{ id: "x", amount: 8, reason: "correct_answers", sourceId: "s1", createdAt: start.toISOString() }], timezone: "UTC" }, s2, start);
    const second = finalizeSession(s2, { answers: { "sat-math-alg-001": ["C"] }, flagged: [], timeSpentMs: {} }, ctx, start);
    expect(second.xpQuestionIds).toEqual([]);
  });
});
