import { ok, rateLimit, readJson, route } from "@/lib/server/http";
import { createRoom } from "@/lib/server/rooms";
import { requireUser } from "@/lib/supabase/server";

export const POST = route(async (request: Request) => {
  const { user, admin } = await requireUser();
  rateLimit(`room:create:${user.id}`, 5, 60_000);
  const body = (await readJson(request)) as { settings?: unknown; displayName?: unknown };
  return ok(await createRoom(admin, user, { settings: body.settings, displayName: body.displayName }), { status: 201 });
});
