import fs from "node:fs";
import path from "node:path";
import cookie from "cookie";
import bcrypt from "bcryptjs";
import * as XLSX from "xlsx";
import { z } from "zod";
import { openDb, runMigrations } from "./db.ts";

const envSchema = z.object({
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().default(8001),
  DB_PATH: z.string().default(path.resolve(process.cwd(), "../data/mymoney.sqlite")),
  SESSION_TTL_SECONDS: z.coerce.number().default(60 * 60 * 24 * 30),
  SESSION_COOKIE_NAME: z.string().default("MYMONEY_SESSID"),
  ALLOWED_ORIGINS: z.string().default("http://localhost:5174,http://127.0.0.1:5174,http://localhost:8001,http://127.0.0.1:8001"),
  PUBLIC_DIR: z.string().default(path.resolve(process.cwd(), "../frontend/dist")),
  COOKIE_SECURE: z.string().default("false")
});

const env = envSchema.parse(process.env);
const allowedOrigins = new Set(
  env.ALLOWED_ORIGINS.split(",")
    .map((v) => v.trim())
    .filter(Boolean)
);

fs.mkdirSync(path.dirname(env.DB_PATH), { recursive: true });
const db = openDb(env.DB_PATH);
runMigrations(db);
db.query(`DELETE FROM user_sessions WHERE expires_at <= ?`).run(Math.floor(Date.now() / 1000));

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8)
  })
  .strict();

const txSchema = z.object({
  txDate: z.string().min(1),
  asset: z.string().min(1),
  tipo: z.string().min(1),
  derivedType: z.string().optional(),
  buyValue: z.coerce.number().default(0),
  pnl: z.coerce.number().default(0),
  currentValue: z.coerce.number().optional(),
  note: z.string().default("")
});

const movementSchema = z.object({
  name: z.string().min(1),
  direction: z.enum(["income", "expense"]),
  amount: z.coerce.number().nonnegative(),
  note: z.string().default("")
});

const snapshotSchema = z.object({
  snapshotDate: z.string().min(1),
  lowRisk: z.coerce.number().default(0),
  mediumRisk: z.coerce.number().default(0),
  highRisk: z.coerce.number().default(0),
  liquid: z.coerce.number().default(0)
});

const stylesSchema = z.object({
  styles: z.record(
    z.string(),
    z.object({
      colorHex: z.string().optional().nullable(),
      riskLevel: z.string().optional().nullable()
    })
  )
});

const prefsSchema = z.object({ showZeroAssets: z.boolean() });

const backupImportSchema = z.object({
  transactions: z.array(z.record(z.string(), z.any())).optional(),
  monthlyMovements: z.array(z.record(z.string(), z.any())).optional(),
  monthlySnapshots: z.array(z.record(z.string(), z.any())).optional(),
  assetColors: z.record(z.string(), z.string()).optional(),
  assetRisks: z.record(z.string(), z.string()).optional(),
  preferences: z.record(z.string(), z.any()).optional()
});

type SessionData = { sid: string; userId: number; email: string };

function setSecurityHeaders(h: Headers): void {
  h.set("x-content-type-options", "nosniff");
  h.set("x-frame-options", "DENY");
}

function makeError(
  code: string,
  message: string,
  status = 400,
  fields?: Record<string, string>,
  headers?: Headers
): Response {
  const h = headers ? new Headers(headers) : new Headers();
  h.set("content-type", "application/json");
  setSecurityHeaders(h);
  return new Response(JSON.stringify({ error: { code, message, fields } }), { status, headers: h });
}

function makeData(data: unknown, status = 200, headers?: Headers): Response {
  const h = headers ? new Headers(headers) : new Headers();
  h.set("content-type", "application/json");
  setSecurityHeaders(h);
  return new Response(JSON.stringify({ data }), { status, headers: h });
}

async function parseJson<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  const raw = await req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw makeError("VALIDATION_ERROR", "Invalid request body", 400);
  }
  return parsed.data;
}

function getCorsHeaders(req: Request): Headers | Response {
  const headers = new Headers();
  const origin = req.headers.get("origin");
  if (origin) {
    const requestOrigin = new URL(req.url).origin;
    const isSameOrigin = origin === requestOrigin;
    if (!isSameOrigin && !allowedOrigins.has(origin)) {
      return makeError("ORIGIN_NOT_ALLOWED", `Origin ${origin} is not allowed`, 403);
    }
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "true");
    headers.set("vary", "Origin");
    headers.set("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
    headers.set("access-control-allow-headers", "Content-Type");
  }
  return headers;
}

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  const parsed = cookie.parse(raw);
  return parsed[name] ?? null;
}

