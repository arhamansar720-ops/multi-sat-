import { fail, ok, route } from "@/lib/server/http";
import { getSessionForUser } from "@/lib/server/sessions";
import { requireUser } from "@/lib/supabase/server";

export const GET = route(async (_request: Request, ctx: RouteContext<"/api/sessions/[id]">) => {
  const { id } = await ctx.params;
  const { userDb } = await requireUser();
  const found = await getSessionForUser(userDb, id);
  if (!found) return fail(404, "not_found", "We couldn't find that session in your account.");
  return ok({ ...found, serverNow: Date.now() });
});
