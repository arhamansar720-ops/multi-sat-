import { requireUser } from "@/lib/server/auth";
import { ok, rateLimit, route } from "@/lib/server/http";
import { getLeaderboard } from "@/lib/server/social";

export const GET = route(async (request: Request) => {
  const user = await requireUser();
  rateLimit(`leaderboard:${user.id}`, 60, 60_000);
  const params = Object.fromEntries(new URL(request.url).searchParams);
  return ok({ rows: await getLeaderboard(user, params) });
});
