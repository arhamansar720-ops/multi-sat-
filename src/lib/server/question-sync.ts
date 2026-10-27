import type { PoolClient } from "pg";
import { QUESTIONS } from "@/lib/content/bank";
import { COURSES, TRACKS } from "@/lib/content/catalog";
import { hashString } from "@/lib/content/random";
import { ACHIEVEMENTS } from "@/lib/progression/achievements";
import { json, maybeOne, tx } from "./db";

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

type Row = Record<string, unknown>;
/** Columns stored as jsonb; everything else is passed as-is (text[] arrays included). */
const JSONB = new Set(["content", "correct"]);

async function upsert(client: PoolClient, table: string, rows: Row[], key: string): Promise<void> {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]!);
  const params: unknown[] = [];
  const values = rows.map(
    (r) =>
      `(${cols
        .map((c) => {
          params.push(JSONB.has(c) ? json(r[c]) : r[c]);
          return `$${params.length}${JSONB.has(c) ? "::jsonb" : ""}`;
        })
        .join(", ")})`,
  );
  const updates = cols.filter((c) => c !== key).map((c) => `${c} = excluded.${c}`).join(", ");
  await client.query(`insert into public.${table} (${cols.join(", ")}) values ${values.join(", ")} on conflict (${key}) do update set ${updates}`, params);
}

export async function syncQuestionBank(): Promise<void> {
  const rows = catalogRows();
  await tx(async (client) => {
    await upsert(client, "exams", rows.exams, "id");
    await upsert(client, "courses", rows.courses, "id");
    await upsert(client, "questions", rows.questions, "id");
    await upsert(client, "question_keys", rows.keys, "question_id");
    await upsert(client, "achievements", rows.achievements, "id");
    await client.query(
      "insert into public.app_meta (key, value) values ('question_bank_version', $1) on conflict (key) do update set value = excluded.value, updated_at = now()",
      [bankVersion()],
    );
  });
}

let synced: Promise<void> | null = null;

/**
 * Ensures the database has the bundled question bank (needed for foreign keys
 * on answers). Runs once per server instance and only writes when the bundled
 * content changed, so deployments work without a separate seed step.
 */
export function ensureQuestionBank(): Promise<void> {
  if (!synced) {
    synced = (async () => {
      const row = await maybeOne<{ value: string }>("select value from public.app_meta where key = 'question_bank_version'");
      if (row?.value !== bankVersion()) await syncQuestionBank();
    })().catch((err) => {
      synced = null;
      throw err;
    });
  }
  return synced;
}
