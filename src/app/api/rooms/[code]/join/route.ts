import { ok, rateLimit, readJson, route } from "@/lib/server/http";
import { joinRoom } from "@/lib/server/rooms";
import { requireUser } from "@/lib/server/auth";

export const POST = route(async (request: Request, ctx: RouteContext<"/api/rooms/[code]/join">) => {
  const { code } = await ctx.params;
  const user = await requireUser();
  rateLimit(`room:join:${user.id}`, 30, 60_000);
  const body = (await readJson(request)) as Record<string, unknown>;
  return ok(await joinRoom(user, code, body.displayName));
});
