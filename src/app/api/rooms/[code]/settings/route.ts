import { ok, rateLimit, readJson, route } from "@/lib/server/http";
import { updateRoomSettings } from "@/lib/server/rooms";
import { requireUser } from "@/lib/supabase/server";

export const PUT = route(async (request: Request, ctx: RouteContext<"/api/rooms/[code]/settings">) => {
  const { code } = await ctx.params;
  const { user, admin } = await requireUser();
  rateLimit(`room:settings:${user.id}`, 30, 60_000);
  const body = (await readJson(request)) as { settings?: unknown };
  await updateRoomSettings(admin, user, code, body.settings);
  return ok({ ok: true });
});
