import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { cookies } from "next/headers";
import type { PoolClient } from "pg";
import { z } from "zod";
import { displayNameSchema } from "@/lib/multiplayer/rules";
import { maybeOne, query, tx } from "./db";
import { ApiError } from "./errors";

export const SESSION_COOKIE = "sd_session";
const SESSION_DAYS = 30;
/** Sessions are extended (and the cookie re-set) at most this often. */
const ROLL_AFTER_MS = 24 * 3_600_000;

export interface AuthUser {
  id: string;
  email: string | null;
  isGuest: boolean;
  displayName: string;
  username: string | null;
}

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email address.");
export const passwordSchema = z.string().min(8, "Use a password with at least 8 characters.").max(200, "That password is too long.");

// ---------------------------------------------------------------------------
// Passwords: scrypt with a per-password salt, stored as scrypt$N$r$p$salt$hash.
// ---------------------------------------------------------------------------
const SCRYPT = { N: 16384, r: 8, p: 1, keyLen: 64 };

function scrypt(password: string, salt: Buffer, keyLen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCb(password, salt, keyLen, opts, (err, key) => (err ? reject(err) : resolve(key))));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, SCRYPT.keyLen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const parts = stored?.split("$");
  if (!parts || parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash!, "base64");
  const key = await scrypt(password.normalize("NFKC"), Buffer.from(salt!, "base64"), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Spend the same time on unknown emails as on wrong passwords. */
const DUMMY_HASH = hashPassword("not-a-real-password");
export async function burnPasswordCheck(password: string): Promise<void> {
  await verifyPassword(password, await DUMMY_HASH);
}

// ---------------------------------------------------------------------------
// Tokens and cookies
// ---------------------------------------------------------------------------
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function setSessionCookie(token: string, expires: Date) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

/** Creates a sign-in session for the user and sets the cookie. */
export async function startSession(userId: string, client?: PoolClient): Promise<void> {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const sql = "insert into public.auth_sessions (token_hash, user_id, expires_at) values ($1, $2, $3)";
  if (client) await client.query(sql, [hashToken(token), userId, expires.toISOString()]);
  else await query(sql, [hashToken(token), userId, expires.toISOString()]);
  await setSessionCookie(token, expires);
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await query("delete from public.auth_sessions where token_hash = $1", [hashToken(token)]).catch(() => {});
  store.delete(SESSION_COOKIE);
}

interface SessionUserRow {
  id: string;
  email: string | null;
  is_anonymous: boolean;
  display_name: string;
  username: string | null;
  last_used_at: string;
  expires_at: string;
}

/** The signed-in user (including guests), or null. */
export async function getSessionUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const tokenHash = hashToken(token);
  const row = await maybeOne<SessionUserRow>(
    `select u.id, u.email::text as email, u.is_anonymous, p.display_name, p.username::text as username, s.last_used_at, s.expires_at
       from public.auth_sessions s
       join public.users u on u.id = s.user_id
       join public.profiles p on p.id = u.id
      where s.token_hash = $1 and s.expires_at > now()`,
    [tokenHash],
  );
  if (!row) return null;
  if (Date.now() - new Date(row.last_used_at).getTime() > ROLL_AFTER_MS) {
    const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
    await query("update public.auth_sessions set last_used_at = now(), expires_at = $2 where token_hash = $1", [tokenHash, expires.toISOString()]);
    // Cookies can only be written from route handlers; elsewhere the DB extension is enough.
    await setSessionCookie(token, expires).catch(() => {});
  }
  return { id: row.id, email: row.email, isGuest: row.is_anonymous, displayName: row.display_name, username: row.username };
}

/** Resolves the signed-in user (including guests) or throws a safe ApiError. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getSessionUser();
  if (!user) throw new ApiError(401, "unauthenticated", "Please sign in (or continue as a guest) first.");
  return user;
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------
function randomUsername(): string {
  return `student_${randomBytes(4).toString("hex")}`;
}

/** Creates a user plus profile and preferences rows. Usernames are random (never derived from email). */
async function insertUser(
  client: PoolClient,
  input: { email: string | null; passwordHash: string | null; displayName: string | null },
): Promise<string> {
  const guest = input.email === null;
  const name = input.displayName && input.displayName.length >= 2 ? input.displayName : "Student";
  const { rows } = await client.query<{ id: string }>(
    "insert into public.users (email, password_hash, is_anonymous) values ($1, $2, $3) returning id",
    [input.email, input.passwordHash, guest],
  );
  const id = rows[0]!.id;
  await client.query(
    "insert into public.profiles (id, username, display_name, is_guest, leaderboard_opt_in) values ($1, $2, $3, $4, $5)",
    [id, guest ? null : randomUsername(), name, guest, !guest],
  );
  await client.query("insert into public.user_preferences (user_id) values ($1)", [id]);
  return id;
}

