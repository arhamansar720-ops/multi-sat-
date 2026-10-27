import { fail, ok, route } from "@/lib/server/http";
import { getSessionForUser } from "@/lib/server/sessions";
import { requireUser } from "@/lib/server/auth";

export const GET = route(async (_request: Request, ctx: RouteContext<"/api/sessions/[id]">) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  const found = await getSessionForUser(user, id);
  if (!found) return fail(404, "not_found", "We couldn't find that session in your account.");
  return ok({ ...found, serverNow: Date.now() });
});
