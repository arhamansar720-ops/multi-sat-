import { ok, rateLimit, route } from "@/lib/server/http";
import { getRoomState } from "@/lib/server/rooms";
import { requireUser } from "@/lib/server/auth";

/** Room state for members; a minimal join preview for non-members. Room codes alone never grant access. */
export const GET = route(async (_request: Request, ctx: RouteContext<"/api/rooms/[code]">) => {
  const { code } = await ctx.params;
  const user = await requireUser();
  rateLimit(`room:state:${user.id}`, 240, 60_000);
  return ok(await getRoomState(user, code));
});
