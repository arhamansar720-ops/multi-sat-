/**
 * Validates every file in content/questions against the schema and checks
 * cross-file rules (unique ids, known courses, answer keys that grade).
 *   npm run content:validate
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { COURSES } from "../src/lib/content/catalog";
import { isResponseCorrect } from "../src/lib/content/grading";
import { questionFileSchema, questionSchema } from "../src/lib/content/schema";
import type { Question } from "../src/lib/content/types";

const dir = join(process.cwd(), "content/questions");
const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.endsWith(".schema.json"));
const courseIds = new Set(COURSES.map((c) => c.id));
const seen = new Map<string, string>();
let errors = 0;
let total = 0;

for (const file of files) {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(join(dir, file), "utf8"));
  } catch (err) {
    console.error(`✗ ${file}: invalid JSON (${(err as Error).message})`);
    errors++;
    continue;
  }
  const parsed = questionFileSchema.safeParse(json);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) console.error(`✗ ${file} ${issue.path.join(".")}: ${issue.message}`);
    errors += parsed.error.issues.length;
    continue;
  }
  for (const q of parsed.data.questions as Question[]) {
    total++;
    if (seen.has(q.id)) {
      console.error(`✗ ${file}: duplicate id ${q.id} (also in ${seen.get(q.id)})`);
      errors++;
    }
    seen.set(q.id, file);
    if (!courseIds.has(q.course)) {
      console.error(`✗ ${file} ${q.id}: unknown course "${q.course}" (add it to src/lib/content/catalog.ts)`);
      errors++;
    }
    const key = q.type === "numeric" ? [q.correct[0]!] : q.correct;
    if (!isResponseCorrect(q, key)) {
      console.error(`✗ ${file} ${q.id}: the answer key does not grade as correct`);
      errors++;
    }
  }
}

// Keep the editor-facing JSON Schema in sync with the zod schema.
const jsonSchema = z.toJSONSchema(z.object({ $schema: z.string().optional(), questions: z.array(questionSchema) }), { unrepresentable: "any" });
writeFileSync(join(dir, "question-file.schema.json"), `${JSON.stringify(jsonSchema, null, 2)}\n`);

if (errors) {
  console.error(`\n${errors} problem(s) found in ${files.length} file(s).`);
  process.exit(1);
}
console.log(`✓ ${total} questions in ${files.length} files are valid.`);
