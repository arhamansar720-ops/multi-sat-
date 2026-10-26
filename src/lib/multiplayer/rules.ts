import { z } from "zod";

export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
export const ROOM_CODE_LENGTH = 6;
export const COUNTDOWN_MS = 3_000;
export const REVEAL_MS = 6_000;
/** Answers that arrive this soon after the deadline are still accepted (network latency). */
export const ANSWER_GRACE_MS = 750;
export const ROOM_TTL_HOURS = 6;

export const roomSettingsSchema = z
  .object({
    track: z.string().min(1).max(64),
    sections: z.array(z.string().max(120)).max(20).optional(),
    topics: z.array(z.string().max(120)).max(40).optional(),
    difficulty: z.enum(["mixed", "easy", "medium", "hard"]).default("mixed"),
    questionCount: z.number().int().min(3).max(20),
    secondsPerQuestion: z.number().int().min(10).max(120),
    scoring: z.enum(["speed", "accuracy"]),
    minPlayers: z.number().int().min(1).max(20),
    maxPlayers: z.number().int().min(2).max(20),
  })
  .refine((s) => s.maxPlayers >= s.minPlayers, { message: "Maximum players must be at least the minimum." });

export type RoomSettings = z.infer<typeof roomSettingsSchema>;

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  track: "sat",
  difficulty: "mixed",
  questionCount: 8,
  secondsPerQuestion: 30,
  scoring: "speed",
  minPlayers: 2,
  maxPlayers: 8,
};

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, "Display name must be at least 2 characters.")
  .max(24, "Display name must be 24 characters or fewer.")
  .regex(/^[\p{L}\p{N} ._'-]+$/u, "Use letters, numbers, spaces, and . _ ' - only.");

export function normalizeRoomCode(raw: string): string | null {
  const code = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  return code;
}

export function generateRoomCode(random: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) out += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
  return out;
}

export const SPEED_BONUS_MAX = 50;
export const CORRECT_POINTS = 100;

/**
 * Scoring (shown to players before each match):
 * - Correct: 100 points.
 * - Speed scoring adds up to 50 bonus points, scaled by how much time remained.
 * - Incorrect or no answer: 0 points. Scores never go negative.
 * A slow correct answer (100) always beats a fast wrong one (0), and the
 * maximum speed bonus is half a correct answer, so correctness dominates.
 */
export function pointsFor(correct: boolean, responseMs: number, limitMs: number, scoring: RoomSettings["scoring"]): number {
  if (!correct) return 0;
  if (scoring === "accuracy") return CORRECT_POINTS;
  const remaining = Math.max(0, Math.min(1, 1 - responseMs / limitMs));
  return CORRECT_POINTS + Math.round(SPEED_BONUS_MAX * remaining);
}

export function scoringDescription(scoring: RoomSettings["scoring"]): string {
  return scoring === "speed"
    ? `Correct answers earn ${CORRECT_POINTS} points plus up to ${SPEED_BONUS_MAX} bonus points for answering quickly. Wrong or missing answers earn 0. Scores never go negative.`
    : `Correct answers earn ${CORRECT_POINTS} points. Speed does not matter. Wrong or missing answers earn 0.`;
}

export type MatchPhase = "countdown" | "question" | "reveal" | "finished";

export interface MatchClock {
  phase: MatchPhase;
  index: number;
  phaseStartedAt: number; // epoch ms (server clock)
  phaseEndsAt: number;
  questionCount: number;
  secondsPerQuestion: number;
}

/**
 * Server-authoritative state machine. Given the current clock and whether all
 * connected players have answered, returns the next clock if a transition is
 * due, otherwise null. Callers apply it with a conditional update so that
 * concurrent "advance" requests cannot double-advance.
 */
export function nextClock(clock: MatchClock, allAnswered: boolean, now: number): MatchClock | null {
  switch (clock.phase) {
    case "countdown":
      if (now < clock.phaseEndsAt) return null;
      return { ...clock, phase: "question", index: 0, phaseStartedAt: now, phaseEndsAt: now + clock.secondsPerQuestion * 1000 };
    case "question":
      if (!allAnswered && now < clock.phaseEndsAt + ANSWER_GRACE_MS) return null;
      return { ...clock, phase: "reveal", phaseStartedAt: now, phaseEndsAt: now + REVEAL_MS };
    case "reveal":
      if (now < clock.phaseEndsAt) return null;
      if (clock.index + 1 >= clock.questionCount) {
        return { ...clock, phase: "finished", phaseStartedAt: now, phaseEndsAt: now };
      }
      return {
        ...clock,
        phase: "question",
        index: clock.index + 1,
        phaseStartedAt: now,
        phaseEndsAt: now + clock.secondsPerQuestion * 1000,
      };
    case "finished":
      return null;
  }
}

export function canAcceptAnswer(clock: MatchClock, index: number, now: number): { ok: true } | { ok: false; reason: string } {
  if (clock.phase !== "question") return { ok: false, reason: "This question is not open for answers." };
  if (index !== clock.index) return { ok: false, reason: "That question is no longer active." };
  if (now > clock.phaseEndsAt + ANSWER_GRACE_MS) return { ok: false, reason: "Time is up for this question." };
  return { ok: true };
}

export interface StandingInput {
  id: string;
  score: number;
  correct: number;
  correctTimeMs: number;
  joinedAt: string;
}

/** Ranks by score, then correct count, then total time on correct answers; exact ties share a rank. */
export function rankStandings<T extends StandingInput>(players: T[]): (T & { rank: number })[] {
  const sorted = [...players].sort(
    (a, b) =>
      b.score - a.score || b.correct - a.correct || a.correctTimeMs - b.correctTimeMs || a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id),
  );
  let lastRank = 0;
  return sorted.map((p, i) => {
    const prev = sorted[i - 1];
    const tied = prev && prev.score === p.score && prev.correct === p.correct && prev.correctTimeMs === p.correctTimeMs;
    const rank = tied ? lastRank : i + 1;
    lastRank = rank;
    return { ...p, rank };
  });
}