export async function signUp(input: { email: string; password: string; displayName: string }, current: AuthUser | null): Promise<void> {
  const email = emailSchema.parse(input.email);
  const password = passwordSchema.parse(input.password);
  const displayName = displayNameSchema.parse(input.displayName);
  const passwordHash = await hashPassword(password);
  try {
    await tx(async (client) => {
      if (current?.isGuest) {
        // Upgrade the guest account in place so existing progress is kept.
        await client.query("update public.users set email = $2, password_hash = $3, is_anonymous = false where id = $1", [current.id, email, passwordHash]);
        await client.query(
          `update public.profiles set is_guest = false, leaderboard_opt_in = true, display_name = $2,
             username = coalesce(username, $3) where id = $1`,
          [current.id, displayName, randomUsername()],
        );
        return;
      }
      const id = await insertUser(client, { email, passwordHash, displayName });
      await startSession(id, client);
    });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      throw new ApiError(409, "email_taken", "An account with that email already exists. Try signing in.");
    }
    throw err;
  }
}

export async function signIn(input: { email?: unknown; password?: unknown }): Promise<void> {
  const email = emailSchema.safeParse(input.email);
  const password = typeof input.password === "string" ? input.password : "";
  const invalid = new ApiError(401, "invalid_credentials", "That email and password don't match an account.");
  if (!email.success || !password) throw invalid;
  const row = await maybeOne<{ id: string; password_hash: string | null }>(
    "select id, password_hash from public.users where email = $1 and not is_anonymous",
    [email.data],
  );
  if (!row) {
    await burnPasswordCheck(password);
    throw invalid;
  }
  if (!(await verifyPassword(password, row.password_hash))) throw invalid;
  await startSession(row.id);
}

export async function signInAsGuest(displayName: unknown): Promise<void> {
  const parsed = typeof displayName === "string" && displayName.trim() ? displayNameSchema.parse(displayName) : null;
  await tx(async (client) => {
    const id = await insertUser(client, { email: null, passwordHash: null, displayName: parsed });
    await startSession(id, client);
  });
}

/** Sets a new password and signs out every other device. */
export async function changePassword(userId: string, newPassword: string): Promise<void> {
  const password = passwordSchema.parse(newPassword);
  const passwordHash = await hashPassword(password);
  await tx(async (client) => {
    await client.query("update public.users set password_hash = $2 where id = $1 and not is_anonymous", [userId, passwordHash]);
    await client.query("delete from public.auth_sessions where user_id = $1", [userId]);
    await startSession(userId, client);
  });
}

const RESET_TTL_MS = 60 * 60_000;

/** Returns a reset token for the email's account, or null if there is none (callers must not reveal which). */
export async function createPasswordReset(rawEmail: unknown): Promise<string | null> {
  const email = emailSchema.safeParse(rawEmail);
  if (!email.success) return null;
  const user = await maybeOne<{ id: string }>("select id from public.users where email = $1 and not is_anonymous", [email.data]);
  if (!user) return null;
  const recent = await maybeOne<{ n: number }>(
    "select count(*)::int as n from public.password_resets where user_id = $1 and created_at > now() - interval '1 hour'",
    [user.id],
  );
  if ((recent?.n ?? 0) >= 5) return null;
  const token = newToken();
  await query("insert into public.password_resets (token_hash, user_id, expires_at) values ($1, $2, $3)", [
    hashToken(token),
    user.id,
    new Date(Date.now() + RESET_TTL_MS).toISOString(),
  ]);
  return token;
}

export async function completePasswordReset(token: unknown, newPassword: unknown): Promise<void> {
  const password = passwordSchema.parse(newPassword);
  if (typeof token !== "string" || !token || token.length > 100) throw new ApiError(400, "invalid_token", "This reset link is invalid or has expired. Request a new one.");
  const passwordHash = await hashPassword(password);
  await tx(async (client) => {
    const { rows } = await client.query<{ user_id: string }>(
      "update public.password_resets set used_at = now() where token_hash = $1 and used_at is null and expires_at > now() returning user_id",
      [hashToken(token)],
    );
    const userId = rows[0]?.user_id;
    if (!userId) throw new ApiError(400, "invalid_token", "This reset link is invalid or has expired. Request a new one.");
    await client.query("update public.users set password_hash = $2 where id = $1", [userId, passwordHash]);
    await client.query("delete from public.auth_sessions where user_id = $1", [userId]);
    await startSession(userId, client);
  });
}
