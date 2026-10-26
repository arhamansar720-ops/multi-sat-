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

describe("practice tests and course directory", async () => {
  const { PRACTICE_TESTS, testFileSchema, testQuestionIds, moduleIndexForQuestion, moduleOffset } = await import("@/lib/content/tests");
  const { DIRECTORY, searchCourses, getDirectoryCourse } = await import("@/lib/content/course-directory");
  const { getQuestion } = await import("@/lib/content/bank");
  const { normalizeConfig, selectQuestions } = await import("@/lib/engine/selection");

  it("test forms are valid and reference questions from their own track", () => {
    expect(testFileSchema.safeParse({ tests: PRACTICE_TESTS }).success).toBe(true);
    for (const t of PRACTICE_TESTS) {
      const ids = testQuestionIds(t);
      expect(new Set(ids).size, t.id).toBe(ids.length);
      const pool = new Set(poolForTrack(t.track).map((q) => q.id));
      for (const id of ids) {
        expect(getQuestion(id), `${t.id} ${id}`).toBeDefined();
        expect(pool.has(id), `${t.id} ${id} not in ${t.track}`).toBe(true);
      }
      for (const b of t.breakAfter) expect(b).toBeLessThan(t.modules.length - 1);
    }
  });

  it("every track with questions has a practice test and a directory entry", () => {
    for (const t of TRACKS) {
      expect(PRACTICE_TESTS.some((x) => x.track === t.slug), t.slug).toBe(true);
      expect(DIRECTORY.some((c) => c.track === t.slug), t.slug).toBe(true);
    }
  });

  it("maps question indexes to modules", () => {
    const sat = PRACTICE_TESTS.find((t) => t.id === "sat-practice-test-1")!;
    expect(moduleIndexForQuestion(sat, 0)).toBe(0);
    expect(moduleIndexForQuestion(sat, moduleOffset(sat, 2))).toBe(2);
    expect(moduleOffset(sat, 1)).toBe(sat.modules[0]!.questionIds.length);
  });

  it("test sessions take timing and questions from the form, not the client", () => {
    const sat = PRACTICE_TESTS.find((t) => t.id === "sat-practice-test-1")!;
    const cfg = normalizeConfig({ mode: "test", track: "sat", testId: sat.id, difficulty: "hard", count: 1, timeLimitSec: 60, feedback: "immediate", hints: true });
    expect(cfg.timeLimitSec).toBeGreaterThan(sat.modules.reduce((s, m) => s + m.minutes * 60, 0));
    expect(cfg).toMatchObject({ feedback: "end", hints: false, difficulty: "mixed", count: testQuestionIds(sat).length });
    expect(selectQuestions(cfg, "x").questionIds).toEqual(testQuestionIds(sat));
    expect(selectQuestions({ ...cfg, track: "ap-biology" }, "x").questionIds).toEqual([]);
  });

  it("directory slugs are unique, links are https, and search understands nicknames", () => {
    expect(new Set(DIRECTORY.map((c) => c.slug)).size).toBe(DIRECTORY.length);
    for (const c of DIRECTORY) for (const l of c.officialLinks) expect(l.url).toMatch(/^https:\/\//);
    expect(searchCourses("apush")[0]?.slug).toBe("ap-united-states-history");
    expect(searchCourses("calc").map((c) => c.slug)).toEqual(expect.arrayContaining(["ap-calculus-ab", "ap-calculus-bc"]));
    expect(searchCourses("APES")[0]?.slug).toBe("ap-environmental-science");
    expect(searchCourses("psat")[0]?.program).toBe("SAT Suite");
    expect(searchCourses("zzzz")).toEqual([]);
    expect(getDirectoryCourse("ap-latin")?.track).toBeUndefined();
  });
});
