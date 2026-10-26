import { getQuestion, poolForTrack, QUESTIONS } from "@/lib/content/bank";
import { getTrack } from "@/lib/content/catalog";
import { seededRandom, shuffle } from "@/lib/content/random";
import type { Question } from "@/lib/content/types";
import { DIFFICULTY_ORDER, MODE_LABELS, type SessionConfig } from "./types";

export const DAILY_CHALLENGE_SIZE = 5;

/** The daily challenge rotates at 00:00 UTC so every participant gets the same set. */
export function dailyKeyFor(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Same five questions for everyone on a given UTC day: 2 SAT Math, 2 SAT R&W, 1 AP. */
export function dailyChallengeIds(dailyKey: string): string[] {
  const random = seededRandom(`daily:${dailyKey}`);
  const pick = (pool: Question[], n: number) => shuffle(pool, random).slice(0, n).map((q) => q.id);
  const math = QUESTIONS.filter((q) => q.course === "sat-math");
  const rw = QUESTIONS.filter((q) => q.course === "sat-rw");
  const ap = QUESTIONS.filter((q) => q.exam === "ap");
  return [...pick(math, 2), ...pick(rw, 2), ...pick(ap, 1)];
}

export function filterPool(config: SessionConfig): Question[] {
  let pool = poolForTrack(config.track);
  if (config.sections?.length) pool = pool.filter((q) => config.sections!.includes(q.section));
  if (config.topics?.length) pool = pool.filter((q) => config.topics!.includes(q.topic));
  if (config.skills?.length) pool = pool.filter((q) => config.skills!.includes(q.skill));
  if (config.difficulty !== "mixed") pool = pool.filter((q) => q.difficulty === config.difficulty);
  return pool;
}

export interface SelectionResult {
  questionIds: string[];
  dailyKey?: string;
}

/**
 * Chooses the ordered question list for a session. Pure and deterministic for
 * a given seed, so the server and the local demo produce identical behavior.
 */
export function selectQuestions(config: SessionConfig, seed: string, now = new Date()): SelectionResult {
  if (config.mode === "daily") {
    const dailyKey = dailyKeyFor(now);
    return { questionIds: dailyChallengeIds(dailyKey), dailyKey };
  }

  if (config.mode === "review") {
    const ids = [...new Set(config.questionIds ?? [])].filter((id) => getQuestion(id)).slice(0, config.count);
    return { questionIds: ids };
  }

  const random = seededRandom(seed);
  const pool = filterPool(config);

  if (config.mode === "simulation") {
    // Section-by-section, easier to harder within each section, like a paper module.
    const bySection = new Map<string, Question[]>();
    for (const q of shuffle(pool, random)) {
      bySection.set(q.section, [...(bySection.get(q.section) ?? []), q]);
    }
    const sections = [...bySection.keys()];
    const perSection = Math.max(1, Math.floor(config.count / Math.max(1, sections.length)));
    const ordered: Question[] = [];
    for (const section of sections) {
      const qs = bySection
        .get(section)!
        .slice(0, perSection)
        .sort((a, b) => DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty]);
      ordered.push(...qs);
    }
    return { questionIds: ordered.slice(0, config.count).map((q) => q.id) };
  }

  // Spread across skills so short sessions don't cluster on one skill.
  const bySkill = new Map<string, Question[]>();
  for (const q of shuffle(pool, random)) bySkill.set(q.skill, [...(bySkill.get(q.skill) ?? []), q]);
  const queues = shuffle([...bySkill.values()], random);
  const chosen: Question[] = [];
  while (chosen.length < config.count && queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next) chosen.push(next);
      if (chosen.length >= config.count) break;
    }
  }
  return { questionIds: chosen.map((q) => q.id) };
}

export function sessionTitle(config: SessionConfig): string {
  const track = getTrack(config.track);
  if (config.mode === "daily") return "Daily Challenge";
  if (config.mode === "review") return "Review session";
  const focus = config.skills?.length === 1 ? config.skills[0] : config.topics?.length === 1 ? config.topics[0] : config.sections?.length === 1 ? config.sections[0] : null;
  const base = `${MODE_LABELS[config.mode]} · ${track?.shortName ?? config.track}`;
  return focus ? `${base} · ${focus}` : base;
}

/** Suggested total time for a timed challenge or simulation, based on question estimates. */
export function suggestedTimeLimit(questionIds: string[], factor = 1): number {
  const total = questionIds.reduce((sum, id) => sum + (getQuestion(id)?.estimatedSeconds ?? 75), 0);
  return Math.max(60, Math.round((total * factor) / 30) * 30);
}

export function deadlineFor(startedAt: Date, timeLimitSec: number | null): string | null {
  return timeLimitSec ? new Date(startedAt.getTime() + timeLimitSec * 1000).toISOString() : null;
}