async function getSession(req: Request): Promise<SessionData | null> {
  const sid = readCookie(req, env.SESSION_COOKIE_NAME);
  if (!sid) return null;
  const now = Math.floor(Date.now() / 1000);
  const row = db
    .query(`SELECT user_id, email, expires_at FROM user_sessions WHERE sid = ? LIMIT 1`)
    .get(sid) as { user_id: number; email: string; expires_at: number } | null;
  if (!row) return null;
  if (Number(row.expires_at) <= now) {
    db.query(`DELETE FROM user_sessions WHERE sid = ?`).run(sid);
    return null;
  }
  return { sid, userId: Number(row.user_id), email: row.email };
}

async function createSession(userId: number, email: string): Promise<string> {
  const sid = crypto.randomUUID().replaceAll("-", "");
  const expiresAt = Math.floor(Date.now() / 1000) + env.SESSION_TTL_SECONDS;
  db.query(`INSERT INTO user_sessions (sid, user_id, email, expires_at) VALUES (?, ?, ?, ?)`).run(sid, userId, email, expiresAt);
  return sid;
}

async function deleteSession(sid: string): Promise<void> {
  db.query(`DELETE FROM user_sessions WHERE sid = ?`).run(sid);
}

function buildSessionCookie(sid: string): string {
  return cookie.serialize(env.SESSION_COOKIE_NAME, sid, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: env.SESSION_TTL_SECONDS,
    secure: env.COOKIE_SECURE.toLowerCase() === "true"
  });
}

function clearSessionCookie(): string {
  return cookie.serialize(env.SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: env.COOKIE_SECURE.toLowerCase() === "true"
  });
}

async function verifyPassword(password: string, storedHash: string): Promise<{ ok: boolean; rehash?: string }> {
  if (storedHash.startsWith("$2a$") || storedHash.startsWith("$2b$") || storedHash.startsWith("$2y$")) {
    const ok = bcrypt.compareSync(password, storedHash);
    if (!ok) return { ok: false };
    const rehash = await Bun.password.hash(password, { algorithm: "argon2id" });
    return { ok: true, rehash };
  }
  const ok = await Bun.password.verify(password, storedHash);
  return { ok };
}

function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function inferType(tipo: string, buyValue: number, pnl: number): string {
  if (tipo === "nuovo vincolo") return buyValue >= 0 ? "buy" : "sell";
  if (tipo === "cedola" || tipo === "interessi" || tipo === "cashback") return pnl >= 0 ? "return" : "fee";
  if (tipo === "Variazione Valore") return pnl >= 0 ? "value-up" : "value-down";
  if (buyValue >= 0 && pnl >= 0) return "buy";
  if (buyValue >= 0 && pnl < 0) return "buy-loss";
  if (buyValue < 0 && pnl >= 0) return "sell";
  return "sell-loss";
}

