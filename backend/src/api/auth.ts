import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";

import { eq, sql } from "drizzle-orm";
import { getDrizzle } from "../db.ts";
import { users, user_sessions } from "../db/schema.ts";
import { changePasswordSchema, loginSchema } from "../schemas.ts";
import { sessionGuard } from "./middleware.ts";
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  setSessionCookie,
  verifyPassword
} from "./session.ts";
import type { AppEnv } from "./types.ts";
import { jsonData, jsonError, validateJson } from "./responses.ts";

type UserRow = {
  id: number;
  email: string;
  password_hash: string;
  name: string | null;
  disabled_at: string | null;
};

/**
 * Best-effort client IP for the rate-limit bucket key. Reads standard
 * reverse-proxy headers; if neither is present we collapse all callers
 * into a single "unknown" bucket. That is intentional: the cap still
 * applies in aggregate, so header-stripping doesn't unlock unbounded
 * argon2 verification.
 */
function clientIp(c: Context<AppEnv>): string {
  const fwd = c.req.header("x-forwarded-for");
  if (fwd) return (fwd.split(",")[0] ?? "").trim() || "unknown";
  const real = c.req.header("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

export const authRoutes = new Hono<AppEnv>();

authRoutes.post("/register", (c) =>
  jsonError(c, "SIGNUP_DISABLED", "Signup is disabled", 403)
);

authRoutes.post("/login", async (c, next) => {
  const decision = c.get("loginRateLimiter").check(clientIp(c));
  if (!decision.allowed) {
    c.header("retry-after", String(decision.retryAfterSeconds));
    return jsonError(c, "RATE_LIMITED", "Too many login attempts. Try again later.", 429);
  }
  return next();
}, validateJson(loginSchema), async (c) => {
  const body = c.req.valid("json");
  const db = c.get("db");
  const env = c.get("env");
  const dbo = getDrizzle(db);
  const user = dbo
    .select({
      id: users.id,
      email: users.email,
      password_hash: users.password_hash,
      name: users.name,
      disabled_at: users.disabled_at
    })
    .from(users)
    .where(eq(users.email, body.email))
    .limit(1)
    .get() as UserRow | undefined;
  if (!user) {
    return jsonError(c, "INVALID_CREDENTIALS", "Invalid credentials", 401);
  }
  if (user.disabled_at) {
    return jsonError(c, "ACCOUNT_DISABLED", "Account disabled", 403);
  }
  const check = await verifyPassword(body.password, user.password_hash);
  if (!check.ok) {
    return jsonError(c, "INVALID_CREDENTIALS", "Invalid credentials", 401);
  }
  if (check.rehash) {
    try {
      dbo
        .update(users)
        .set({ password_hash: check.rehash, updated_at: sql`CURRENT_TIMESTAMP` })
        .where(eq(users.id, user.id))
        .run();
    } catch (e) {
      console.error("[auth] rehash write failed (login still succeeds):", e);
    }
  }
  const { sid } = createSession(db, user.id, user.email, env.SESSION_TTL_SECONDS);
  setSessionCookie(c, env, sid);
  return jsonData(c, { email: user.email, name: user.name ?? null });
});

authRoutes.post("/logout", (c) => {
  const db = c.get("db");
  const env = c.get("env");
  const sid = getCookie(c, env.SESSION_COOKIE_NAME);
  if (sid) deleteSession(db, sid);
  clearSessionCookie(c, env);
  return jsonData(c, { ok: true });
});

authRoutes.get("/session", (c) => {
  const db = c.get("db");
  const env = c.get("env");
  const sid = getCookie(c, env.SESSION_COOKIE_NAME);
  if (!sid) return jsonData(c, { authenticated: false });
  const dbo = getDrizzle(db);
  const now = Math.floor(Date.now() / 1000);
  const sessionRow = dbo
    .select({
      user_id: user_sessions.user_id,
      expires_at: user_sessions.expires_at
    })
    .from(user_sessions)
    .where(eq(user_sessions.sid, sid))
    .limit(1)
    .get();
  if (!sessionRow || Number(sessionRow.expires_at) <= now) {
    return jsonData(c, { authenticated: false });
  }
  const user = dbo
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      disabled_at: users.disabled_at
    })
    .from(users)
    .where(eq(users.id, Number(sessionRow.user_id)))
    .limit(1)
    .get();
  if (!user || user.disabled_at) return jsonData(c, { authenticated: false });
  return jsonData(c, {
    authenticated: true,
    user: { id: user.id, email: user.email, name: user.name ?? null }
  });
});

authRoutes.post(
  "/change-password",
  async (c, next) => {
    const decision = c.get("loginRateLimiter").check(clientIp(c));
    if (!decision.allowed) {
      c.header("retry-after", String(decision.retryAfterSeconds));
      return jsonError(c, "RATE_LIMITED", "Too many attempts. Try again later.", 429);
    }
    return next();
  },
  sessionGuard,
  validateJson(changePasswordSchema),
  async (c) => {
    const body = c.req.valid("json");
    const db = c.get("db");
    const env = c.get("env");
    const session = c.get("session");
    const user = c.get("user");
    const dbo = getDrizzle(db);
    const row = dbo
      .select({ password_hash: users.password_hash })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1)
      .get();
    if (!row) return jsonError(c, "UNAUTHORIZED", "Authentication required", 401);
    const current = await verifyPassword(body.currentPassword, row.password_hash);
    if (!current.ok) {
      return jsonError(c, "INVALID_CURRENT_PASSWORD", "Current password is incorrect", 400);
    }
    const newHash = await Bun.password.hash(body.newPassword, { algorithm: "argon2id" });
    dbo
      .update(users)
      .set({ password_hash: newHash, updated_at: sql`CURRENT_TIMESTAMP` })
      .where(eq(users.id, user.id))
      .run();
    deleteSession(db, session.sid);
    const { sid } = createSession(db, user.id, user.email, env.SESSION_TTL_SECONDS);
    setSessionCookie(c, env, sid);
    return jsonData(c, { ok: true });
  }
);
