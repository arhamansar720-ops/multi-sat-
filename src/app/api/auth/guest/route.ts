import { getSessionUser, signInAsGuest } from "@/lib/server/auth";
import { clientIp, ok, rateLimit, readJson, route } from "@/lib/server/http";

/** Creates a guest (anonymous) account so students can play online without an email. */
export const POST = route(async (request: Request) => {
  if (await getSessionUser()) return ok({ created: false });
  rateLimit(`auth:guest:${clientIp(request)}`, 20, 60 * 60_000);
  const body = (await readJson(request)) as { displayName?: unknown };
  await signInAsGuest(body.displayName);
  return ok({ created: true }, { status: 201 });
});
