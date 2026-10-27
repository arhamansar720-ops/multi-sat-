import { signIn } from "@/lib/server/auth";
import { clientIp, ok, rateLimit, readJson, route } from "@/lib/server/http";

export const POST = route(async (request: Request) => {
  const body = (await readJson(request)) as { email?: unknown; password?: unknown };
  rateLimit(`auth:sign-in:${clientIp(request)}`, 20, 10 * 60_000);
  rateLimit(`auth:sign-in:${String(body.email ?? "").trim().toLowerCase()}`, 10, 10 * 60_000);
  await signIn(body);
  return ok({ signedIn: true });
});
