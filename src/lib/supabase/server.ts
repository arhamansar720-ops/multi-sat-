import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getPublicConfig, getServiceRoleKey } from "@/lib/config";

/** User-scoped server client: queries run with the caller's JWT, so RLS applies. */
export async function createUserSupabase(): Promise<SupabaseClient | null> {
  const cfg = getPublicConfig();
  if (cfg.mode !== "connected" || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return null;
  const store = await cookies();
  return createServerClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component: cookies are read-only there; proxy.ts refreshes sessions.
        }
      },
    },
  });
}

let admin: SupabaseClient | null = null;

/**
 * Service-role client for trusted writes (scores, XP, room state). Server-only:
 * the key is read from a non-public env var and never sent to the browser.
 */
export function getAdminSupabase(): SupabaseClient | null {
  if (typeof window !== "undefined") throw new Error("getAdminSupabase must only run on the server");
  const cfg = getPublicConfig();
  const key = getServiceRoleKey();
  if (cfg.mode !== "connected" || !cfg.supabaseUrl || !key) return null;
  if (!admin) {
    admin = createClient(cfg.supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return admin;
}

export interface AuthedContext {
  user: User;
  userDb: SupabaseClient;
  admin: SupabaseClient;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Resolves the signed-in user (including anonymous guests) or throws a safe ApiError. */
export async function requireUser(): Promise<AuthedContext> {
  const userDb = await createUserSupabase();
  if (!userDb) throw new ApiError(503, "not_configured", "Online features are not configured on this deployment.");
  const admin = getAdminSupabase();
  if (!admin) {
    throw new ApiError(503, "server_misconfigured", "The server is missing SUPABASE_SERVICE_ROLE_KEY, so online features are unavailable.");
  }
  const { data, error } = await userDb.auth.getUser();
  if (error || !data.user) throw new ApiError(401, "unauthenticated", "Please sign in (or continue as a guest) first.");
  return { user: data.user, userDb, admin };
}
