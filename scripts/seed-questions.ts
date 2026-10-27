/**
 * Applies migrations and upserts the bundled question bank into the database
 * in DATABASE_URL. Reads .env.local if present.
 *   npm run db:seed
 * (The app also does both automatically on first use, so this is optional.)
 */
import { loadEnvFile } from "node:process";
import { getPool } from "../src/lib/server/db";
import { syncQuestionBank } from "../src/lib/server/question-sync";

try {
  loadEnvFile(".env.local");
} catch {
  // fall back to the process environment
}

const pool = getPool();
if (!pool) {
  console.error("Set DATABASE_URL (in .env.local or the environment).");
  process.exit(1);
}
syncQuestionBank()
  .then(() => console.log("✓ Question bank seeded."))
  .catch((err) => {
    console.error("✗ Seeding failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
