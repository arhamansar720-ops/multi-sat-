import { NextResponse } from "next/server";
import pg from "pg";
import { ZodError } from "zod";
import { ApiError } from "./errors";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } });
}

export function fail(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Wraps a route handler: maps known errors to safe JSON, hides internals. */
export function route<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, err.code, err.message);
      if (err instanceof ZodError) {
        return fail(400, "invalid_input", err.issues[0]?.message ?? "The request was not valid.");
      }
      if (err instanceof SyntaxError) return fail(400, "invalid_json", "The request body must be valid JSON.");
      if (isDatabaseError(err)) {
        console.error("[db] query failed", err);
        return fail(502, "database_error", "The database is temporarily unavailable. Please try again.");
      }
      console.error("[api] unexpected error", err);
      return fail(500, "internal", "Something went wrong on our side. Please try again.");
    }
  };
}

/** Best-effort client IP for rate limiting (Vercel and Render set x-forwarded-for). */
export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > 64_000) throw new ApiError(413, "too_large", "Request body is too large.");
  return text ? JSON.parse(text) : {};
}

/**
 * Best-effort fixed-window limiter. Serverless instances do not share memory,
 * so durable limits (room creation, friend requests) are also enforced in the
 * database; this layer just absorbs bursts per instance.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();
export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    return;
  }
  bucket.count++;
  if (bucket.count > limit) throw new ApiError(429, "rate_limited", "Too many requests. Please slow down and try again shortly.");
}

/** Postgres errors and network failures reaching it. */
function isDatabaseError(err: unknown): boolean {
  if (err instanceof pg.DatabaseError) return true;
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^(ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE)$/.test(code);
}
