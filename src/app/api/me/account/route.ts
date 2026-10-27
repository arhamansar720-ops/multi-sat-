import { endSession, requireUser } from "@/lib/server/auth";
import { query } from "@/lib/server/db";
import { ApiError } from "@/lib/server/errors";
import { ok, rateLimit, readJson, route } from "@/lib/server/http";

/** Permanently deletes the caller's account. Cascades remove all of their study data. */
export const DELETE = route(async (request: Request) => {
  const user = await requireUser();
  rateLimit(`account:delete:${user.id}`, 3, 60_000);
  const body = (await readJson(request)) as { confirm?: unknown };
  if (body.confirm !== "DELETE") throw new ApiError(400, "confirmation_required", 'Type DELETE to confirm.');
  await query("delete from public.users where id = $1", [user.id]);
  await endSession();
  return ok({ deleted: true });
});
