import type { EarnedAchievement, MatchSummary, SessionResult } from "@/lib/engine/types";

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: "flag" | "check" | "hundred" | "swords" | "flame" | "target" | "calendar" | "trophy";
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first-session", name: "First Steps", description: "Complete your first study session.", icon: "flag" },
  { id: "ten-correct", name: "Double Digits", description: "Answer 10 questions correctly.", icon: "check" },
  { id: "hundred-answered", name: "Century", description: "Answer 100 questions.", icon: "hundred" },
  { id: "first-match", name: "Challenger", description: "Finish your first online multiplayer match.", icon: "swords" },
  { id: "five-match-streak", name: "On a Roll", description: "Win five online multiplayer matches in a row.", icon: "trophy" },
  { id: "sharp-shooter", name: "Sharpshooter", description: "Score at least 90% on a session of 10 or more questions.", icon: "target" },
  { id: "weekly-goal", name: "Goal Getter", description: "Reach your weekly study-time goal.", icon: "calendar" },
  { id: "streak-7", name: "Seven-Day Streak", description: "Study on seven consecutive days.", icon: "flame" },
];

export function getAchievement(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

export interface AchievementContext {
  results: SessionResult[];
  matches: MatchSummary[];
  weeklyMinutes: number;
  weeklyGoalMinutes: number;
  currentStreak: number;
}

/** Returns ids of achievements whose conditions are met, given the full history. */
export function qualifyingAchievements(ctx: AchievementContext): Set<string> {
  const met = new Set<string>();
  const answered = ctx.results.reduce((s, r) => s + r.answeredCount, 0);
  const correct = ctx.results.reduce((s, r) => s + r.correctCount, 0);
  if (ctx.results.length > 0) met.add("first-session");
  if (correct >= 10) met.add("ten-correct");
  if (answered >= 100) met.add("hundred-answered");
  if (ctx.results.some((r) => r.total >= 10 && r.correctCount / r.total >= 0.9)) met.add("sharp-shooter");
  if (ctx.weeklyGoalMinutes > 0 && ctx.weeklyMinutes >= ctx.weeklyGoalMinutes) met.add("weekly-goal");
  if (ctx.currentStreak >= 7) met.add("streak-7");

  const online = ctx.matches.filter((m) => m.kind === "online").sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));
  if (online.length > 0) met.add("first-match");
  let run = 0;
  for (const m of online) {
    run = m.won && m.humanPlayers >= 2 ? run + 1 : 0;
    if (run >= 5) {
      met.add("five-match-streak");
      break;
    }
  }
  return met;
}

/** New achievements = qualifying minus already earned. Never re-awards. */
export function newAchievements(ctx: AchievementContext, earned: EarnedAchievement[]): string[] {
  const have = new Set(earned.map((e) => e.id));
  return [...qualifyingAchievements(ctx)].filter((id) => !have.has(id));
}
