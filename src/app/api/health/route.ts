import { getPublicConfig, getServiceRoleKey } from "@/lib/config";
import { QUESTIONS } from "@/lib/content/bank";
import { ok } from "@/lib/server/http";
import { bankVersion } from "@/lib/server/question-sync";
import { getAdminSupabase } from "@/lib/supabase/server";

/** Configuration and connectivity report. Never returns secret values. */
export async function GET() {
  const cfg = getPublicConfig();
  const report: Record<string, unknown> = {
    mode: cfg.mode,
    misconfigured: cfg.misconfigured,
    problems: [...cfg.problems],
    questionBank: { questions: QUESTIONS.length, version: bankVersion() },
    serviceRoleConfigured: Boolean(getServiceRoleKey()),
    database: "not_configured",
  };
  if (cfg.mode === "connected") {
    if (!getServiceRoleKey()) (report.problems as string[]).push("SUPABASE_SERVICE_ROLE_KEY is missing; online features are disabled.");
    const admin = getAdminSupabase();
    if (admin) {
      const { data, error } = await admin.from("app_meta").select("value").eq("key", "question_bank_version").maybeSingle();
      report.database = error ? "unreachable_or_missing_schema" : "ok";
      report.questionBankSynced = !error && data?.value === bankVersion();
      if (error) (report.problems as string[]).push("Could not query the database. Check the URL and that migrations have been applied.");
    }
  }
  return ok(report);
}
