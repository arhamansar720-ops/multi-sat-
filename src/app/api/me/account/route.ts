import { dbError, ok, rateLimit, readJson, route } from "@/lib/server/http";
import { ApiError, requireUser } from "@/lib/supabase/server";

/** Permanently deletes the caller's account. Cascades remove all of their study data. */
export const DELETE = route(async (request: Request) => {
  const { user, admin } = await requireUser();
  rateLimit(`account:delete:${user.id}`, 3, 60_000);
  const body = (await readJson(request)) as { confirm?: unknown };
  if (body.confirm !== "DELETE") throw new ApiError(400, "confirmation_required", 'Type DELETE to confirm.');
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) dbError(error, "delete user");
  return ok({ deleted: true });
});
