import { describe, expect, it } from "vitest";
import {
  ANSWER_GRACE_MS, canAcceptAnswer, generateRoomCode, nextClock, normalizeRoomCode, pointsFor, rankStandings, REVEAL_MS, roomSettingsSchema,
  type MatchClock,
} from "@/lib/multiplayer/rules";

const clock = (over: Partial<MatchClock> = {}): MatchClock => ({
  phase: "question", index: 0, phaseStartedAt: 0, phaseEndsAt: 30_000, questionCount: 3, secondsPerQuestion: 30, ...over,
});

describe("room codes", () => {
  it("generates valid, normalizable codes", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode();
      expect(normalizeRoomCode(code.toLowerCase())).toBe(code);
    }
  });
  it("rejects malformed codes", () => {
    expect(normalizeRoomCode("ABC")).toBeNull();
    expect(normalizeRoomCode("ABCDE0")).toBeNull(); // 0 is not in the alphabet
    expect(normalizeRoomCode(" abc-def ")).toBe("ABCDEF");
  });
});

describe("scoring", () => {
  it("never rewards wrong answers and correctness dominates speed", () => {
    expect(pointsFor(false, 0, 30_000, "speed")).toBe(0);
    expect(pointsFor(true, 29_999, 30_000, "speed")).toBe(100);
    expect(pointsFor(true, 0, 30_000, "speed")).toBe(150);
    expect(pointsFor(true, 0, 30_000, "accuracy")).toBe(100);
    expect(pointsFor(true, 60_000, 30_000, "speed")).toBe(100); // late but accepted within grace never goes below base
  });
});

describe("match state machine", () => {
  it("moves countdown -> question -> reveal -> next question -> finished", () => {
    let c: MatchClock = clock({ phase: "countdown", phaseEndsAt: 3000 });
    expect(nextClock(c, false, 2999)).toBeNull();
    c = nextClock(c, false, 3000)!;
    expect(c).toMatchObject({ phase: "question", index: 0, phaseEndsAt: 33_000 });
    expect(nextClock(c, false, 33_000)).toBeNull(); // grace window
    c = nextClock(c, false, 33_000 + ANSWER_GRACE_MS)!;
    expect(c.phase).toBe("reveal");
    expect(nextClock(c, false, c.phaseStartedAt + REVEAL_MS - 1)).toBeNull();
    c = nextClock(c, false, c.phaseEndsAt)!;
    expect(c).toMatchObject({ phase: "question", index: 1 });
    c = { ...c, index: 2, phase: "reveal" };
    expect(nextClock(c, false, c.phaseEndsAt + 10_000)?.phase).toBe("finished");
  });
  it("reveals early when everyone has answered", () => {
    expect(nextClock(clock(), true, 5_000)?.phase).toBe("reveal");
  });
  it("rejects answers for the wrong question, wrong phase, or after the deadline", () => {
    expect(canAcceptAnswer(clock(), 0, 10_000).ok).toBe(true);
    expect(canAcceptAnswer(clock(), 1, 10_000).ok).toBe(false);
    expect(canAcceptAnswer(clock({ phase: "reveal" }), 0, 10_000).ok).toBe(false);
    expect(canAcceptAnswer(clock(), 0, 30_000 + ANSWER_GRACE_MS + 1).ok).toBe(false);
  });
});

describe("standings", () => {
  it("ranks by score, then correct count, then speed, and shares exact ties", () => {
    const ranked = rankStandings([
      { id: "a", score: 300, correct: 3, correctTimeMs: 9000, joinedAt: "1" },
      { id: "b", score: 300, correct: 3, correctTimeMs: 6000, joinedAt: "2" },
      { id: "c", score: 450, correct: 3, correctTimeMs: 1000, joinedAt: "3" },
      { id: "d", score: 300, correct: 3, correctTimeMs: 6000, joinedAt: "4" },
    ]);
    expect(ranked.map((r) => [r.id, r.rank])).toEqual([["c", 1], ["b", 2], ["d", 2], ["a", 4]]);
  });
});

describe("room settings validation", () => {
  it("enforces bounds", () => {
    expect(roomSettingsSchema.safeParse({ track: "sat", questionCount: 8, secondsPerQuestion: 30, scoring: "speed", minPlayers: 4, maxPlayers: 2 }).success).toBe(false);
    expect(roomSettingsSchema.safeParse({ track: "sat", questionCount: 100, secondsPerQuestion: 30, scoring: "speed", minPlayers: 2, maxPlayers: 4 }).success).toBe(false);
    expect(roomSettingsSchema.safeParse({ track: "sat", questionCount: 8, secondsPerQuestion: 30, scoring: "speed", minPlayers: 2, maxPlayers: 4 }).success).toBe(true);
  });
});
