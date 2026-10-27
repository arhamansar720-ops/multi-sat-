import { ok, rateLimit, route } from "@/lib/server/http";
import { startMatch } from "@/lib/server/rooms";
import { requireUser } from "@/lib/server/auth";

export const POST = route(async (_request: Request, ctx: RouteContext<"/api/rooms/[code]/start">) => {
  const { code } = await ctx.params;
  const user = await requireUser();
  rateLimit(`room:start:${user.id}`, 10, 60_000);
  return ok(await startMatch(user, code));
});