function normalizeTx(row: any) {
  return {
    id: row.id,
    txDate: row.tx_date,
    asset: row.asset,
    tipo: row.tipo,
    derivedType: row.derived_type,
    buyValue: Number(row.buy_value),
    pnl: Number(row.pnl),
    currentValue: Number(row.current_value),
    note: row.note ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeMm(row: any) {
  return {
    id: row.id,
    name: row.name,
    direction: row.direction,
    amount: Number(row.amount),
    note: row.note ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeSnap(row: any) {
  return {
    id: row.id,
    snapshotDate: row.snapshot_date,
    lowRisk: Number(row.low_risk),
    mediumRisk: Number(row.medium_risk),
    highRisk: Number(row.high_risk),
    liquid: Number(row.liquid),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function handleApi(req: Request, url: URL, corsHeaders: Headers): Promise<Response> {
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const method = req.method.toUpperCase();

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (pathname === "/api/v1/auth/register" && method === "POST") {
    return makeError("SIGNUP_DISABLED", "Signup is disabled", 403, undefined, corsHeaders);
  }

  if (pathname === "/api/v1/auth/login" && method === "POST") {
    const body = await parseJson(req, loginSchema);
    const user = db.query(`SELECT id, email, password_hash, name, disabled_at FROM users WHERE email = ? LIMIT 1`).get(body.email) as any;
    if (!user) {
      return makeError("INVALID_CREDENTIALS", "Invalid credentials", 401, undefined, corsHeaders);
    }
    if (user.disabled_at) {
      return makeError("ACCOUNT_DISABLED", "Account disabled", 403, undefined, corsHeaders);
    }

    const check = await verifyPassword(body.password, user.password_hash);
    if (!check.ok) {
      return makeError("INVALID_CREDENTIALS", "Invalid credentials", 401, undefined, corsHeaders);
    }
    if (check.rehash) {
      db.query(`UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(check.rehash, user.id);
    }

    const sid = await createSession(user.id, user.email);
    const headers = new Headers(corsHeaders);
    headers.append("set-cookie", buildSessionCookie(sid));
    return makeData({ email: user.email, name: user.name ?? null }, 200, headers);
  }

  if (pathname === "/api/v1/auth/logout" && method === "POST") {
    const session = await getSession(req);
    if (session) await deleteSession(session.sid);
    const headers = new Headers(corsHeaders);
    headers.append("set-cookie", clearSessionCookie());
    return makeData({ ok: true }, 200, headers);
  }

  if (pathname === "/api/v1/auth/session" && method === "GET") {
    const session = await getSession(req);
    if (!session) return makeData({ authenticated: false }, 200, corsHeaders);
    const user = db.query(`SELECT id, email, name, disabled_at FROM users WHERE id = ? LIMIT 1`).get(session.userId) as any;
    if (!user || user.disabled_at) return makeData({ authenticated: false }, 200, corsHeaders);
    return makeData({ authenticated: true, user: { id: user.id, email: user.email, name: user.name ?? null } }, 200, corsHeaders);
  }

  const session = await getSession(req);
  if (!session) {
    return makeError("UNAUTHORIZED", "Authentication required", 401, undefined, corsHeaders);
  }
  const me = db.query(`SELECT id, email, name, disabled_at FROM users WHERE id = ? LIMIT 1`).get(session.userId) as any;
  if (!me || me.disabled_at) {
    return makeError("UNAUTHORIZED", "Authentication required", 401, undefined, corsHeaders);
  }
  const userId = Number(me.id);

  if (pathname === "/api/v1/auth/change-password" && method === "POST") {
    const body = await parseJson(req, changePasswordSchema);
    const row = db.query(`SELECT password_hash FROM users WHERE id = ? LIMIT 1`).get(userId) as any;
    if (!row) return makeError("UNAUTHORIZED", "Authentication required", 401, undefined, corsHeaders);
    const current = await verifyPassword(body.currentPassword, row.password_hash);
    if (!current.ok) {
      return makeError("INVALID_CURRENT_PASSWORD", "Current password is incorrect", 400, undefined, corsHeaders);
    }
    const newHash = await Bun.password.hash(body.newPassword, { algorithm: "argon2id" });
    db.query(`UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(newHash, userId);
    await deleteSession(session.sid);
    const sid = await createSession(userId, me.email);
    const headers = new Headers(corsHeaders);
    headers.append("set-cookie", buildSessionCookie(sid));
    return makeData({ ok: true }, 200, headers);
  }

  if (pathname === "/api/v1/transactions" && method === "GET") {
    const rows = db
      .query(`SELECT * FROM transactions WHERE user_id = ? ORDER BY tx_date DESC, id DESC`)
      .all(userId) as any[];
    return makeData(rows.map(normalizeTx), 200, corsHeaders);
  }

  if (pathname === "/api/v1/transactions" && method === "POST") {
    const body = await parseJson(req, txSchema);
    const id = makeId("tx");
    const derivedType = body.derivedType || inferType(body.tipo, body.buyValue, body.pnl);
    const currentValue = Number.isFinite(body.currentValue) ? Number(body.currentValue) : body.buyValue + body.pnl;
    db.query(
      `INSERT INTO transactions (id, user_id, tx_date, asset, tipo, derived_type, buy_value, pnl, current_value, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, userId, body.txDate, body.asset, body.tipo, derivedType, body.buyValue, body.pnl, currentValue, body.note ?? "");
    return makeData({ id }, 201, corsHeaders);
  }

  const txMatch = pathname.match(/^\/api\/v1\/transactions\/([^/]+)$/);
  if (txMatch && method === "PUT") {
    const id = txMatch[1] ?? "";
    const body = await parseJson(req, txSchema);
    const derivedType = body.derivedType || inferType(body.tipo, body.buyValue, body.pnl);
    const currentValue = Number.isFinite(body.currentValue) ? Number(body.currentValue) : body.buyValue + body.pnl;
    const result = db
      .query(
        `UPDATE transactions SET tx_date=?, asset=?, tipo=?, derived_type=?, buy_value=?, pnl=?, current_value=?, note=?, updated_at=CURRENT_TIMESTAMP
         WHERE id=? AND user_id=?`
      )
      .run(body.txDate, body.asset, body.tipo, derivedType, body.buyValue, body.pnl, currentValue, body.note ?? "", id, userId);
    if (!result.changes) return makeError("NOT_FOUND", "Transaction not found", 404, undefined, corsHeaders);
    return makeData({ ok: true }, 200, corsHeaders);
  }

  if (txMatch && method === "DELETE") {
    const id = txMatch[1] ?? "";
    const result = db.query(`DELETE FROM transactions WHERE id = ? AND user_id = ?`).run(id, userId);
    if (!result.changes) return makeError("NOT_FOUND", "Transaction not found", 404, undefined, corsHeaders);
    return makeData({ ok: true }, 200, corsHeaders);
  }

  if (pathname === "/api/v1/monthly-movements" && method === "GET") {
    const rows = db
      .query(`SELECT * FROM monthly_movements WHERE user_id = ? ORDER BY name ASC, id DESC`)
      .all(userId) as any[];
    return makeData(rows.map(normalizeMm), 200, corsHeaders);
  }

  if (pathname === "/api/v1/monthly-movements" && method === "POST") {
    const body = await parseJson(req, movementSchema);
    const id = makeId("mm");
    db.query(
      `INSERT INTO monthly_movements (id, user_id, name, direction, amount, note)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, userId, body.name, body.direction, body.amount, body.note ?? "");
    return makeData({ id }, 201, corsHeaders);
  }

  const mmMatch = pathname.match(/^\/api\/v1\/monthly-movements\/([^/]+)$/);
  if (mmMatch && method === "PUT") {
    const id = mmMatch[1] ?? "";
    const body = await parseJson(req, movementSchema);
    const result = db
      .query(`UPDATE monthly_movements SET name=?, direction=?, amount=?, note=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?`)
      .run(body.name, body.direction, body.amount, body.note ?? "", id, userId);
    if (!result.changes) return makeError("NOT_FOUND", "Monthly movement not found", 404, undefined, corsHeaders);
    return makeData({ ok: true }, 200, corsHeaders);
  }

  if (mmMatch && method === "DELETE") {
    const id = mmMatch[1] ?? "";
    const result = db.query(`DELETE FROM monthly_movements WHERE id=? AND user_id=?`).run(id, userId);
    if (!result.changes) return makeError("NOT_FOUND", "Monthly movement not found", 404, undefined, corsHeaders);
    return makeData({ ok: true }, 200, corsHeaders);
  }

  if (pathname === "/api/v1/monthly-snapshots" && method === "GET") {
    const rows = db
      .query(`SELECT * FROM monthly_snapshots WHERE user_id = ? ORDER BY snapshot_date DESC, id DESC`)
      .all(userId) as any[];
    return makeData(rows.map(normalizeSnap), 200, corsHeaders);
  }

  if (pathname === "/api/v1/monthly-snapshots" && method === "POST") {
    const body = await parseJson(req, snapshotSchema);
    const id = makeId("snap");
    db.query(
      `INSERT INTO monthly_snapshots (id, user_id, snapshot_date, low_risk, medium_risk, high_risk, liquid)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, userId, body.snapshotDate, body.lowRisk, body.mediumRisk, body.highRisk, body.liquid);
    return makeData({ id }, 201, corsHeaders);
  }

  const snapMatch = pathname.match(/^\/api\/v1\/monthly-snapshots\/([^/]+)$/);
  if (snapMatch && method === "PUT") {
    const id = snapMatch[1] ?? "";
    const body = await parseJson(req, snapshotSchema);
    const result = db
      .query(
        `UPDATE monthly_snapshots SET snapshot_date=?, low_risk=?, medium_risk=?, high_risk=?, liquid=?, updated_at=CURRENT_TIMESTAMP
         WHERE id=? AND user_id=?`
      )
      .run(body.snapshotDate, body.lowRisk, body.mediumRisk, body.highRisk, body.liquid, id, userId);
    if (!result.changes) return makeError("NOT_FOUND", "Monthly snapshot not found", 404, undefined, corsHeaders);
    return makeData({ ok: true }, 200, corsHeaders);
  }

  if (snapMatch && method === "DELETE") {
    const id = snapMatch[1] ?? "";
    const result = db.query(`DELETE FROM monthly_snapshots WHERE id=? AND user_id=?`).run(id, userId);
    if (!result.changes) return makeError("NOT_FOUND", "Monthly snapshot not found", 404, undefined, corsHeaders);
    return makeData({ ok: true }, 200, corsHeaders);
  }

  if (pathname === "/api/v1/assets/styles" && method === "GET") {
    const rows = db.query(`SELECT asset, color_hex, risk_level FROM asset_styles WHERE user_id = ?`).all(userId) as any[];
    const styles: Record<string, { colorHex: string | null; riskLevel: string | null }> = {};
    rows.forEach((row) => {
      styles[row.asset] = { colorHex: row.color_hex ?? null, riskLevel: row.risk_level ?? null };
    });
    return makeData(styles, 200, corsHeaders);
  }

  if (pathname === "/api/v1/assets/styles" && method === "PUT") {
    const body = await parseJson(req, stylesSchema);
    const tx = db.transaction(() => {
      db.query(`DELETE FROM asset_styles WHERE user_id = ?`).run(userId);
      const insert = db.query(
        `INSERT INTO asset_styles (user_id, asset, color_hex, risk_level, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
      );
      for (const [asset, style] of Object.entries(body.styles)) {
        if (!asset.trim()) continue;
        insert.run(userId, asset.trim(), style.colorHex ?? null, style.riskLevel ?? null);
      }
    });
    tx();
    return makeData({ ok: true }, 200, corsHeaders);
  }

  if (pathname === "/api/v1/preferences" && method === "GET") {
    const row = db.query(`SELECT show_zero_assets, updated_at FROM user_preferences WHERE user_id = ? LIMIT 1`).get(userId) as any;
    return makeData({ showZeroAssets: Boolean(row?.show_zero_assets ?? 0), updatedAt: row?.updated_at ?? null }, 200, corsHeaders);
  }

  if (pathname === "/api/v1/preferences" && method === "PUT") {
    const body = await parseJson(req, prefsSchema);
    db.query(
      `INSERT INTO user_preferences (user_id, show_zero_assets, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET show_zero_assets=excluded.show_zero_assets, updated_at=CURRENT_TIMESTAMP`
    ).run(userId, body.showZeroAssets ? 1 : 0);
    return makeData({ ok: true }, 200, corsHeaders);
  }

  if (pathname === "/api/v1/backup/json" && method === "GET") {
    const txRows = db.query(`SELECT * FROM transactions WHERE user_id = ? ORDER BY tx_date DESC, id DESC`).all(userId) as any[];
    const mmRows = db.query(`SELECT * FROM monthly_movements WHERE user_id = ? ORDER BY name ASC, id DESC`).all(userId) as any[];
    const snapRows = db.query(`SELECT * FROM monthly_snapshots WHERE user_id = ? ORDER BY snapshot_date DESC, id DESC`).all(userId) as any[];
    const styleRows = db.query(`SELECT asset, color_hex, risk_level FROM asset_styles WHERE user_id = ?`).all(userId) as any[];
    const prefRow = db.query(`SELECT show_zero_assets FROM user_preferences WHERE user_id = ? LIMIT 1`).get(userId) as any;

    const assetColors: Record<string, string> = {};
    const assetRisks: Record<string, string> = {};
    styleRows.forEach((row) => {
      if (row.color_hex) assetColors[row.asset] = String(row.color_hex);
      if (row.risk_level) assetRisks[row.asset] = String(row.risk_level);
    });

    return makeData(
      {
        transactions: txRows.map((row) => ({
          id: row.id,
          date: row.tx_date,
          asset: row.asset,
          tipo: row.tipo,
          type: row.derived_type,
          buyValue: Number(row.buy_value),
          pnl: Number(row.pnl),
          currentValue: Number(row.current_value),
          note: row.note ?? ""
        })),
        monthlyMovements: mmRows.map((row) => ({
          id: row.id,
          name: row.name,
          direction: row.direction,
          amount: Number(row.amount),
          note: row.note ?? ""
        })),
        monthlySnapshots: snapRows.map((row) => ({
          id: row.id,
          date: row.snapshot_date,
          low: Number(row.low_risk),
          medium: Number(row.medium_risk),
          high: Number(row.high_risk),
          liquid: Number(row.liquid)
        })),
        assetColors,
        assetRisks,
        preferences: {
          showZeroAssets: Boolean(prefRow?.show_zero_assets ?? 0)
        }
      },
      200,
      corsHeaders
    );
  }

  if (pathname === "/api/v1/backup/json/import" && method === "POST") {
    const body = await parseJson(req, backupImportSchema);

    const tx = db.transaction(() => {
      db.query(`DELETE FROM transactions WHERE user_id = ?`).run(userId);
      db.query(`DELETE FROM monthly_movements WHERE user_id = ?`).run(userId);
      db.query(`DELETE FROM monthly_snapshots WHERE user_id = ?`).run(userId);
      db.query(`DELETE FROM asset_styles WHERE user_id = ?`).run(userId);
      db.query(`DELETE FROM user_preferences WHERE user_id = ?`).run(userId);

      const insertTx = db.query(
        `INSERT INTO transactions (id, user_id, tx_date, asset, tipo, derived_type, buy_value, pnl, current_value, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      (body.transactions ?? []).forEach((row) => {
        const id = String((row as any).id ?? makeId("tx"));
        const txDate = String((row as any).date ?? (row as any).txDate ?? "");
        const asset = String((row as any).asset ?? "");
        const tipo = String((row as any).tipo ?? "");
        const buyValue = Number((row as any).buyValue ?? 0);
        const pnl = Number((row as any).pnl ?? 0);
        const currentValue = Number.isFinite(Number((row as any).currentValue)) ? Number((row as any).currentValue) : buyValue + pnl;
        const derivedType = String((row as any).derivedType ?? (row as any).type ?? inferType(tipo, buyValue, pnl));
        const note = String((row as any).note ?? "");
        insertTx.run(id, userId, txDate.slice(0, 10), asset, tipo, derivedType, buyValue, pnl, currentValue, note);
      });

      const insertMm = db.query(
        `INSERT INTO monthly_movements (id, user_id, name, direction, amount, note) VALUES (?, ?, ?, ?, ?, ?)`
      );
      (body.monthlyMovements ?? []).forEach((row) => {
        insertMm.run(
          String((row as any).id ?? makeId("mm")),
          userId,
          String((row as any).name ?? ""),
          String((row as any).direction ?? "income"),
          Math.abs(Number((row as any).amount ?? 0)),
          String((row as any).note ?? "")
        );
      });

      const insertSnap = db.query(
        `INSERT INTO monthly_snapshots (id, user_id, snapshot_date, low_risk, medium_risk, high_risk, liquid)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      (body.monthlySnapshots ?? []).forEach((row) => {
        insertSnap.run(
          String((row as any).id ?? makeId("snap")),
          userId,
          String((row as any).date ?? (row as any).snapshotDate ?? "").slice(0, 10),
          Number((row as any).low ?? (row as any).lowRisk ?? 0),
          Number((row as any).medium ?? (row as any).mediumRisk ?? 0),
          Number((row as any).high ?? (row as any).highRisk ?? 0),
          Number((row as any).liquid ?? 0)
        );
      });

      const colors = body.assetColors ?? {};
      const risks = body.assetRisks ?? {};
      const assets = new Set<string>([...Object.keys(colors), ...Object.keys(risks)]);
      const insertStyle = db.query(
        `INSERT INTO asset_styles (user_id, asset, color_hex, risk_level, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
      );
      assets.forEach((asset) => insertStyle.run(userId, asset, colors[asset] ?? null, risks[asset] ?? null));

      const show = Boolean((body.preferences ?? {}).showZeroAssets ?? false);
      db.query(`INSERT INTO user_preferences (user_id, show_zero_assets, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`).run(
        userId,
        show ? 1 : 0
      );
    });

    tx();
    return makeData({ ok: true }, 200, corsHeaders);
  }

  if (pathname === "/api/v1/backup/xlsx" && method === "GET") {
    const jsonUrl = new URL(`${url.origin}/api/v1/backup/json`);
    const backup = await handleApi(new Request(jsonUrl, { method: "GET", headers: req.headers }), jsonUrl, corsHeaders);
    const text = await backup.text();
    const payload = JSON.parse(text)?.data;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(payload.transactions ?? []), "rawTransactions");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(payload.monthlyMovements ?? []), "movements");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(payload.monthlySnapshots ?? []), "monthlySnapshots");
    const styleAssets = new Set<string>([
      ...Object.keys(payload.assetColors ?? {}),
      ...Object.keys(payload.assetRisks ?? {})
    ]);
    const styleRows = Array.from(styleAssets).map((asset) => ({
      asset,
      colorHex: payload.assetColors?.[asset] ?? "",
      riskLevel: payload.assetRisks?.[asset] ?? ""
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(styleRows), "assetStyles");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([{ showZeroAssets: Boolean(payload.preferences?.showZeroAssets ?? false) }]),
      "preferences"
    );

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const headers = new Headers(corsHeaders);
    headers.set("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    headers.set("content-disposition", `attachment; filename="mymoney-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    return new Response(buf, { status: 200, headers });
  }

  if (pathname === "/api/v1/backup/xlsx/import" && method === "POST") {
    let workbook: XLSX.WorkBook | null = null;
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return makeError("MISSING_FILE", "Missing uploaded file in 'file' field", 400, undefined, corsHeaders);
      }
      const arr = await file.arrayBuffer();
      workbook = XLSX.read(Buffer.from(arr), { type: "buffer" });
    } else {
      const payload = await req.json().catch(() => null) as any;
      if (!payload?.base64 || typeof payload.base64 !== "string") {
        return makeError("MISSING_FILE", "Expected multipart form upload or JSON {base64}", 400, undefined, corsHeaders);
      }
      workbook = XLSX.read(Buffer.from(payload.base64, "base64"), { type: "buffer" });
    }

    const txSheet = workbook.Sheets["rawTransactions"];
    const mmSheet = workbook.Sheets["movements"];
    const snapSheet = workbook.Sheets["monthlySnapshots"];
    const styleSheet = workbook.Sheets["assetStyles"];
    const prefSheet = workbook.Sheets["preferences"];

    const transactions = txSheet ? (XLSX.utils.sheet_to_json(txSheet) as any[]) : [];
    const monthlyMovements = mmSheet ? (XLSX.utils.sheet_to_json(mmSheet) as any[]) : [];
    const monthlySnapshots = snapSheet ? (XLSX.utils.sheet_to_json(snapSheet) as any[]) : [];
    const styleRows = styleSheet ? (XLSX.utils.sheet_to_json(styleSheet) as any[]) : [];
    const prefRows = prefSheet ? (XLSX.utils.sheet_to_json(prefSheet) as any[]) : [];

    const hasStyleSheet = Boolean(styleSheet);
    const hasPrefSheet = Boolean(prefSheet);
    const assetColors: Record<string, string> = {};
    const assetRisks: Record<string, string> = {};

    styleRows.forEach((row) => {
      const asset = String(row.asset ?? "").trim();
      if (!asset) return;
      const colorHex = String(row.colorHex ?? "").trim();
      const riskLevel = String(row.riskLevel ?? "").trim();
      if (colorHex) assetColors[asset] = colorHex;
      if (riskLevel) assetRisks[asset] = riskLevel;
    });

    const prefRow = prefRows[0] ?? {};
    const showZeroRaw = (prefRow as any).showZeroAssets;
    const normalizedShowZero = String(showZeroRaw ?? "")
      .trim()
      .toLowerCase();
    const showZeroAssets =
      showZeroRaw === true ||
      showZeroRaw === 1 ||
      normalizedShowZero === "true" ||
      normalizedShowZero === "1";

    const importPayload = {
      transactions,
      monthlyMovements,
      monthlySnapshots,
      assetColors,
      assetRisks,
      preferences: { showZeroAssets }
    };
    const tx = db.transaction(() => {
      db.query(`DELETE FROM transactions WHERE user_id = ?`).run(userId);
      db.query(`DELETE FROM monthly_movements WHERE user_id = ?`).run(userId);
      db.query(`DELETE FROM monthly_snapshots WHERE user_id = ?`).run(userId);
      if (hasStyleSheet) {
        db.query(`DELETE FROM asset_styles WHERE user_id = ?`).run(userId);
      }
      if (hasPrefSheet) {
        db.query(`DELETE FROM user_preferences WHERE user_id = ?`).run(userId);
      }

      const insertTx = db.query(
        `INSERT INTO transactions (id, user_id, tx_date, asset, tipo, derived_type, buy_value, pnl, current_value, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      importPayload.transactions.forEach((row: any) => {
        const id = String(row.id ?? makeId("tx"));
        const txDate = String(row.date ?? row.txDate ?? "").slice(0, 10);
        const asset = String(row.asset ?? "");
        const tipo = String(row.tipo ?? "");
        const buyValue = Number(row.buyValue ?? 0);
        const pnl = Number(row.pnl ?? 0);
        const currentValue = Number.isFinite(Number(row.currentValue)) ? Number(row.currentValue) : buyValue + pnl;
        const derivedType = String(row.derivedType ?? row.type ?? inferType(tipo, buyValue, pnl));
        const note = String(row.note ?? "");
        insertTx.run(id, userId, txDate, asset, tipo, derivedType, buyValue, pnl, currentValue, note);
      });

      const insertMm = db.query(
        `INSERT INTO monthly_movements (id, user_id, name, direction, amount, note) VALUES (?, ?, ?, ?, ?, ?)`
      );
      importPayload.monthlyMovements.forEach((row: any) => {
        insertMm.run(
          String(row.id ?? makeId("mm")),
          userId,
          String(row.name ?? ""),
          String(row.direction ?? "income"),
          Math.abs(Number(row.amount ?? 0)),
          String(row.note ?? "")
        );
      });

      const insertSnap = db.query(
        `INSERT INTO monthly_snapshots (id, user_id, snapshot_date, low_risk, medium_risk, high_risk, liquid)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      importPayload.monthlySnapshots.forEach((row: any) => {
        insertSnap.run(
          String(row.id ?? makeId("snap")),
          userId,
          String(row.date ?? row.snapshotDate ?? "").slice(0, 10),
          Number(row.low ?? row.lowRisk ?? 0),
          Number(row.medium ?? row.mediumRisk ?? 0),
          Number(row.high ?? row.highRisk ?? 0),
          Number(row.liquid ?? 0)
        );
      });

      if (hasStyleSheet) {
        const colors = importPayload.assetColors ?? {};
        const risks = importPayload.assetRisks ?? {};
        const assets = new Set<string>([...Object.keys(colors), ...Object.keys(risks)]);
        const insertStyle = db.query(
          `INSERT INTO asset_styles (user_id, asset, color_hex, risk_level, updated_at)
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
        );
        assets.forEach((asset) => insertStyle.run(userId, asset, colors[asset] ?? null, risks[asset] ?? null));
      }

      if (hasPrefSheet) {
        db.query(`INSERT INTO user_preferences (user_id, show_zero_assets, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`).run(
          userId,
          importPayload.preferences.showZeroAssets ? 1 : 0
        );
      }
    });

    tx();
    return makeData(
      {
        ok: true,
        imported: {
          transactions: transactions.length,
          monthlyMovements: monthlyMovements.length,
          monthlySnapshots: monthlySnapshots.length
        }
      },
      200,
      corsHeaders
    );
  }

  if (pathname === "/api/v1/data/purge" && method === "POST") {
    const tx = db.transaction(() => {
      db.query(`DELETE FROM transactions WHERE user_id = ?`).run(userId);
      db.query(`DELETE FROM monthly_movements WHERE user_id = ?`).run(userId);
      db.query(`DELETE FROM monthly_snapshots WHERE user_id = ?`).run(userId);
      db.query(`DELETE FROM asset_styles WHERE user_id = ?`).run(userId);
      db.query(`DELETE FROM user_preferences WHERE user_id = ?`).run(userId);
    });
    tx();
    return makeData({ ok: true }, 200, corsHeaders);
  }

  return makeError("NOT_FOUND", "Route not found", 404, undefined, corsHeaders);
}

function resolveStaticFile(publicDir: string, requestPath: string): string | null {
  const normalized = requestPath === "/" ? "/index.html" : requestPath;
  const unsafePath = path.resolve(publicDir, `.${normalized}`);
  const safeRoot = path.resolve(publicDir);
  if (!unsafePath.startsWith(safeRoot)) return null;
  if (fs.existsSync(unsafePath) && fs.statSync(unsafePath).isFile()) {
    return unsafePath;
  }
  return null;
}

const server = Bun.serve({
  hostname: env.HOST,
  port: env.PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const cors = getCorsHeaders(req);
    if (cors instanceof Response) return cors;

    try {
      if (url.pathname.startsWith("/api/")) {
        return await handleApi(req, url, cors);
      }

      if (req.method !== "GET" && req.method !== "HEAD") {
        return makeError("METHOD_NOT_ALLOWED", "Method not allowed", 405, undefined, cors);
      }

      if (url.pathname === "/hub" || url.pathname.startsWith("/hub/") || url.pathname === "/myhealth" || url.pathname.startsWith("/myhealth/") || url.pathname === "/mymoney" || url.pathname.startsWith("/mymoney/")) {
        return makeError("NOT_FOUND", "Route not found", 404, undefined, cors);
      }

      const staticFile = resolveStaticFile(env.PUBLIC_DIR, url.pathname);
      if (staticFile) {
        setSecurityHeaders(cors);
        return new Response(Bun.file(staticFile), { headers: cors });
      }

      const indexFile = path.resolve(env.PUBLIC_DIR, "index.html");
      if (fs.existsSync(indexFile)) {
        setSecurityHeaders(cors);
        return new Response(Bun.file(indexFile), { headers: cors });
      }

      return new Response("myMoney backend running. Frontend build not found.", {
        status: 200,
        headers: cors
      });
    } catch (err: unknown) {
      if (err instanceof Response) {
        return err;
      }
      console.error("[server] unhandled error:", err);
      return makeError("INTERNAL_ERROR", "Internal server error", 500, undefined, cors);
    }
  }
});

console.log(`myMoney backend listening on http://${env.HOST}:${server.port}`);
