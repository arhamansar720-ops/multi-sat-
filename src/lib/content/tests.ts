import { z } from "zod";
import testFile from "@content/tests/practice-tests.json";

/**
 * Fixed practice-test forms, modeled on the digital testing format: timed
 * modules, an optional break between sections, and no returning to a module
 * after it ends. Forms reference original questions from the bank by id.
 */
export const testModuleSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  section: z.string().min(1),
  minutes: z.number().int().min(1).max(180),
  questionIds: z.array(z.string()).min(1).max(60),
});

export const practiceTestSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  track: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  /** Module indexes followed by a break screen. */
  breakAfter: z.array(z.number().int().min(0)),
  modules: z.array(testModuleSchema).min(1).max(8),
});

export const testFileSchema = z.object({ tests: z.array(practiceTestSchema) });

export type TestModule = z.infer<typeof testModuleSchema>;
export type PracticeTest = z.infer<typeof practiceTestSchema>;

export const BREAK_MINUTES = 10;

export const PRACTICE_TESTS: readonly PracticeTest[] = (testFile as unknown as { tests: PracticeTest[] }).tests;

export function getPracticeTest(id: string | undefined): PracticeTest | undefined {
  return id ? PRACTICE_TESTS.find((t) => t.id === id) : undefined;
}

export function testsForTrack(track: string): PracticeTest[] {
  return PRACTICE_TESTS.filter((t) => t.track === track);
}

export function testQuestionIds(test: PracticeTest): string[] {
  return test.modules.flatMap((m) => m.questionIds);
}

export function testQuestionCount(test: PracticeTest): number {
  return test.modules.reduce((s, m) => s + m.questionIds.length, 0);
}

/** Total time including breaks; used as the server-side outer deadline. */
export function testTotalSeconds(test: PracticeTest): number {
  return test.modules.reduce((s, m) => s + m.minutes * 60, 0) + test.breakAfter.length * BREAK_MINUTES * 60;
}

/** Index of the module containing a global question index. */
export function moduleIndexForQuestion(test: PracticeTest, questionIndex: number): number {
  let seen = 0;
  for (let i = 0; i < test.modules.length; i++) {
    seen += test.modules[i]!.questionIds.length;
    if (questionIndex < seen) return i;
  }
  return test.modules.length - 1;
}

/** Global index of the first question in a module. */
export function moduleOffset(test: PracticeTest, moduleIndex: number): number {
  return test.modules.slice(0, moduleIndex).reduce((s, m) => s + m.questionIds.length, 0);
}
