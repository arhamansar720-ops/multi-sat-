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

export interface PublicConfigStatus {
  mode: AppMode;
  /** Supabase variables were partially provided: likely a broken deployment. */
  misconfigured: boolean;
  problems: string[];
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
}

/**
 * Reads only NEXT_PUBLIC_* variables so it is safe for client and server.
 * Must reference process.env.NEXT_PUBLIC_* literally so Next can inline them.
 */
export function getPublicConfig(): PublicConfigStatus {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    null;
  const forceDemo = process.env.NEXT_PUBLIC_FORCE_DEMO_MODE === "true";
  const problems: string[] = [];

  if (forceDemo) {
    return { mode: "demo", misconfigured: false, problems, supabaseUrl: null, supabaseAnonKey: null };
  }
  if (url && !key) problems.push("NEXT_PUBLIC_SUPABASE_URL is set but NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
  if (!url && key) problems.push("NEXT_PUBLIC_SUPABASE_ANON_KEY is set but NEXT_PUBLIC_SUPABASE_URL is missing.");
  if (url && !/^https?:\/\//.test(url)) problems.push("NEXT_PUBLIC_SUPABASE_URL must start with http:// or https://.");

  if (url && key && problems.length === 0) {
    return { mode: "connected", misconfigured: false, problems, supabaseUrl: url, supabaseAnonKey: key };
  }
  return { mode: "demo", misconfigured: problems.length > 0, problems, supabaseUrl: null, supabaseAnonKey: null };
}

/** Server-only check; never import the returned key into client code. */
export function getServiceRoleKey(): string | null {
  if (typeof window !== "undefined") return null;
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim() || null;
}
