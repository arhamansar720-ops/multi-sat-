import { getSessionUser, signUp } from "@/lib/server/auth";
import { clientIp, ok, rateLimit, readJson, route } from "@/lib/server/http";

/** Creates an account, or upgrades the current guest account in place (keeping its progress). */
export const POST = route(async (request: Request) => {
  rateLimit(`auth:sign-up:${clientIp(request)}`, 10, 60 * 60_000);
  const body = (await readJson(request)) as { email?: unknown; password?: unknown; displayName?: unknown };
  const current = await getSessionUser();
  await signUp({ email: String(body.email ?? ""), password: String(body.password ?? ""), displayName: String(body.displayName ?? "") }, current);
  return ok({ created: true }, { status: 201 });
});

