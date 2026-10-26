import { fail, ok } from "@/lib/server/http";
import { getAdminSupabase } from "@/lib/supabase/server";

/** Closes stale rooms. Called by Vercel Cron with Authorization: Bearer CRON_SECRET. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return fail(401, "unauthorized", "Unauthorized");
  const admin = getAdminSupabase();
  if (!admin) return fail(503, "not_configured", "Supabase is not configured.");
  const { data, error } = await admin.rpc("cleanup_stale_rooms");
  if (error) return fail(502, "database_error", "Cleanup failed.");
  return ok({ closed: data });
}
