import { ok, rateLimit, readJson, route } from "@/lib/server/http";
import { submitMatchAnswer } from "@/lib/server/rooms";
import { requireUser } from "@/lib/server/auth";

export const POST = route(async (request: Request, ctx: RouteContext<"/api/rooms/[code]/answer">) => {
  const { code } = await ctx.params;
  const user = await requireUser();
  rateLimit(`room:answer:${user.id}`, 60, 60_000);
  const body = (await readJson(request)) as Record<string, unknown>;
  return ok(await submitMatchAnswer(user, code, body));
});
