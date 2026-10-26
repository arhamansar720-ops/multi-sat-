import { ok, rateLimit, route } from "@/lib/server/http";
import { leaveRoom } from "@/lib/server/rooms";
import { requireUser } from "@/lib/supabase/server";

export const POST = route(async (_request: Request, ctx: RouteContext<"/api/rooms/[code]/leave">) => {
  const { code } = await ctx.params;
  const { user, admin } = await requireUser();
  rateLimit(`room:leave:${user.id}`, 30, 60_000);
  return ok(await leaveRoom(admin, user, code));
});
