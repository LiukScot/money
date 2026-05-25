import { Database } from "bun:sqlite";
import { runMigrations, type SQLiteDB } from "./db.ts";
import { createApi } from "./app.ts";
import type { ApiEnv } from "./schemas.ts";

export const TEST_COOKIE_NAME = "MYMONEY_SESSID";

export const TEST_ENV: ApiEnv = {
  HOST: "127.0.0.1",
  PORT: 0,
  DB_PATH: ":memory:",
  SESSION_TTL_SECONDS: 60 * 60 * 24 * 30,
  SESSION_COOKIE_NAME: TEST_COOKIE_NAME,
  ALLOWED_ORIGINS: "http://localhost:5174,http://example.test",
  PUBLIC_DIR: "/tmp/nonexistent",
  COOKIE_SECURE: "false"
};

export type TestContext = {
  db: SQLiteDB;
  api: ReturnType<typeof createApi>;
};

export function createTestDb(): SQLiteDB {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = MEMORY;");
  db.exec("PRAGMA foreign_keys = ON;");
  runMigrations(db);
  return db;
}

export function createTestApi(env: Partial<ApiEnv> = {}): TestContext {
  const db = createTestDb();
  const api = createApi({ db, env: { ...TEST_ENV, ...env } });
  return { db, api };
}

export type SeededUser = { id: number; email: string; password: string };

export async function seedUser(
  db: SQLiteDB,
  opts: { email?: string; password?: string; name?: string | null; disabledAt?: string | null } = {}
): Promise<SeededUser> {
  const email = opts.email ?? "user@example.com";
  const password = opts.password ?? "Password123!";
  const passwordHash = await Bun.password.hash(password, { algorithm: "argon2id" });
  const res = db
    .query(
      `INSERT INTO users (email, password_hash, name, disabled_at) VALUES (?, ?, ?, ?) RETURNING id`
    )
    .get(email, passwordHash, opts.name ?? null, opts.disabledAt ?? null) as { id: number } | null;
  if (!res) throw new Error("seedUser: insert failed");
  return { id: res.id, email, password };
}

export function extractSessionCookie(setCookieHeader: string | null): string {
  if (!setCookieHeader) throw new Error("extractSessionCookie: missing Set-Cookie header");
  const first = setCookieHeader.split(";")[0];
  if (!first) throw new Error("extractSessionCookie: empty Set-Cookie header");
  return first;
}

export async function loginRequest(
  api: TestContext["api"],
  email: string,
  password: string
): Promise<string> {
  const res = await api.fetch(
    new Request("http://test/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password })
    })
  );
  if (res.status !== 200) {
    throw new Error(`loginRequest: failed ${res.status} ${await res.text()}`);
  }
  return extractSessionCookie(res.headers.get("set-cookie"));
}

export function apiRequest(
  api: TestContext["api"],
  path: string,
  opts: { method?: string; cookie?: string; body?: unknown; headers?: Record<string, string> } = {}
): Promise<Response> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.body !== undefined) headers["content-type"] ??= "application/json";
  if (opts.cookie) headers.cookie = opts.cookie;
  return Promise.resolve(
    api.fetch(
      new Request(`http://test${path}`, {
        method: opts.method ?? "GET",
        headers,
        body: opts.body === undefined ? null : JSON.stringify(opts.body)
      })
    )
  );
}

export async function setupAuthed(): Promise<{
  ctx: TestContext;
  user: SeededUser;
  cookie: string;
}> {
  const ctx = createTestApi();
  const user = await seedUser(ctx.db);
  const cookie = await loginRequest(ctx.api, user.email, user.password);
  return { ctx, user, cookie };
}
