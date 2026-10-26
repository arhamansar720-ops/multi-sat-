import { ok, rateLimit, readJson, route } from "@/lib/server/http";
import { submitMatchAnswer } from "@/lib/server/rooms";
import { requireUser } from "@/lib/supabase/server";

export const POST = route(async (request: Request, ctx: RouteContext<"/api/rooms/[code]/answer">) => {
  const { code } = await ctx.params;
  const { user, admin } = await requireUser();
  rateLimit(`room:answer:${user.id}`, 60, 60_000);
  const body = (await readJson(request)) as Record<string, unknown>;
  return ok(await submitMatchAnswer(admin, user, code, body));
});
