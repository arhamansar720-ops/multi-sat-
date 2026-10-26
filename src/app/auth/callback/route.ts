import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createUserSupabase } from "@/lib/supabase/server";

/** Handles email confirmation, magic-link, and password-recovery redirects from Supabase Auth. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawNext = url.searchParams.get("next") ?? "/dashboard";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";
  const supabase = await createUserSupabase();
  if (!supabase) return NextResponse.redirect(new URL("/dashboard", url.origin));

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  let ok = false;
  if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;

  return NextResponse.redirect(new URL(ok ? next : "/auth/sign-in?error=link", url.origin));
}
