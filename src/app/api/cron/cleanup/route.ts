import { getPool, query } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";

/** Closes stale rooms and expires old sign-in sessions. Called by Vercel Cron with Authorization: Bearer CRON_SECRET. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return fail(401, "unauthorized", "Unauthorized");
  if (!getPool()) return fail(503, "not_configured", "DATABASE_URL is not configured.");
  try {
    const rows = await query<{ closed: number }>("select public.cleanup_stale_rooms() as closed");
    return ok({ closed: rows[0]?.closed ?? 0 });
  } catch {
    return fail(502, "database_error", "Cleanup failed.");
  }
}
