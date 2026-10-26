import { ok, rateLimit, readJson, route } from "@/lib/server/http";
import { startMatch } from "@/lib/server/rooms";
import { requireUser } from "@/lib/supabase/server";

export const POST = route(async (request: Request, ctx: RouteContext<"/api/rooms/[code]/start">) => {
  const { code } = await ctx.params;
  const { user, admin } = await requireUser();
  rateLimit(`room:start:${user.id}`, 10, 60_000);
  const body = (await readJson(request)) as Record<string, unknown>;
  return ok(await startMatch(admin, user, code));
});
