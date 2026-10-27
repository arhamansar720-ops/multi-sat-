import { changePassword, requireUser } from "@/lib/server/auth";
import { ApiError } from "@/lib/server/errors";
import { ok, rateLimit, readJson, route } from "@/lib/server/http";

/** Changes the signed-in user's password and signs out their other devices. */
export const PUT = route(async (request: Request) => {
  const user = await requireUser();
  if (user.isGuest) throw new ApiError(403, "guest", "Create an account first to set a password.");
  rateLimit(`auth:password:${user.id}`, 5, 10 * 60_000);
  const body = (await readJson(request)) as { password?: unknown };
  await changePassword(user.id, String(body.password ?? ""));
  return ok({ updated: true });
});
