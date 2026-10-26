import { outlineForTrack, poolForTrack } from "@/lib/content/bank";
import { getTrack, primaryTrackForCourse } from "@/lib/content/catalog";
import type { SessionConfig } from "@/lib/engine/types";
import type { SkillMastery } from "./mastery";

export interface Recommendation {
  title: string;
  reason: string;
  config: SessionConfig;
}

function focusConfig(track: string, skill: string): SessionConfig {
  const count = Math.min(10, Math.max(3, poolForTrack(track).filter((q) => q.skill === skill).length));
  return { mode: "focus", track, skills: [skill], difficulty: "mixed", count, timeLimitSec: null, feedback: "immediate", hints: true };
}

/**
 * Explainable recommendation:
 * 1. If a rated skill is below 80% mastery, recommend the weakest one,
 *    preferring skills with more attempts (more confidence in the estimate).
 * 2. Otherwise recommend the least-practiced skill in the student's first track.
 * 3. For brand-new students, recommend a 5-question Quick Practice.
 */
export function recommendNext(skills: SkillMastery[], preferredTracks: string[]): Recommendation {
  const rated = skills.filter((s) => s.score !== null);
  const strong = [...rated].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  const weak = rated
    .filter((s) => (s.score ?? 1) < 0.8)
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0) || b.attempts - a.attempts)[0];

  if (weak) {
    const track = primaryTrackForCourse(weak.course)?.slug ?? preferredTracks[0] ?? "sat";
    const prefix =
      strong && strong.key !== weak.key && (strong.score ?? 0) >= 0.8
        ? `You have strong accuracy in ${strong.skill.toLowerCase()}. `
        : "";
    return {
      title: `Focus: ${weak.skill}`,
      reason: `${prefix}Try a focused session on ${weak.skill.toLowerCase()} next. Your recent mastery there is ${Math.round(
        (weak.score ?? 0) * 100,
      )}% across ${weak.attempts} attempts.`,
      config: focusConfig(track, weak.skill),
    };
  }

  const trackSlug = preferredTracks.find((t) => getTrack(t)) ?? "sat";
  const outline = outlineForTrack(trackSlug);
  const practiced = new Map(skills.map((s) => [s.skill, s.attempts]));
  const candidates = outline.flatMap((s) => s.topics.flatMap((t) => t.skills.map((sk) => sk.skill)));
  if (skills.length === 0 || candidates.length === 0) {
    return {
      title: "Start with Quick Practice",
      reason: "Answer five mixed questions so we can learn where you are strong and where to focus.",
      config: { mode: "quick", track: trackSlug, difficulty: "mixed", count: 5, timeLimitSec: null, feedback: "immediate", hints: true },
    };
  }
  const leastPracticed = [...candidates].sort((a, b) => (practiced.get(a) ?? 0) - (practiced.get(b) ?? 0))[0]!;
  return {
    title: `Explore: ${leastPracticed}`,
    reason: strong
      ? `You have strong accuracy in ${strong.skill.toLowerCase()}. Broaden your coverage with ${leastPracticed.toLowerCase()}, which you have practiced least.`
      : `You have practiced ${leastPracticed.toLowerCase()} the least. A short focused set will add it to your mastery map.`,
    config: focusConfig(trackSlug, leastPracticed),
  };
}
