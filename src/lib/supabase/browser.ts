"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicConfig } from "@/lib/config";

let client: SupabaseClient | null = null;

/** Browser client using the public anon/publishable key. Returns null in demo mode. */
export function getBrowserSupabase(): SupabaseClient | null {
  const cfg = getPublicConfig();
  if (cfg.mode !== "connected" || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return null;
  if (!client) client = createBrowserClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  return client;
}
