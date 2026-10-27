import pg, { type PoolClient, type QueryResultRow } from "pg";
import { getDatabaseUrl } from "@/lib/config";
import { ApiError } from "./errors";
import { MIGRATIONS } from "./migrations";

// Match the JSON shapes the app uses everywhere: ISO timestamps, plain date strings, numeric counts.
pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (v) => new Date(v).toISOString());
pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, (v) => new Date(`${v}Z`).toISOString());
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));

export type Db = Pick<PoolClient, "query">;

/**
 * SSL defaults that work with Render Postgres: external URLs (*.render.com)
 * need TLS; internal URLs (when the app also runs on Render) and localhost
 * don't. DATABASE_SSL=disable|require|verify overrides.
 */
function sslFor(url: URL): pg.PoolConfig["ssl"] {
  const mode = process.env.DATABASE_SSL?.trim().toLowerCase();
  if (mode === "disable" || mode === "false") return false;
  if (mode === "verify") return { rejectUnauthorized: true };
  if (mode === "require" || mode === "true") return { rejectUnauthorized: false };
  const host = url.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || !host.includes(".")) return false;
  return { rejectUnauthorized: false };
}

function createPool(raw: string): pg.Pool {
  const url = new URL(raw);
  const ssl = sslFor(url);
  // sslmode in the URL would override the ssl option above, so it's applied here instead.
  url.searchParams.delete("sslmode");
  const pool = new pg.Pool({
    connectionString: url.toString(),
    ssl,
    // Serverless instances are short-lived and numerous: keep each one's footprint small.
    max: Number(process.env.DATABASE_POOL_MAX) || 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on("error", (err) => console.error("[db] idle client error", err));
  return pool;
}

const globalForDb = globalThis as unknown as { __studyduelPool?: pg.Pool; __studyduelSchema?: Promise<unknown> | null };

/** Raw pool, or null when DATABASE_URL isn't set (demo mode). Server-only. */
export function getPool(): pg.Pool | null {
  if (typeof window !== "undefined") throw new Error("The database pool must only be used on the server");
  const url = getDatabaseUrl();
  if (!url) return null;
  if (!globalForDb.__studyduelPool) globalForDb.__studyduelPool = createPool(url);
  return globalForDb.__studyduelPool;
}

/** Applies pending migrations in order. Safe to call concurrently from many instances. */
export async function migrate(pool: pg.Pool, log: (msg: string) => void = () => {}): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query("select pg_advisory_lock(hashtext('studyduel_migrations'))");
    await client.query("create table if not exists public.schema_migrations (id text primary key, applied_at timestamptz not null default now())");
    const { rows } = await client.query<{ id: string }>("select id from public.schema_migrations");
    const done = new Set(rows.map((r) => r.id));
    for (const m of MIGRATIONS) {
      if (done.has(m.id)) continue;
      log(`Applying ${m.id}`);
      await client.query("begin");
      try {
        await client.query(m.sql);
        await client.query("insert into public.schema_migrations (id) values ($1)", [m.id]);
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        throw err;
      }
      applied.push(m.id);
    }
  } finally {
    await client.query("select pg_advisory_unlock(hashtext('studyduel_migrations'))").catch(() => {});
    client.release();
  }
  return applied;
}

/** Pool with the schema migrated (once per server instance). Throws a safe ApiError when unavailable. */
export async function db(): Promise<pg.Pool> {
  const pool = getPool();
  if (!pool) throw new ApiError(503, "not_configured", "Online features are not configured on this deployment.");
  if (!globalForDb.__studyduelSchema) {
    globalForDb.__studyduelSchema = migrate(pool).catch((err) => {
      globalForDb.__studyduelSchema = null;
      console.error("[db] migration failed", err);
      throw new ApiError(503, "database_unavailable", "The database is unavailable right now. Please try again shortly.");
    });
  }
  await globalForDb.__studyduelSchema;
  return pool;
}

export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const pool = await db();
  return (await pool.query<T>(text, params)).rows;
}

export async function maybeOne<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
  return (await query<T>(text, params))[0] ?? null;
}

/** Runs fn inside a transaction on one connection. */
export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = await db();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** jsonb parameters must be serialized explicitly (pg would turn JS arrays into Postgres arrays). */
export const json = (value: unknown): string => JSON.stringify(value ?? null);

export function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "23505";
}
