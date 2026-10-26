import { getQuestion, outlineForTrack, poolForTrack } from "@/lib/content/bank";
import { COURSES, getTrack } from "@/lib/content/catalog";
import type { Difficulty, QuestionType } from "@/lib/content/types";
import type { MatchSummary, SessionResult, UserActivity } from "@/lib/engine/types";
import { addDays, computeStreak, localDateKey, shortWeekday, type StreakInfo, weekStart } from "./dates";
import { attemptsFromResults, computeSkillMastery, type SkillMastery } from "./mastery";
import { levelInfo, type LevelInfo } from "./xp";

export interface DayActivity {
  key: string;
  label: string;
  questions: number;
  correct: number;
  minutes: number;
  xp: number;
}

export interface BreakdownRow {
  key: string;
  label: string;
  answered: number;
  correct: number;
  accuracy: number | null;
}

export interface ReadinessRow {
  track: string;
  name: string;
  skillsTotal: number;
  skillsPracticed: number;
  skillsStrong: number;
  /** Share of the track's skills rated Strong (0..1). A practice indicator, not a score prediction. */
  indicator: number;
}

export interface ProgressSnapshot {
  totalXp: number;
  level: LevelInfo;
  questionsAnswered: number;
  correct: number;
  accuracy: number | null;
  studySeconds: number;
  sessionsCompleted: number;
  streak: StreakInfo;
  today: { key: string; minutes: number; questions: number; goalMinutes: number; progress: number };
  week: { days: DayActivity[]; minutes: number; goalMinutes: number; progress: number; xp: number };
  last7: DayActivity[];
  skills: SkillMastery[];
  strongest: SkillMastery[];
  weakest: SkillMastery[];
  byCourse: BreakdownRow[];
  byDifficulty: BreakdownRow[];
  byType: BreakdownRow[];
  readiness: ReadinessRow[];
  recent: SessionResult[];
  matches: { played: number; online: number; wins: number };
  activeDays: string[];
  isEmpty: boolean;
}

const TYPE_LABEL: Record<QuestionType, string> = { mcq: "Multiple choice", multi: "Multi-select", numeric: "Student-produced response" };

/** Sessions with at least one answer count toward a streak day. */
function qualifyingDays(results: SessionResult[], matches: MatchSummary[], tz: string): Set<string> {
  const days = new Set<string>();
  for (const r of results) if (r.answeredCount > 0) days.add(localDateKey(r.completedAt, tz));
  for (const m of matches) days.add(localDateKey(m.finishedAt, tz));
  return days;
}

function row(key: string, label: string, answered: number, correct: number): BreakdownRow {
  return { key, label, answered, correct, accuracy: answered ? correct / answered : null };
}

