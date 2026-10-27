import { getEmailConfig } from "@/lib/config";
import { completePasswordReset, createPasswordReset, emailSchema } from "@/lib/server/auth";
import { sendPasswordResetEmail } from "@/lib/server/email";
import { ApiError } from "@/lib/server/errors";
import { clientIp, ok, rateLimit, readJson, route } from "@/lib/server/http";

/** Emails a one-time reset link. Responds the same way whether or not the account exists. */
export const POST = route(async (request: Request) => {
  rateLimit(`auth:reset:${clientIp(request)}`, 5, 10 * 60_000);
  if (!getEmailConfig()) throw new ApiError(503, "email_not_configured", "Password reset emails aren't set up on this deployment yet. Ask the site owner for help.");
  const body = (await readJson(request)) as { email?: unknown };
  const token = await createPasswordReset(body.email);
  if (token) {
    const origin = process.env.APP_URL?.trim().replace(/\/$/, "") || new URL(request.url).origin;
    const link = `${origin}/auth/update-password?token=${encodeURIComponent(token)}`;
    await sendPasswordResetEmail(emailSchema.parse(body.email), link);
  }
  return ok({ sent: true });
});

/** Sets a new password from a reset link and signs the user in. */
export const PUT = route(async (request: Request) => {
  rateLimit(`auth:reset-confirm:${clientIp(request)}`, 10, 10 * 60_000);
  const body = (await readJson(request)) as { token?: unknown; password?: unknown };
  await completePasswordReset(body.token, body.password);
  return ok({ updated: true });
});
