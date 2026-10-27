import { getServerConfig } from "@/lib/config";
import { getSessionUser } from "@/lib/server/auth";
import { ok, route } from "@/lib/server/http";

/** The signed-in user (or null). Never fails in demo mode. */
export const GET = route(async () => {
  if (getServerConfig().mode !== "connected") return ok({ user: null });
  return ok({ user: await getSessionUser() });
});
