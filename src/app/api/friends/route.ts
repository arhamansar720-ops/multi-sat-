import { requireUser } from "@/lib/server/auth";
import { ok, rateLimit, readJson, route } from "@/lib/server/http";
import { friendAction, getFriends } from "@/lib/server/social";

export const GET = route(async () => {
  const user = await requireUser();
  return ok(await getFriends(user));
});

/** { action: "send", username } | { action: "respond", requestId, accept } | { action: "cancel", requestId } | { action: "remove", friendId } */
export const POST = route(async (request: Request) => {
  const user = await requireUser();
  rateLimit(`friends:${user.id}`, 30, 60_000);
  return ok({ result: await friendAction(user, await readJson(request)) });
});
