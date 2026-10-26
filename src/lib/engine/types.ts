import { z } from "zod";
import type { AnswerResponse, Difficulty } from "@/lib/content/types";

export const STUDY_MODES = ["quick", "focus", "timed", "review", "daily", "simulation"] as const;
export type StudyMode = (typeof STUDY_MODES)[number];

export const MODE_LABELS: Record<StudyMode, string> = {
  quick: "Quick Practice",
  focus: "Focus Mode",
  timed: "Timed Challenge",
  review: "Review",
  daily: "Daily Challenge",
  simulation: "Exam Simulation",
};

export const sessionConfigSchema = z.object({
  mode: z.enum(STUDY_MODES),
  track: z.string().min(1).max(64),
  sections: z.array(z.string().max(120)).max(20).optional(),
  topics: z.array(z.string().max(120)).max(40).optional(),
  skills: z.array(z.string().max(120)).max(40).optional(),
  difficulty: z.enum(["mixed", "easy", "medium", "hard"]).default("mixed"),
  count: z.number().int().min(1).max(60),
  /** Total time limit in seconds; null means untimed. */
  timeLimitSec: z.number().int().min(30).max(4 * 60 * 60).nullable(),
  feedback: z.enum(["immediate", "end"]),
  hints: z.boolean(),
  /** Explicit question list (review mode). Validated against the bank. */
  questionIds: z.array(z.string().max(64)).max(60).optional(),
});

export type SessionConfig = z.infer<typeof sessionConfigSchema>;

export interface PracticeSession {
  id: string;
  title: string;
  config: SessionConfig;
  questionIds: string[];
  /** ISO timestamps (server time in connected mode). */
  startedAt: string;
  deadline: string | null;
  status: "in_progress" | "completed";
  /** Daily challenge key (UTC date) when mode === "daily". */
  dailyKey?: string;
}

export interface SessionDraft {
  answers: Record<string, AnswerResponse>;
  flagged: string[];
  eliminated: Record<string, string[]>;
  /** Questions whose answer was locked by "Check answer" in immediate-feedback mode. */
  checked: string[];
  currentIndex: number;
  timeSpentMs: Record<string, number>;
  updatedAt: string;
}

export interface ResultItem {
  questionId: string;
  response: AnswerResponse | null;
  correct: boolean;
  timeMs: number;
  flagged: boolean;
}

export interface XpAward {
  reason: XpReason;
  amount: number;
  label: string;
}

export type XpReason =
  | "correct_answers"
  | "session_complete"
  | "daily_challenge"
  | "streak_bonus"
  | "match_correct"
  | "match_participation"
  | "match_win";

export interface SessionResult {
  sessionId: string;
  title: string;
  config: SessionConfig;
  startedAt: string;
  completedAt: string;
  durationSec: number;
  items: ResultItem[];
  correctCount: number;
  answeredCount: number;
  total: number;
  accuracy: number; // 0..1 over total questions
  xp: XpAward[];
  xpTotal: number;
  /** Questions that earned correct-answer XP in this session (fresh-window rule). */
  xpQuestionIds: string[];
  /** Timed challenge score (correctness first, small time bonus). */
  challengeScore?: number;
  previousBest?: number | null;
  isPersonalBest?: boolean;
  newAchievements: string[];
  late?: boolean;
  dailyKey?: string;
}

export interface MatchSummary {
  matchId: string;
  roomCode: string | null;
  kind: "online" | "local-demo";
  finishedAt: string;
  rank: number;
  players: number;
  humanPlayers: number;
  score: number;
  correct: number;
  total: number;
  won: boolean;
  xpTotal: number;
}

export interface XpEntry {
  id: string;
  amount: number;
  reason: XpReason;
  sourceId: string;
  createdAt: string;
}

export interface EarnedAchievement {
  id: string;
  earnedAt: string;
}

export interface Preferences {
  displayName: string;
  tracks: string[];
  classes: string[];
  targetDate: string | null;
  targetScore: number | null;
  dailyMinutes: number;
  focusSkills: string[];
  timezone: string;
  onboarded: boolean;
  leaderboardOptIn: boolean;
  shareActivityWithFriends: boolean;
  reminderEmails: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  displayName: "Student",
  tracks: ["sat"],
  classes: [],
  targetDate: null,
  targetScore: null,
  dailyMinutes: 20,
  focusSkills: [],
  timezone: "UTC",
  onboarded: false,
  leaderboardOptIn: true,
  shareActivityWithFriends: true,
  reminderEmails: false,
};

/** Everything progress/achievement calculations need, in either mode. */
export interface UserActivity {
  results: SessionResult[];
  matches: MatchSummary[];
  xpLedger: XpEntry[];
  achievements: EarnedAchievement[];
  saved: string[];
  preferences: Preferences;
}

export const DIFFICULTY_ORDER: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 };
