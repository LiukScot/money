import type { Context } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDrizzle, type SQLiteDB } from "../db.ts";
import { user_sessions } from "../db/schema.ts";
import type { ApiEnv } from "../schemas.ts";
import type { AppEnv } from "./types.ts";

export function createSession(
  db: SQLiteDB,
  userId: number,
  email: string,
  ttlSeconds: number
): { sid: string; expiresAt: number } {
  const sid = crypto.randomUUID().replaceAll("-", "");
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  getDrizzle(db)
    .insert(user_sessions)
    .values({ sid, user_id: userId, email, expires_at: expiresAt })
    .run();
  return { sid, expiresAt };
}

export function deleteSession(db: SQLiteDB, sid: string): void {
  getDrizzle(db).delete(user_sessions).where(eq(user_sessions.sid, sid)).run();
}

export function setSessionCookie(c: Context<AppEnv>, env: ApiEnv, sid: string): void {
  setCookie(c, env.SESSION_COOKIE_NAME, sid, {
    httpOnly: true,
    sameSite: "Strict",
    path: "/",
    maxAge: env.SESSION_TTL_SECONDS,
    secure: env.COOKIE_SECURE.toLowerCase() === "true"
  });
}

export function clearSessionCookie(c: Context<AppEnv>, env: ApiEnv): void {
  deleteCookie(c, env.SESSION_COOKIE_NAME, {
    path: "/",
    sameSite: "Strict",
    secure: env.COOKIE_SECURE.toLowerCase() === "true"
  });
}

function isBcryptHash(hash: string): boolean {
  return hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$");
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<{ ok: boolean; rehash?: string }> {
  if (isBcryptHash(storedHash)) {
    const ok = await bcrypt.compare(password, storedHash);
    if (!ok) return { ok: false };
    const rehash = await Bun.password.hash(password, { algorithm: "argon2id" });
    return { ok: true, rehash };
  }
  const ok = await Bun.password.verify(password, storedHash);
  return { ok };
}