export function computeProgress(activity: UserActivity, now = new Date()): ProgressSnapshot {
  const tz = activity.preferences.timezone;
  const results = [...activity.results].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const totalXp = activity.xpLedger.reduce((s, e) => s + e.amount, 0);
  const todayKey = localDateKey(now, tz);

  let questionsAnswered = 0;
  let correct = 0;
  let studySeconds = 0;
  const dayMap = new Map<string, DayActivity>();
  const ensureDay = (key: string) => {
    let d = dayMap.get(key);
    if (!d) {
      d = { key, label: shortWeekday(key), questions: 0, correct: 0, minutes: 0, xp: 0 };
      dayMap.set(key, d);
    }
    return d;
  };

  const courseAgg = new Map<string, { a: number; c: number }>();
  const diffAgg = new Map<Difficulty, { a: number; c: number }>();
  const typeAgg = new Map<QuestionType, { a: number; c: number }>();

  for (const r of results) {
    questionsAnswered += r.answeredCount;
    correct += r.correctCount;
    studySeconds += r.durationSec;
    const d = ensureDay(localDateKey(r.completedAt, tz));
    d.questions += r.answeredCount;
    d.correct += r.correctCount;
    d.minutes += r.durationSec / 60;
    for (const item of r.items) {
      if (!item.response) continue;
      const q = getQuestion(item.questionId);
      if (!q) continue;
      const add = (m: Map<string, { a: number; c: number }>, k: string) => {
        const v = m.get(k) ?? { a: 0, c: 0 };
        v.a++;
        if (item.correct) v.c++;
        m.set(k, v);
      };
      add(courseAgg, q.course);
      add(diffAgg as Map<string, { a: number; c: number }>, q.difficulty);
      add(typeAgg as Map<string, { a: number; c: number }>, q.type);
    }
  }
  for (const e of activity.xpLedger) ensureDay(localDateKey(e.createdAt, tz)).xp += e.amount;

  const streak = computeStreak(qualifyingDays(results, activity.matches, tz), todayKey);
  const goalMinutes = activity.preferences.dailyMinutes;
  const today = dayMap.get(todayKey);
  const mondayKey = weekStart(todayKey);
  const weekDays: DayActivity[] = Array.from({ length: 7 }, (_, i) => {
    const key = addDays(mondayKey, i);
    return dayMap.get(key) ?? { key, label: shortWeekday(key), questions: 0, correct: 0, minutes: 0, xp: 0 };
  });
  const last7: DayActivity[] = Array.from({ length: 7 }, (_, i) => {
    const key = addDays(todayKey, i - 6);
    return dayMap.get(key) ?? { key, label: shortWeekday(key), questions: 0, correct: 0, minutes: 0, xp: 0 };
  });
  const weekMinutes = weekDays.reduce((s, d) => s + d.minutes, 0);
  const weeklyGoal = goalMinutes * 5;

  const skills = computeSkillMastery(attemptsFromResults(results));
  const rated = skills.filter((s) => s.score !== null);
  const strongest = rated.filter((s) => (s.score ?? 0) >= 0.6).slice(0, 3);
  const weakest = [...rated].sort((a, b) => (a.score ?? 0) - (b.score ?? 0)).filter((s) => (s.score ?? 1) < 0.8).slice(0, 3);

  const readiness: ReadinessRow[] = activity.preferences.tracks
    .map((slug) => getTrack(slug))
    .filter((t): t is NonNullable<typeof t> => Boolean(t))
    .map((t) => {
      const courses = new Set(poolForTrack(t).map((q) => q.course));
      const skillNames = new Set(outlineForTrack(t).flatMap((s) => s.topics.flatMap((tp) => tp.skills.map((sk) => sk.skill))));
      const mine = skills.filter((s) => courses.has(s.course) && skillNames.has(s.skill));
      const strong = mine.filter((s) => s.band === "strong").length;
      return {
        track: t.slug,
        name: t.name,
        skillsTotal: skillNames.size,
        skillsPracticed: mine.length,
        skillsStrong: strong,
        indicator: skillNames.size ? strong / skillNames.size : 0,
      };
    });

  const online = activity.matches.filter((m) => m.kind === "online");
  return {
    totalXp,
    level: levelInfo(totalXp),
    questionsAnswered,
    correct,
    accuracy: questionsAnswered ? correct / questionsAnswered : null,
    studySeconds,
    sessionsCompleted: results.length,
    streak,
    today: {
      key: todayKey,
      minutes: today?.minutes ?? 0,
      questions: today?.questions ?? 0,
      goalMinutes,
      progress: goalMinutes ? Math.min(1, (today?.minutes ?? 0) / goalMinutes) : 0,
    },
    week: {
      days: weekDays,
      minutes: weekMinutes,
      goalMinutes: weeklyGoal,
      progress: weeklyGoal ? Math.min(1, weekMinutes / weeklyGoal) : 0,
      xp: weekDays.reduce((s, d) => s + d.xp, 0),
    },
    last7,
    skills,
    strongest,
    weakest,
    byCourse: COURSES.filter((c) => courseAgg.has(c.id)).map((c) => row(c.id, c.name, courseAgg.get(c.id)!.a, courseAgg.get(c.id)!.c)),
    byDifficulty: (["easy", "medium", "hard"] as const).map((d) => row(d, d[0]!.toUpperCase() + d.slice(1), diffAgg.get(d)?.a ?? 0, diffAgg.get(d)?.c ?? 0)),
    byType: (["mcq", "multi", "numeric"] as const).map((t) => row(t, TYPE_LABEL[t], typeAgg.get(t)?.a ?? 0, typeAgg.get(t)?.c ?? 0)),
    readiness,
    recent: results.slice(0, 6),
    matches: { played: activity.matches.length, online: online.length, wins: online.filter((m) => m.won).length },
    activeDays: [...qualifyingDays(results, activity.matches, tz)].sort(),
    isEmpty: results.length === 0 && activity.matches.length === 0,
  };
}

/** Same windows used by the achievements engine. */
export function weeklyMinutesFor(activity: UserActivity, now = new Date()): number {
  return computeProgress(activity, now).week.minutes;
}
