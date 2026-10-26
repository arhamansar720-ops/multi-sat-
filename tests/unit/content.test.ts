import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { QUESTIONS, poolForTrack, outlineForTrack } from "@/lib/content/bank";
import { COURSES, TRACKS } from "@/lib/content/catalog";
import { questionFileSchema } from "@/lib/content/schema";
import { isResponseCorrect } from "@/lib/content/grading";

const dir = join(process.cwd(), "content/questions");

describe("question bank", () => {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.endsWith(".schema.json"));

  it.each(files)("%s matches the schema", (file) => {
    const parsed = questionFileSchema.safeParse(JSON.parse(readFileSync(join(dir, file), "utf8")));
    if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues.slice(0, 5), null, 2));
  });

  it("has unique ids and known courses", () => {
    const ids = QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    const courseIds = new Set(COURSES.map((c) => c.id));
    for (const q of QUESTIONS) expect(courseIds.has(q.course), q.id).toBe(true);
  });

  it("meets the minimum coverage targets", () => {
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(60);
    for (const course of ["sat-math", "sat-rw", "ap-statistics", "ap-environmental-science", "ap-us-history", "ap-english-language"]) {
      expect(QUESTIONS.filter((q) => q.course === course).length, course).toBeGreaterThanOrEqual(8);
    }
    expect(QUESTIONS.filter((q) => q.course === "sat-math").length).toBeGreaterThan(10);
    expect(QUESTIONS.filter((q) => q.course === "sat-rw").length).toBeGreaterThan(10);
  });

  it("every keyed answer grades as correct and every other choice as incorrect", () => {
    for (const q of QUESTIONS) {
      expect(isResponseCorrect(q, q.type === "numeric" ? [q.correct[0]!] : q.correct), q.id).toBe(true);
      if (q.type === "mcq") {
        for (const c of q.choices!) if (c.id !== q.correct[0]) expect(isResponseCorrect(q, [c.id]), `${q.id} ${c.id}`).toBe(false);
      }
    }
  });

  it("does not skew the answer key toward one letter", () => {
    const mcq = QUESTIONS.filter((q) => q.type === "mcq");
    const counts: Record<string, number> = {};
    for (const q of mcq) counts[q.correct[0]!] = (counts[q.correct[0]!] ?? 0) + 1;
    for (const letter of ["A", "B", "C", "D"]) expect(counts[letter] ?? 0).toBeLessThan(mcq.length * 0.4);
  });

  it("explanations reference the keyed answer for numeric questions", () => {
    for (const q of QUESTIONS.filter((x) => x.type === "numeric")) {
      const mentioned = q.correct.some((v) => q.explanation.includes(v.replace(/^0\./, ".").replace(/^\./, "0.")) || q.explanation.includes(v));
      expect(mentioned, q.id).toBe(true);
    }
  });

  it("every track with content produces an outline", () => {
    for (const t of TRACKS) {
      expect(poolForTrack(t).length, t.slug).toBeGreaterThan(0);
      expect(outlineForTrack(t).length, t.slug).toBeGreaterThan(0);
    }
  });
});
