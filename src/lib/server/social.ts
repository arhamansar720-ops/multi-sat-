import { z } from "zod";
import type { AuthUser } from "./auth";
import { maybeOne, query } from "./db";
import { ApiError } from "./errors";

/** The friends functions raise SQLSTATE 28000 for guests; surface their message. */
async function asRegistered<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (e.code === "28000") throw new ApiError(403, "registered_only", e.message ?? "Create a free account to add friends.");
    throw err;
  }
}

export async function getFriends(user: AuthUser) {
  return asRegistered(async () => {
    const [friends, requests] = await Promise.all([
      query("select * from public.get_friends_overview($1)", [user.id]),
      query("select * from public.list_friend_requests($1)", [user.id]),
    ]);
    return { friends, requests };
  });
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send"), username: z.string().trim().max(40) }),
  z.object({ action: z.literal("respond"), requestId: z.uuid(), accept: z.boolean() }),
  z.object({ action: z.literal("cancel"), requestId: z.uuid() }),
  z.object({ action: z.literal("remove"), friendId: z.uuid() }),
]);

export async function friendAction(user: AuthUser, raw: unknown): Promise<string> {
  const a = actionSchema.parse(raw);
  return asRegistered(async () => {
    const row =
      a.action === "send"
        ? await maybeOne<{ r: string }>("select public.send_friend_request($1, $2) as r", [user.id, a.username])
        : a.action === "respond"
          ? await maybeOne<{ r: string }>("select public.respond_friend_request($1, $2, $3) as r", [user.id, a.requestId, a.accept])
          : a.action === "cancel"
            ? await maybeOne<{ r: string }>("select public.cancel_friend_request($1, $2) as r", [user.id, a.requestId])
            : await maybeOne<{ r: string }>("select public.remove_friend($1, $2) as r", [user.id, a.friendId]);
    return row?.r ?? "not_found";
  });
}

export const leaderboardQuerySchema = z.object({
  period: z.enum(["week", "month", "all"]).default("week"),
  metric: z.enum(["xp", "correct", "wins", "consistency"]).default("xp"),
  scope: z.enum(["global", "friends"]).default("global"),
});

export async function getLeaderboard(user: AuthUser, raw: unknown) {
  const q = leaderboardQuerySchema.parse(raw);
  return query("select * from public.get_leaderboard($1, $2, $3, $4, 50)", [user.id, q.period, q.metric, q.scope]);
}
