import { requireUser } from "@/lib/server/auth";
import { maybeOne } from "@/lib/server/db";
import { ok, route } from "@/lib/server/http";
import { loadActivity } from "@/lib/server/sessions";

export const GET = route(async () => {
  const user = await requireUser();
  const [activity, profile] = await Promise.all([
    loadActivity(user),
    maybeOne("select username::text as username, is_guest, total_xp from public.profiles where id = $1", [user.id]),
  ]);
  return ok({ activity, profile });
});
