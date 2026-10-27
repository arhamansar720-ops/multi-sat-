import { endSession } from "@/lib/server/auth";
import { ok, route } from "@/lib/server/http";

export const POST = route(async () => {
  await endSession();
  return ok({ signedOut: true });
});
