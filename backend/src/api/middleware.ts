import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { getDrizzle } from "../db.ts";
import { users, user_sessions } from "../db/schema.ts";
import { applySecurityHeaders } from "../security-headers.ts";
import type { AppEnv } from "./types.ts";
import { jsonError } from "./responses.ts";

export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  applySecurityHeaders(c.res.headers);
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
      const requestOrigin = new URL(c.req.url).origin;
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
  const now = Math.floor(Date.now() / 1000);
  const row = dbo
    .select({
      user_id: user_sessions.user_id,
      email: user_sessions.email,
      expires_at: user_sessions.expires_at
    })
    .from(user_sessions)
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
  const me = dbo
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      disabled_at: users.disabled_at
    })
    .from(users)
    .where(eq(users.id, Number(row.user_id)))
    .limit(1)
    .get();
  if (!me || me.disabled_at) {
    return jsonError(c, "UNAUTHORIZED", "Authentication required", 401);
  }
  c.set("session", { sid, userId: Number(row.user_id), email: row.email });
  c.set("user", { id: me.id, email: me.email, name: me.name ?? null });
  await next();
};
