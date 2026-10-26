import { getQuestion } from "@/lib/content/bank";
import { getCourse } from "@/lib/content/catalog";
import type { Difficulty } from "@/lib/content/types";
import type { SessionResult } from "@/lib/engine/types";

export const MASTERY_MIN_ATTEMPTS = 3;
const RECENT_WINDOW = 20;
const RECENCY_DECAY = 0.9;
const DIFFICULTY_WEIGHT: Record<Difficulty, number> = { easy: 1, medium: 1.25, hard: 1.5 };

export type MasteryBand = "insufficient" | "needs-practice" | "developing" | "strong";

export interface SkillMastery {
  key: string;
  course: string;
  courseName: string;
  section: string;
  topic: string;
  skill: string;
  attempts: number;
  correct: number;
  accuracy: number;
  /** Weighted recent mastery 0..1, or null below the minimum sample size. */
  score: number | null;
  band: MasteryBand;
  lastAttemptAt: string;
}

export interface Attempt {
  questionId: string;
  correct: boolean;
  at: string;
  difficulty: Difficulty;
}

export function attemptsFromResults(results: SessionResult[]): Attempt[] {
  const attempts: Attempt[] = [];
  for (const r of results) {
    for (const item of r.items) {
      if (!item.response) continue; // skipped questions are not attempts
      const q = getQuestion(item.questionId);
      if (!q) continue;
      attempts.push({ questionId: q.id, correct: item.correct, at: r.completedAt, difficulty: q.difficulty });
    }
  }
  return attempts.sort((a, b) => a.at.localeCompare(b.at));
}

export function bandFor(score: number | null): MasteryBand {
  if (score === null) return "insufficient";
  if (score >= 0.8) return "strong";
  if (score >= 0.6) return "developing";
  return "needs-practice";
}

export const BAND_LABEL: Record<MasteryBand, string> = {
  insufficient: "Not enough data",
  "needs-practice": "Needs practice",
  developing: "Developing",
  strong: "Strong",
};

/**
 * Explainable mastery: accuracy over the most recent 20 attempts of a skill,
 * weighting harder questions more and older attempts slightly less. Requires
 * at least 3 attempts before rating a skill.
 */
export function computeSkillMastery(attempts: Attempt[]): SkillMastery[] {
  const groups = new Map<string, Attempt[]>();
  for (const a of attempts) {
    const q = getQuestion(a.questionId);
    if (!q) continue;
    const key = `${q.course}::${q.skill}`;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  const out: SkillMastery[] = [];
  for (const [key, list] of groups) {
    const q = getQuestion(list[0]!.questionId)!;
    const recent = list.slice(-RECENT_WINDOW).reverse();
    let num = 0;
    let den = 0;
    recent.forEach((a, i) => {
      const w = DIFFICULTY_WEIGHT[a.difficulty] * Math.pow(RECENCY_DECAY, i);
      den += w;
      if (a.correct) num += w;
    });
    const correct = list.filter((a) => a.correct).length;
    const score = list.length >= MASTERY_MIN_ATTEMPTS && den > 0 ? num / den : null;
    out.push({
      key,
      course: q.course,
      courseName: getCourse(q.course)?.name ?? q.course,
      section: q.section,
      topic: q.topic,
      skill: q.skill,
      attempts: list.length,
      correct,
      accuracy: correct / list.length,
      score,
      band: bandFor(score),
      lastAttemptAt: list[list.length - 1]!.at,
    });
  }
  return out.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.attempts - a.attempts);
}
