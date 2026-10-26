import satMath from "@content/questions/sat-math.json";
import satRw from "@content/questions/sat-reading-writing.json";
import apStats from "@content/questions/ap-statistics.json";
import apes from "@content/questions/ap-environmental-science.json";
import apush from "@content/questions/ap-us-history.json";
import apLang from "@content/questions/ap-english-language.json";
import apCsp from "@content/questions/ap-computer-science-principles.json";
import apBio from "@content/questions/ap-biology.json";
import apChem from "@content/questions/ap-chemistry.json";
import apPhysics from "@content/questions/ap-physics-1.json";
import { getTrack, TRACKS, type TrackDef } from "./catalog";
import type { Difficulty, PublicQuestion, Question } from "./types";

/**
 * The bundled, original question bank. Files are validated by
 * `npm run content:validate` and by the unit test suite; at runtime we trust
 * the build-time-validated JSON.
 */
const FILES = [satMath, satRw, apStats, apes, apush, apLang, apCsp, apBio, apChem, apPhysics] as unknown as {
  questions: Question[];
}[];

export const QUESTIONS: readonly Question[] = FILES.flatMap((f) => f.questions);

const BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));

export function getQuestion(id: string): Question | undefined {
  return BY_ID.get(id);
}

export function getQuestions(ids: readonly string[]): Question[] {
  return ids.map((id) => BY_ID.get(id)).filter((q): q is Question => Boolean(q));
}

export function toPublicQuestion(q: Question, includeHint = false): PublicQuestion {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { correct, explanation, tolerance, hint, ...rest } = q;
  return includeHint && hint ? { ...rest, hint } : rest;
}

export function poolForTrack(track: TrackDef | string): Question[] {
  const def = typeof track === "string" ? getTrack(track) : track;
  if (!def) return [];
  return QUESTIONS.filter(
    (q) => def.courses.includes(q.course) && (!def.difficulties || def.difficulties.includes(q.difficulty)),
  );
}

export interface SkillNode {
  skill: string;
  count: number;
}
export interface TopicNode {
  topic: string;
  count: number;
  skills: SkillNode[];
}
export interface SectionNode {
  section: string;
  count: number;
  topics: TopicNode[];
}

/** Section → topic → skill outline derived from the questions a track can draw from. */
export function outlineForTrack(track: TrackDef | string): SectionNode[] {
  const pool = poolForTrack(track);
  const sections = new Map<string, Map<string, Map<string, number>>>();
  for (const q of pool) {
    const topics = sections.get(q.section) ?? new Map<string, Map<string, number>>();
    const skills = topics.get(q.topic) ?? new Map<string, number>();
    skills.set(q.skill, (skills.get(q.skill) ?? 0) + 1);
    topics.set(q.topic, skills);
    sections.set(q.section, topics);
  }
  return [...sections.entries()].map(([section, topics]) => {
    const topicNodes = [...topics.entries()].map(([topic, skills]) => {
      const skillNodes = [...skills.entries()].map(([skill, count]) => ({ skill, count }));
      return { topic, count: skillNodes.reduce((s, n) => s + n.count, 0), skills: skillNodes };
    });
    return { section, count: topicNodes.reduce((s, n) => s + n.count, 0), topics: topicNodes };
  });
}

export function trackCounts(): Record<string, { total: number; byDifficulty: Record<Difficulty, number> }> {
  const out: Record<string, { total: number; byDifficulty: Record<Difficulty, number> }> = {};
  for (const t of TRACKS) {
    const pool = poolForTrack(t);
    out[t.slug] = {
      total: pool.length,
      byDifficulty: {
        easy: pool.filter((q) => q.difficulty === "easy").length,
        medium: pool.filter((q) => q.difficulty === "medium").length,
        hard: pool.filter((q) => q.difficulty === "hard").length,
      },
    };
  }
  return out;
}

/** Track a question "belongs" to for labeling (first full track containing its course). */
export function trackForQuestion(q: Question): TrackDef | undefined {
  return TRACKS.find((t) => t.courses.includes(q.course) && !t.difficulties);
}
