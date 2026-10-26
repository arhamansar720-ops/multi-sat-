import type { SupabaseClient } from "@supabase/supabase-js";
import { QUESTIONS } from "@/lib/content/bank";
import { COURSES, TRACKS } from "@/lib/content/catalog";
import { hashString } from "@/lib/content/random";
import { ACHIEVEMENTS } from "@/lib/progression/achievements";
import { ApiError } from "@/lib/supabase/server";

export function bankVersion(): string {
  return hashString(JSON.stringify({ QUESTIONS, COURSES, TRACKS, ACHIEVEMENTS })).toString(36);
}

/** Rows for the catalog tables, shared by the runtime sync and the seed scripts. */
export function catalogRows() {
  return {
    exams: TRACKS.map((t, i) => ({
      id: t.slug, name: t.name, program: t.program, coverage: t.coverage, course_ids: t.courses, difficulties: t.difficulties ?? null, sort_order: i,
    })),
    courses: COURSES.map((c) => ({ id: c.id, program: c.exam, name: c.name })),
    questions: QUESTIONS.map((q) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { correct, tolerance, explanation, ...content } = q;
      return {
        id: q.id, exam: q.exam, course_id: q.course, section: q.section, topic: q.topic, skill: q.skill, difficulty: q.difficulty,
        type: q.type, content, estimated_seconds: q.estimatedSeconds, tags: q.tags, version: q.version, is_active: true,
      };
    }),
    keys: QUESTIONS.map((q) => ({ question_id: q.id, correct: q.correct, tolerance: q.tolerance ?? null, explanation: q.explanation })),
    achievements: ACHIEVEMENTS.map((a) => ({ id: a.id, name: a.name, description: a.description, icon: a.icon })),
  };
}

export async function syncQuestionBank(admin: SupabaseClient): Promise<void> {
  const rows = catalogRows();
  const steps: [string, Record<string, unknown>[], string][] = [
    ["exams", rows.exams, "id"],
    ["courses", rows.courses, "id"],
    ["questions", rows.questions, "id"],
    ["question_keys", rows.keys, "question_id"],
    ["achievements", rows.achievements, "id"],
  ];
  for (const [table, data, onConflict] of steps) {
    const { error } = await admin.from(table).upsert(data, { onConflict });
    if (error) throw new Error(`sync ${table}: ${error.message}`);
  }
  const { error } = await admin.from("app_meta").upsert({ key: "question_bank_version", value: bankVersion(), updated_at: new Date().toISOString() });
  if (error) throw new Error(`sync app_meta: ${error.message}`);
}

let synced: Promise<void> | null = null;

/**
 * Ensures the database has the bundled question bank (needed for foreign keys
 * on answers). Runs once per server instance and only writes when the bundled
 * content changed, so deployments work even if the seed step was skipped.
 */
export function ensureQuestionBank(admin: SupabaseClient): Promise<void> {
  if (!synced) {
    synced = (async () => {
      const { data, error } = await admin.from("app_meta").select("value").eq("key", "question_bank_version").maybeSingle();
      if (error) {
        if (/relation .* does not exist|schema cache/i.test(error.message)) {
          throw new ApiError(503, "schema_missing", "Database tables are missing. Run the SQL migrations in supabase/migrations first.");
        }
        throw new Error(error.message);
      }
      if (data?.value !== bankVersion()) await syncQuestionBank(admin);
    })().catch((err) => {
      synced = null;
      throw err;
    });
  }
  return synced;
}
