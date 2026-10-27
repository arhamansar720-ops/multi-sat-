/**
 * Database tests. They run against a real Postgres database (a throwaway
 * local one, never production) and are skipped unless DATABASE_URL is set:
 *   DATABASE_URL=postgres://postgres:postgres@localhost:5432/studyduel_test npm run test:db
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthUser } from "@/lib/server/auth";
import { getPool, maybeOne, query } from "@/lib/server/db";
import { ensureQuestionBank } from "@/lib/server/question-sync";
import { friendAction, getFriends, getLeaderboard } from "@/lib/server/social";

const enabled = Boolean(process.env.DATABASE_URL);

async function makeUser(tag: string, opts: { guest?: boolean } = {}): Promise<AuthUser> {
  const email = opts.guest ? null : `${tag.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const user = await maybeOne<{ id: string }>(
    "insert into public.users (email, password_hash, is_anonymous) values ($1, $2, $3) returning id",
    [email, opts.guest ? null : "scrypt$test", Boolean(opts.guest)],
  );
  const username = opts.guest ? null : `${tag.toLowerCase()}_${Math.random().toString(36).slice(2, 8)}`;
  await query("insert into public.profiles (id, username, display_name, is_guest) values ($1, $2, $3, $4)", [user!.id, username, tag, Boolean(opts.guest)]);
  await query("insert into public.user_preferences (user_id) values ($1)", [user!.id]);
  return { id: user!.id, email, isGuest: Boolean(opts.guest), displayName: tag, username };
}

describe.skipIf(!enabled)("database functions and invariants", () => {
  let victim: AuthUser;
  let attacker: AuthUser;
  const sessionId = crypto.randomUUID();

  beforeAll(async () => {
    await ensureQuestionBank();
    victim = await makeUser("Victim");
    attacker = await makeUser("Attacker");
    await query(
      "insert into public.study_sessions (id, user_id, mode, track, title, config, question_ids, status) values ($1, $2, 'quick', 'sat', 't', '{}', $3, 'completed')",
      [sessionId, victim.id, ["sat-math-alg-001"]],
    );
    await query("insert into public.xp_transactions (user_id, amount, reason, source_type, source_id) values ($1, 50, 'session_complete', 'session', $2)", [victim.id, sessionId]);
  });

  afterAll(async () => {
    await getPool()?.end();
  });

  it("keeps total_xp in sync with the ledger", async () => {
    const row = await maybeOne<{ total_xp: number }>("select total_xp from public.profiles where id = $1", [victim.id]);
    expect(row!.total_xp).toBe(50);
  });

  it("ledger rewards are idempotent per source", async () => {
    await expect(
      query("insert into public.xp_transactions (user_id, amount, reason, source_type, source_id) values ($1, 50, 'session_complete', 'session', $2)", [victim.id, sessionId]),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("completes a session exactly once", async () => {
    const id = crypto.randomUUID();
    await query(
      "insert into public.study_sessions (id, user_id, mode, track, title, config, question_ids) values ($1, $2, 'quick', 'sat', 't', '{}', $3)",
      [id, attacker.id, ["sat-math-alg-001"]],
    );
    const result = JSON.stringify({ completedAt: new Date().toISOString(), correctCount: 1, answeredCount: 1, total: 1, durationSec: 30 });
    const answers = JSON.stringify([{ question_id: "sat-math-alg-001", position: 0, response: ["A"], is_correct: true, time_ms: 1000, flagged: false }]);
    const xp = JSON.stringify([{ reason: "session_complete", amount: 20 }]);
    const call = () =>
      maybeOne<{ ok: boolean }>("select public.complete_study_session($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7, $8) as ok", [id, attacker.id, result, answers, xp, [], [], "2026-01-01"]);
    expect((await call())!.ok).toBe(true);
    expect((await call())!.ok).toBe(false);
    const xpRow = await maybeOne<{ total_xp: number }>("select total_xp from public.profiles where id = $1", [attacker.id]);
    expect(xpRow!.total_xp).toBe(20);
    // A different user can't complete someone else's session.
    const other = await maybeOne<{ ok: boolean }>("select public.complete_study_session($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7, $8) as ok", [sessionId, attacker.id, result, answers, xp, [], [], "2026-01-01"]);
    expect(other!.ok).toBe(false);
  });

  it("supports friend requests, acceptance, and a private friends leaderboard", async () => {
    expect(await friendAction(attacker, { action: "send", username: attacker.username })).toBe("self");
    expect(await friendAction(attacker, { action: "send", username: "no_such_user_zz" })).toBe("not_found");
    expect(await friendAction(attacker, { action: "send", username: victim.username })).toBe("sent");
    const { requests } = await getFriends(victim);
    const incoming = (requests as { id: string; direction: string }[]).find((r) => r.direction === "incoming")!;
    // The sender can't accept their own request.
    expect(await friendAction(attacker, { action: "respond", requestId: incoming.id, accept: true })).toBe("not_found");
    expect(await friendAction(victim, { action: "respond", requestId: incoming.id, accept: true })).toBe("accepted");
    const { friends } = await getFriends(attacker);
    expect((friends as { friend_id: string }[]).map((f) => f.friend_id)).toContain(victim.id);
    const rows = (await getLeaderboard(attacker, { period: "all", metric: "xp", scope: "friends" })) as { user_id: string; xp: number }[];
    expect(rows.find((r) => r.user_id === victim.id)?.xp).toBe(50);
    expect(JSON.stringify(rows)).not.toContain("@example.com");
  });

  it("blocks guests from friends features", async () => {
    const guest = await makeUser("Guest", { guest: true });
    await expect(friendAction(guest, { action: "send", username: victim.username })).rejects.toMatchObject({ status: 403 });
  });

  it("deleting a user removes all of their data", async () => {
    const temp = await makeUser("Temp");
    await query("delete from public.users where id = $1", [temp.id]);
    expect(await maybeOne("select 1 from public.profiles where id = $1", [temp.id])).toBeNull();
    expect(await maybeOne("select 1 from public.user_preferences where user_id = $1", [temp.id])).toBeNull();
  });
});
