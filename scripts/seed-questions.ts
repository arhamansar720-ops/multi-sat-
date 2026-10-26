/**
 * Upserts the bundled question bank into a Supabase project using the service
 * role key. Reads .env.local if present.
 *   npm run db:seed
 * (The app also syncs the bank automatically on first use, so this is optional.)
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile } from "node:process";
import { syncQuestionBank } from "../src/lib/server/question-sync";

try {
  loadEnvFile(".env.local");
} catch {
  // fall back to the process environment
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (in .env.local or the environment).");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });
syncQuestionBank(admin)
  .then(() => console.log("✓ Question bank seeded."))
  .catch((err) => {
    console.error("✗ Seeding failed:", err.message);
    process.exit(1);
  });
