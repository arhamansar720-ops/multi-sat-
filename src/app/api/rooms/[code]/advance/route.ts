import { ok, rateLimit, route } from "@/lib/server/http";
import { advanceRoom } from "@/lib/server/rooms";
import { requireUser } from "@/lib/supabase/server";

export const POST = route(async (_request: Request, ctx: RouteContext<"/api/rooms/[code]/advance">) => {
  const { code } = await ctx.params;
  const { user, admin } = await requireUser();
  rateLimit(`room:advance:${user.id}`, 120, 60_000);
  return ok(await advanceRoom(admin, user, code));
});
