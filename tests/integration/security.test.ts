/**
 * Database authorization tests. They run against a real Supabase instance and
 * are skipped unless these variables are set (e.g. from `supabase start`):
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 * Run with: npm run test:db
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(URL && ANON && SR);
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

async function makeUser(admin: SupabaseClient, tag: string) {
  const email = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "password123", email_confirm: true, user_metadata: { display_name: tag } });
  if (error) throw error;
  const client = createClient(URL!, ANON!, opts);
  await client.auth.signInWithPassword({ email, password: "password123" });
  const { data: profile } = await admin.from("profiles").select("username").eq("id", data.user.id).single();
  return { id: data.user.id, client, username: profile!.username as string };
}

describe.skipIf(!enabled)("row level security and trusted functions", () => {
  let admin: SupabaseClient;
  let victim: Awaited<ReturnType<typeof makeUser>>;
  let attacker: Awaited<ReturnType<typeof makeUser>>;
  const sessionId = crypto.randomUUID();

  beforeAll(async () => {
    admin = createClient(URL!, SR!, opts);
    victim = await makeUser(admin, "Victim");
    attacker = await makeUser(admin, "Attacker");
    await admin.from("study_sessions").insert({ id: sessionId, user_id: victim.id, mode: "quick", track: "sat", title: "t", config: {}, question_ids: ["sat-math-alg-001"], status: "completed" });
    await admin.from("xp_transactions").insert({ user_id: victim.id, amount: 50, reason: "session_complete", source_type: "session", source_id: sessionId });
  });

  it("hides other users' study history, XP, and profiles", async () => {
    expect((await attacker.client.from("study_sessions").select("*").eq("user_id", victim.id)).data).toEqual([]);
    expect((await attacker.client.from("xp_transactions").select("*").eq("user_id", victim.id)).data).toEqual([]);
    expect((await attacker.client.from("profiles").select("*").eq("id", victim.id)).data).toEqual([]);
    expect((await attacker.client.from("question_keys").select("*").limit(1)).data ?? []).toEqual([]);
  });

  it("prevents XP manipulation", async () => {
    expect((await attacker.client.from("profiles").update({ total_xp: 999999 }).eq("id", attacker.id)).error).toBeTruthy();
    expect((await attacker.client.from("xp_transactions").insert({ user_id: attacker.id, amount: 1000, reason: "match_win", source_type: "match", source_id: sessionId })).error).toBeTruthy();
    const rpc = await attacker.client.rpc("complete_study_session", {
      p_session_id: sessionId, p_user_id: attacker.id, p_result: {}, p_answers: [], p_xp: [{ reason: "match_win", amount: 1000 }],
      p_xp_question_ids: [], p_achievements: [], p_activity_date: "2026-01-01",
    });
    expect(rpc.error).toBeTruthy();
    expect((await attacker.client.rpc("finalize_match", { p_match_id: sessionId, p_participants: [], p_xp: [], p_achievements: [], p_activity: [] })).error).toBeTruthy();
    const { data } = await admin.from("profiles").select("total_xp").eq("id", victim.id).single();
    expect(data!.total_xp).toBe(50);
  });

  it("lets users edit only safe profile fields on their own row", async () => {
    const own = await attacker.client.from("profiles").update({ display_name: "Renamed" }).eq("id", attacker.id).select();
    expect(own.error).toBeNull();
    expect(own.data).toHaveLength(1);
    const other = await attacker.client.from("profiles").update({ display_name: "Pwned" }).eq("id", victim.id).select();
    expect(other.data ?? []).toHaveLength(0);
  });

  it("ledger rewards are idempotent per source", async () => {
    const dup = await admin.from("xp_transactions").insert({ user_id: victim.id, amount: 50, reason: "session_complete", source_type: "session", source_id: sessionId });
    expect(dup.error?.code).toBe("23505");
  });

  it("supports friend requests, acceptance, and a private friends leaderboard", async () => {
    expect((await attacker.client.rpc("send_friend_request", { p_username: attacker.username })).data).toBe("self");
    expect((await attacker.client.rpc("send_friend_request", { p_username: "no_such_user_zz" })).data).toBe("not_found");
    expect((await attacker.client.rpc("send_friend_request", { p_username: victim.username })).data).toBe("sent");
    const { data: reqs } = await victim.client.rpc("list_friend_requests");
    const incoming = (reqs as { id: string; direction: string }[]).find((r) => r.direction === "incoming")!;
    // The sender can't accept their own request.
    expect((await attacker.client.rpc("respond_friend_request", { p_request_id: incoming.id, p_accept: true })).data).toBe("not_found");
    expect((await victim.client.rpc("respond_friend_request", { p_request_id: incoming.id, p_accept: true })).data).toBe("accepted");
    const { data: friends } = await attacker.client.rpc("get_friends_overview");
    expect((friends as { friend_id: string }[]).map((f) => f.friend_id)).toContain(victim.id);
    const { data: board, error } = await attacker.client.rpc("get_leaderboard", { p_period: "all", p_metric: "xp", p_scope: "friends", p_limit: 50 });
    expect(error).toBeNull();
    const rows = board as { user_id: string; xp: number; is_me: boolean }[];
    expect(rows.find((r) => r.user_id === victim.id)?.xp).toBe(50);
    expect(JSON.stringify(rows)).not.toContain("@example.com");
  });

  it("blocks signed-out callers from leaderboards and anonymous guests from friends", async () => {
    const anon = createClient(URL!, ANON!, opts);
    expect((await anon.rpc("get_leaderboard", {})).error).toBeTruthy();
    const guest = createClient(URL!, ANON!, opts);
    const { error } = await guest.auth.signInAnonymously();
    if (!error) expect((await guest.rpc("send_friend_request", { p_username: victim.username })).error).toBeTruthy();
  });
});
