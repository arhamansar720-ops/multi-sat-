/**
 * Applies pending database migrations to DATABASE_URL. Reads .env.local if present.
 *   npm run db:migrate
 * (The app also migrates automatically on first use, so this is optional.)
 */
import { loadEnvFile } from "node:process";
import { getPool, migrate } from "../src/lib/server/db";

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
migrate(pool, (msg) => console.log(msg))
  .then((applied) => console.log(applied.length ? `✓ Applied ${applied.length} migration(s).` : "✓ Database is up to date."))
  .catch((err) => {
    console.error("✗ Migration failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
