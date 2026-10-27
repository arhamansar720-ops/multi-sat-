import { ok, rateLimit, route } from "@/lib/server/http";
import { advanceRoom } from "@/lib/server/rooms";
import { requireUser } from "@/lib/server/auth";

export const POST = route(async (_request: Request, ctx: RouteContext<"/api/rooms/[code]/advance">) => {
  const { code } = await ctx.params;
  const user = await requireUser();
  rateLimit(`room:advance:${user.id}`, 120, 60_000);
  return ok(await advanceRoom(user, code));
});
