import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicConfig } from "@/lib/config";

/** Refreshes the Supabase auth cookie on each request (no-op in demo mode). */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const cfg = getPublicConfig();
  if (cfg.mode !== "connected" || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return response;

  const supabase = createServerClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  try {
    await supabase.auth.getUser();
  } catch {
    // Supabase temporarily unreachable: let the request through; pages show their own errors.
  }
  return response;
}
