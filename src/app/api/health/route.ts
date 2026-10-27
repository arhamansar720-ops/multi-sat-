import { getServerConfig } from "@/lib/config";
import { QUESTIONS } from "@/lib/content/bank";
import { maybeOne } from "@/lib/server/db";
import { ok } from "@/lib/server/http";
import { bankVersion } from "@/lib/server/question-sync";

/** Configuration and connectivity report. Never returns secret values. */
export async function GET() {
  const cfg = getServerConfig();
  const report: Record<string, unknown> = {
    mode: cfg.mode,
    misconfigured: cfg.misconfigured,
    problems: [...cfg.problems],
    questionBank: { questions: QUESTIONS.length, version: bankVersion() },
    passwordResetEmails: cfg.passwordResetEnabled,
    notes: [] as string[],
    database: "not_configured",
  };
  if (cfg.mode === "connected") {
    try {
      // Also applies any pending migrations on first use.
      const row = await maybeOne<{ value: string }>("select value from public.app_meta where key = 'question_bank_version'");
      report.database = "ok";
      report.questionBankSynced = row?.value === bankVersion();
    } catch (err) {
      console.error("[health] database check failed", err);
      report.database = "unreachable";
      (report.problems as string[]).push("Could not reach the database. Check DATABASE_URL (use the External Database URL when the app isn't hosted on Render).");
    }
    if (!cfg.passwordResetEnabled) (report.notes as string[]).push("RESEND_API_KEY / EMAIL_FROM are not set, so password reset emails are disabled.");
  }
  return ok(report);
}
