import cookie from "cookie";
import bcrypt from "bcryptjs";
import * as XLSX from "xlsx";
import type { SQLiteDB } from "./db.ts";
import {
  loginSchema,
  changePasswordSchema,
  txSchema,
  movementSchema,
  snapshotSchema,
  stylesSchema,
  prefsSchema,
  backupImportSchema,
  type ApiEnv
} from "./schemas.ts";
import {
  makeError,
  makeData,
  parseJson,
  makeId,
  inferType,
  normalizeTx,
  normalizeMm,
  normalizeSnap,
  setSecurityHeaders
} from "./helpers.ts";

export type ApiOptions = {
  db: SQLiteDB;
  env: ApiEnv;
};

type SessionData = { sid: string; userId: number; email: string };

type UserRow = {
  id: number;
  email: string;
  password_hash: string;
  name: string | null;
  disabled_at: string | null;
};

function isBcryptHash(hash: string): boolean {
  return hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$");
}

async function verifyPassword(
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

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  const parsed = cookie.parse(raw);
  return parsed[name] ?? null;
}

export function createApi(opts: ApiOptions) {
  const { db, env } = opts;
  const allowedOrigins = new Set(
    env.ALLOWED_ORIGINS.split(",")
      .map((v) => v.trim())
      .filter(Boolean)
  );

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
    db.query(
      `INSERT INTO user_sessions (sid, user_id, email, expires_at) VALUES (?, ?, ?, ?)`
    ).run(sid, userId, email, expiresAt);
    return sid;
  }

  async function deleteSession(sid: string): Promise<void> {
    db.query(`DELETE FROM user_sessions WHERE sid = ?`).run(sid);
  }

  function buildSessionCookie(sid: string): string {
    return cookie.serialize(env.SESSION_COOKIE_NAME, sid, {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: env.SESSION_TTL_SECONDS,
      secure: env.COOKIE_SECURE.toLowerCase() === "true"
    });
  }

  function clearSessionCookie(): string {
    return cookie.serialize(env.SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: 0,
      secure: env.COOKIE_SECURE.toLowerCase() === "true"
    });
  }

  async function handleApi(req: Request, url: URL, corsHeaders: Headers): Promise<Response> {
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    const method = req.method.toUpperCase();

    if (method === "OPTIONS") {
      const h = new Headers(corsHeaders);
      setSecurityHeaders(h);
      return new Response(null, { status: 204, headers: h });
    }

    if (pathname === "/api/v1/auth/register" && method === "POST") {
      return makeError("SIGNUP_DISABLED", "Signup is disabled", 403, undefined, corsHeaders);
    }

    if (pathname === "/api/v1/auth/login" && method === "POST") {
      const body = await parseJson(req, loginSchema);
      const user = db
        .query(`SELECT id, email, password_hash, name, disabled_at FROM users WHERE email = ? LIMIT 1`)
        .get(body.email) as UserRow | null;
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
        db.query(`UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(
          check.rehash,
          user.id
        );
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
      const user = db
        .query(`SELECT id, email, name, disabled_at FROM users WHERE id = ? LIMIT 1`)
        .get(session.userId) as UserRow | null;
      if (!user || user.disabled_at) return makeData({ authenticated: false }, 200, corsHeaders);
      return makeData(
        { authenticated: true, user: { id: user.id, email: user.email, name: user.name ?? null } },
        200,
        corsHeaders
      );
    }

    const session = await getSession(req);
    if (!session) {
      return makeError("UNAUTHORIZED", "Authentication required", 401, undefined, corsHeaders);
    }
    const me = db
      .query(`SELECT id, email, name, disabled_at FROM users WHERE id = ? LIMIT 1`)
      .get(session.userId) as UserRow | null;
    if (!me || me.disabled_at) {
      return makeError("UNAUTHORIZED", "Authentication required", 401, undefined, corsHeaders);
    }
    const userId = Number(me.id);

    if (pathname === "/api/v1/auth/change-password" && method === "POST") {
      const body = await parseJson(req, changePasswordSchema);
      const row = db
        .query(`SELECT password_hash FROM users WHERE id = ? LIMIT 1`)
        .get(userId) as { password_hash: string } | null;
      if (!row) return makeError("UNAUTHORIZED", "Authentication required", 401, undefined, corsHeaders);
      const current = await verifyPassword(body.currentPassword, row.password_hash);
      if (!current.ok) {
        return makeError(
          "INVALID_CURRENT_PASSWORD",
          "Current password is incorrect",
          400,
          undefined,
          corsHeaders
        );
      }
      const newHash = await Bun.password.hash(body.newPassword, { algorithm: "argon2id" });
      db.query(`UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(
        newHash,
        userId
      );
      await deleteSession(session.sid);
      const sid = await createSession(userId, me.email);
      const headers = new Headers(corsHeaders);
      headers.append("set-cookie", buildSessionCookie(sid));
      return makeData({ ok: true }, 200, headers);
    }

    if (pathname === "/api/v1/transactions" && method === "GET") {
      const rows = db
        .query(`SELECT * FROM transactions WHERE user_id = ? ORDER BY tx_date DESC, id DESC`)
        .all(userId) as Parameters<typeof normalizeTx>[0][];
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
      ).run(
        id,
        userId,
        body.txDate,
        body.asset,
        body.tipo,
        derivedType,
        body.buyValue,
        body.pnl,
        currentValue,
        body.note ?? ""
      );
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
        .run(
          body.txDate,
          body.asset,
          body.tipo,
          derivedType,
          body.buyValue,
          body.pnl,
          currentValue,
          body.note ?? "",
          id,
          userId
        );
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
        .all(userId) as Parameters<typeof normalizeMm>[0][];
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
        .query(
          `UPDATE monthly_movements SET name=?, direction=?, amount=?, note=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?`
        )
        .run(body.name, body.direction, body.amount, body.note ?? "", id, userId);
      if (!result.changes)
        return makeError("NOT_FOUND", "Monthly movement not found", 404, undefined, corsHeaders);
      return makeData({ ok: true }, 200, corsHeaders);
    }

    if (mmMatch && method === "DELETE") {
      const id = mmMatch[1] ?? "";
      const result = db.query(`DELETE FROM monthly_movements WHERE id=? AND user_id=?`).run(id, userId);
      if (!result.changes)
        return makeError("NOT_FOUND", "Monthly movement not found", 404, undefined, corsHeaders);
      return makeData({ ok: true }, 200, corsHeaders);
    }

    if (pathname === "/api/v1/monthly-snapshots" && method === "GET") {
      const rows = db
        .query(`SELECT * FROM monthly_snapshots WHERE user_id = ? ORDER BY snapshot_date DESC, id DESC`)
        .all(userId) as Parameters<typeof normalizeSnap>[0][];
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
      if (!result.changes)
        return makeError("NOT_FOUND", "Monthly snapshot not found", 404, undefined, corsHeaders);
      return makeData({ ok: true }, 200, corsHeaders);
    }

    if (snapMatch && method === "DELETE") {
      const id = snapMatch[1] ?? "";
      const result = db.query(`DELETE FROM monthly_snapshots WHERE id=? AND user_id=?`).run(id, userId);
      if (!result.changes)
        return makeError("NOT_FOUND", "Monthly snapshot not found", 404, undefined, corsHeaders);
      return makeData({ ok: true }, 200, corsHeaders);
    }

    if (pathname === "/api/v1/assets/styles" && method === "GET") {
      const rows = db
        .query(`SELECT asset, color_hex, risk_level FROM asset_styles WHERE user_id = ?`)
        .all(userId) as { asset: string; color_hex: string | null; risk_level: string | null }[];
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
        insert.finalize();
      });
      tx();
      return makeData({ ok: true }, 200, corsHeaders);
    }

    if (pathname === "/api/v1/preferences" && method === "GET") {
      const row = db
        .query(`SELECT show_zero_assets, updated_at FROM user_preferences WHERE user_id = ? LIMIT 1`)
        .get(userId) as { show_zero_assets: number; updated_at: string } | null;
      return makeData(
        { showZeroAssets: Boolean(row?.show_zero_assets ?? 0), updatedAt: row?.updated_at ?? null },
        200,
        corsHeaders
      );
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
      return makeData(buildBackupPayload(userId), 200, corsHeaders);
    }

    if (pathname === "/api/v1/backup/json/import" && method === "POST") {
      const body = await parseJson(req, backupImportSchema);
      const tx = db.transaction(() => {
        wipeUserData(userId, true, true);
        applyImport(userId, {
          transactions: body.transactions ?? [],
          monthlyMovements: body.monthlyMovements ?? [],
          monthlySnapshots: body.monthlySnapshots ?? [],
          assetColors: body.assetColors ?? {},
          assetRisks: body.assetRisks ?? {},
          preferences: { showZeroAssets: Boolean((body.preferences ?? {}).showZeroAssets ?? false) },
          replaceStyles: true,
          replacePrefs: true
        });
      });
      tx();
      return makeData({ ok: true }, 200, corsHeaders);
    }

    if (pathname === "/api/v1/backup/xlsx" && method === "GET") {
      const payload = buildBackupPayload(userId);

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
      headers.set(
        "content-disposition",
        `attachment; filename="mymoney-${new Date().toISOString().slice(0, 10)}.xlsx"`
      );
      setSecurityHeaders(headers);
      return new Response(buf, { status: 200, headers });
    }

    if (pathname === "/api/v1/backup/xlsx/import" && method === "POST") {
      let workbook: XLSX.WorkBook | null = null;
      const contentType = req.headers.get("content-type") ?? "";

      const MAX_XLSX_BYTES = 10 * 1024 * 1024;
      if (contentType.includes("multipart/form-data")) {
        const form = await req.formData();
        const file = form.get("file");
        if (!(file instanceof File)) {
          return makeError("MISSING_FILE", "Missing uploaded file in 'file' field", 400, undefined, corsHeaders);
        }
        if (file.size > MAX_XLSX_BYTES) {
          return makeError("FILE_TOO_LARGE", "File exceeds 10 MB limit", 400, undefined, corsHeaders);
        }
        const arr = await file.arrayBuffer();
        try {
          workbook = XLSX.read(Buffer.from(arr), { type: "buffer" });
        } catch {
          return makeError("INVALID_FILE", "Could not parse file as XLSX", 400, undefined, corsHeaders);
        }
      } else {
        const payload = (await req.json().catch(() => null)) as { base64?: string } | null;
        if (!payload?.base64 || typeof payload.base64 !== "string") {
          return makeError(
            "MISSING_FILE",
            "Expected multipart form upload or JSON {base64}",
            400,
            undefined,
            corsHeaders
          );
        }
        const rawBytes = Buffer.from(payload.base64, "base64");
        if (rawBytes.byteLength > MAX_XLSX_BYTES) {
          return makeError("FILE_TOO_LARGE", "File exceeds 10 MB limit", 400, undefined, corsHeaders);
        }
        try {
          workbook = XLSX.read(rawBytes, { type: "buffer" });
        } catch {
          return makeError("INVALID_FILE", "Could not parse file as XLSX", 400, undefined, corsHeaders);
        }
      }

      const txSheet = workbook.Sheets["rawTransactions"];
      const mmSheet = workbook.Sheets["movements"];
      const snapSheet = workbook.Sheets["monthlySnapshots"];
      const styleSheet = workbook.Sheets["assetStyles"];
      const prefSheet = workbook.Sheets["preferences"];

      const transactions = txSheet ? (XLSX.utils.sheet_to_json(txSheet) as Record<string, unknown>[]) : [];
      const monthlyMovements = mmSheet ? (XLSX.utils.sheet_to_json(mmSheet) as Record<string, unknown>[]) : [];
      const monthlySnapshots = snapSheet ? (XLSX.utils.sheet_to_json(snapSheet) as Record<string, unknown>[]) : [];
      const styleRows = styleSheet ? (XLSX.utils.sheet_to_json(styleSheet) as Record<string, unknown>[]) : [];
      const prefRows = prefSheet ? (XLSX.utils.sheet_to_json(prefSheet) as Record<string, unknown>[]) : [];

      const hasStyleSheet = Boolean(styleSheet);
      const hasPrefSheet = Boolean(prefSheet);
      const assetColors: Record<string, string> = {};
      const assetRisks: Record<string, string> = {};

      const validColorHex = /^#[0-9a-fA-F]{6}$/;
      const validRiskLevels = new Set(["low", "medium", "high"]);
      styleRows.forEach((row) => {
        const asset = String(row.asset ?? "").trim();
        if (!asset) return;
        const colorHex = String(row.colorHex ?? "").trim();
        const riskLevel = String(row.riskLevel ?? "").trim();
        if (colorHex && validColorHex.test(colorHex)) assetColors[asset] = colorHex;
        if (riskLevel && validRiskLevels.has(riskLevel)) assetRisks[asset] = riskLevel;
      });

      const prefRow = prefRows[0] ?? {};
      const showZeroRaw = (prefRow as Record<string, unknown>).showZeroAssets;
      const normalizedShowZero = String(showZeroRaw ?? "").trim().toLowerCase();
      const showZeroAssets =
        showZeroRaw === true ||
        showZeroRaw === 1 ||
        normalizedShowZero === "true" ||
        normalizedShowZero === "1";

      const tx = db.transaction(() => {
        wipeUserData(userId, hasStyleSheet, hasPrefSheet);
        applyImport(userId, {
          transactions,
          monthlyMovements,
          monthlySnapshots,
          assetColors,
          assetRisks,
          preferences: { showZeroAssets },
          replaceStyles: hasStyleSheet,
          replacePrefs: hasPrefSheet
        });
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
        wipeUserData(userId, true, true);
      });
      tx();
      return makeData({ ok: true }, 200, corsHeaders);
    }

    return makeError("NOT_FOUND", "Route not found", 404, undefined, corsHeaders);
  }

  function buildBackupPayload(userId: number) {
    const txRows = db
      .query(`SELECT * FROM transactions WHERE user_id = ? ORDER BY tx_date DESC, id DESC`)
      .all(userId) as Parameters<typeof normalizeTx>[0][];
    const mmRows = db
      .query(`SELECT * FROM monthly_movements WHERE user_id = ? ORDER BY name ASC, id DESC`)
      .all(userId) as Parameters<typeof normalizeMm>[0][];
    const snapRows = db
      .query(`SELECT * FROM monthly_snapshots WHERE user_id = ? ORDER BY snapshot_date DESC, id DESC`)
      .all(userId) as Parameters<typeof normalizeSnap>[0][];
    const styleRows = db
      .query(`SELECT asset, color_hex, risk_level FROM asset_styles WHERE user_id = ?`)
      .all(userId) as { asset: string; color_hex: string | null; risk_level: string | null }[];
    const prefRow = db
      .query(`SELECT show_zero_assets FROM user_preferences WHERE user_id = ? LIMIT 1`)
      .get(userId) as { show_zero_assets: number } | null;

    const assetColors: Record<string, string> = {};
    const assetRisks: Record<string, string> = {};
    styleRows.forEach((row) => {
      if (row.color_hex) assetColors[row.asset] = String(row.color_hex);
      if (row.risk_level) assetRisks[row.asset] = String(row.risk_level);
    });

    return {
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
    };
  }

  function wipeUserData(userId: number, includeStyles: boolean, includePrefs: boolean): void {
    db.query(`DELETE FROM transactions WHERE user_id = ?`).run(userId);
    db.query(`DELETE FROM monthly_movements WHERE user_id = ?`).run(userId);
    db.query(`DELETE FROM monthly_snapshots WHERE user_id = ?`).run(userId);
    if (includeStyles) db.query(`DELETE FROM asset_styles WHERE user_id = ?`).run(userId);
    if (includePrefs) db.query(`DELETE FROM user_preferences WHERE user_id = ?`).run(userId);
  }

  type ImportPayload = {
    transactions: Record<string, unknown>[];
    monthlyMovements: Record<string, unknown>[];
    monthlySnapshots: Record<string, unknown>[];
    assetColors: Record<string, string>;
    assetRisks: Record<string, string>;
    preferences: { showZeroAssets: boolean };
    replaceStyles: boolean;
    replacePrefs: boolean;
  };

  function applyImport(userId: number, payload: ImportPayload): void {
    const insertTx = db.query(
      `INSERT OR IGNORE INTO transactions (id, user_id, tx_date, asset, tipo, derived_type, buy_value, pnl, current_value, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    payload.transactions.forEach((row) => {
      const id = String(row.id ?? makeId("tx"));
      const txDate = String(row.date ?? row.txDate ?? "").slice(0, 10);
      const asset = String(row.asset ?? "");
      const tipo = String(row.tipo ?? "");
      const buyValue = Number(row.buyValue ?? 0);
      const pnl = Number(row.pnl ?? 0);
      const currentValue = Number.isFinite(Number(row.currentValue))
        ? Number(row.currentValue)
        : buyValue + pnl;
      const derivedType = String(row.derivedType ?? row.type ?? inferType(tipo, buyValue, pnl));
      const note = String(row.note ?? "");
      insertTx.run(id, userId, txDate, asset, tipo, derivedType, buyValue, pnl, currentValue, note);
    });
    insertTx.finalize();

    const insertMm = db.query(
      `INSERT OR IGNORE INTO monthly_movements (id, user_id, name, direction, amount, note) VALUES (?, ?, ?, ?, ?, ?)`
    );
    const validDirections = new Set(["income", "expense"]);
    payload.monthlyMovements.forEach((row) => {
      const direction = validDirections.has(String(row.direction)) ? String(row.direction) : "income";
      insertMm.run(
        String(row.id ?? makeId("mm")),
        userId,
        String(row.name ?? ""),
        direction,
        Math.abs(Number(row.amount ?? 0)),
        String(row.note ?? "")
      );
    });
    insertMm.finalize();

    const insertSnap = db.query(
      `INSERT OR IGNORE INTO monthly_snapshots (id, user_id, snapshot_date, low_risk, medium_risk, high_risk, liquid)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    payload.monthlySnapshots.forEach((row) => {
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
    insertSnap.finalize();

    if (payload.replaceStyles) {
      const insertStyle = db.query(
        `INSERT INTO asset_styles (user_id, asset, color_hex, risk_level, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
      );
      const assets = new Set<string>([
        ...Object.keys(payload.assetColors),
        ...Object.keys(payload.assetRisks)
      ]);
      assets.forEach((asset) =>
        insertStyle.run(
          userId,
          asset,
          payload.assetColors[asset] ?? null,
          payload.assetRisks[asset] ?? null
        )
      );
      insertStyle.finalize();
    }

    if (payload.replacePrefs) {
      db.query(
        `INSERT INTO user_preferences (user_id, show_zero_assets, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`
      ).run(userId, payload.preferences.showZeroAssets ? 1 : 0);
    }
  }

  async function fetch(req: Request): Promise<Response> {
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

      return makeError("NOT_FOUND", "Route not found", 404, undefined, cors);
    } catch (err: unknown) {
      if (err instanceof Response) {
        return err;
      }
      console.error("[app] unhandled error:", err);
      return makeError("INTERNAL_ERROR", "Internal server error", 500, undefined, cors);
    }
  }

  return { fetch, getCorsHeaders };
}
