import { ok, rateLimit, readJson, route } from "@/lib/server/http";
import { leaveRoom } from "@/lib/server/rooms";
import { requireUser } from "@/lib/supabase/server";

export const POST = route(async (request: Request, ctx: RouteContext<"/api/rooms/[code]/leave">) => {
  const { code } = await ctx.params;
  const { user, admin } = await requireUser();
  rateLimit(`room:leave:${user.id}`, 30, 60_000);
  const body = (await readJson(request)) as Record<string, unknown>;
  return ok(await leaveRoom(admin, user, code));
});
