import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { getDrizzle } from "../db.ts";
import { users, user_sessions } from "../db/schema.ts";
import { applySecurityHeaders } from "../security-headers.ts";
import { nowUnixSeconds } from "../helpers.ts";
import type { AppEnv } from "./types.ts";
import { jsonError } from "./responses.ts";

export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  const env = c.get("env");
  applySecurityHeaders(c.res.headers, env.COOKIE_SECURE.toLowerCase() === "true");
};

export function originGuard(allowedOriginsCsv: string): MiddlewareHandler<AppEnv> {
  const allowedOrigins = new Set(
    allowedOriginsCsv
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
  );
  return async (c, next) => {
    const origin = c.req.header("origin");
    if (origin) {
      let requestOrigin: string;
      try {
        requestOrigin = new URL(c.req.url).origin;
      } catch {
        return jsonError(c, "BAD_REQUEST", "Invalid request URL", 400);
      }
      const isSameOrigin = origin === requestOrigin;
      if (!isSameOrigin && !allowedOrigins.has(origin)) {
        return jsonError(c, "ORIGIN_NOT_ALLOWED", `Origin ${origin} is not allowed`, 403);
      }
    }
    if (c.req.method === "OPTIONS") {
      if (origin) setCorsHeaders(c.res.headers, origin, true);
      return c.body(null, 204);
    }
    await next();
    if (origin) setCorsHeaders(c.res.headers, origin, false);
  };
}

function setCorsHeaders(headers: Headers, origin: string, isPreflight: boolean): void {
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-credentials", "true");
  headers.set("vary", "Origin");
  if (isPreflight) {
    headers.set("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
    headers.set("access-control-allow-headers", "Content-Type");
  }
}

export const sessionGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  const env = c.get("env");
  const db = c.get("db");
  const sid = getCookie(c, env.SESSION_COOKIE_NAME);
  if (!sid) {
    return jsonError(c, "UNAUTHORIZED", "Authentication required", 401);
  }
  const dbo = getDrizzle(db);
  const now = nowUnixSeconds();
  const row = dbo
    .select({
      userId: user_sessions.user_id,
      sessionEmail: user_sessions.email,
      expires_at: user_sessions.expires_at,
      id: users.id,
      email: users.email,
      name: users.name,
      disabled_at: users.disabled_at
    })
    .from(user_sessions)
    .innerJoin(users, eq(users.id, user_sessions.user_id))
    .where(eq(user_sessions.sid, sid))
    .limit(1)
    .get();
  if (!row) {
    return jsonError(c, "UNAUTHORIZED", "Authentication required", 401);
  }
  if (Number(row.expires_at) <= now) {
    dbo.delete(user_sessions).where(eq(user_sessions.sid, sid)).run();
    return jsonError(c, "UNAUTHORIZED", "Authentication required", 401);
  }
  if (row.disabled_at) {
    return jsonError(c, "UNAUTHORIZED", "Authentication required", 401);
  }
  c.set("session", { sid, userId: Number(row.userId), email: row.sessionEmail });
  c.set("user", { id: row.id, email: row.email, name: row.name ?? null });
  await next();
};
