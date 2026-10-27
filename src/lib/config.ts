/**
 * Central product + runtime configuration.
 * Rename the product by editing PRODUCT below; nothing else hardcodes the name.
 */
export const PRODUCT = {
  name: "StudyDuel",
  tagline: "Study smarter. Compete harder.",
  description:
    "Original practice for the SAT, PSAT, and AP exams, with solo study modes and live quiz matches against friends.",
  supportEmail: "support@example.com",
  disclaimer:
    "StudyDuel is an independent study tool. It is not affiliated with, endorsed by, or sponsored by College Board. SAT, PSAT/NMSQT, and AP are trademarks registered by College Board.",
} as const;

export type AppMode = "demo" | "connected";

/** What the browser is told about the backend. Contains no secrets. */
export interface PublicConfigStatus {
  mode: AppMode;
  /** The database variable is set but unusable: likely a broken deployment. */
  misconfigured: boolean;
  problems: string[];
  /** Password reset emails can be sent (an email provider is configured). */
  passwordResetEnabled: boolean;
}

/** Server-only: the Postgres connection string (Render: the database's External/Internal URL). */
export function getDatabaseUrl(): string | null {
  if (typeof window !== "undefined") return null;
  if (process.env.NEXT_PUBLIC_FORCE_DEMO_MODE === "true") return null;
  const url = process.env.DATABASE_URL?.trim() || null;
  return url && /^postgres(ql)?:\/\//.test(url) ? url : null;
}

/** Server-only: Resend API settings for password reset emails. */
export function getEmailConfig(): { apiKey: string; from: string } | null {
  if (typeof window !== "undefined") return null;
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  return apiKey && from ? { apiKey, from } : null;
}

/**
 * Computed on the server (root layout, health route) and passed to the
 * browser, so DATABASE_URL never needs a NEXT_PUBLIC_ twin.
 */
export function getServerConfig(): PublicConfigStatus {
  const problems: string[] = [];
  const passwordResetEnabled = Boolean(getEmailConfig());
  if (process.env.NEXT_PUBLIC_FORCE_DEMO_MODE === "true") {
    return { mode: "demo", misconfigured: false, problems, passwordResetEnabled: false };
  }
  const raw = process.env.DATABASE_URL?.trim();
  if (raw && !getDatabaseUrl()) problems.push("DATABASE_URL must be a postgres:// or postgresql:// connection string.");
  if (getDatabaseUrl()) return { mode: "connected", misconfigured: false, problems, passwordResetEnabled };
  return { mode: "demo", misconfigured: problems.length > 0, problems, passwordResetEnabled: false };
}
