import { ok, route } from "@/lib/server/http";
import { loadActivity } from "@/lib/server/sessions";
import { requireUser } from "@/lib/supabase/server";

export const GET = route(async () => {
  const { user, userDb } = await requireUser();
  const activity = await loadActivity(userDb, user);
  const { data: profile } = await userDb.from("profiles").select("username, is_guest, total_xp").eq("id", user.id).maybeSingle();
  return ok({ activity, profile });
});
