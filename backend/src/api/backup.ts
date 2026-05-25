import { Hono } from "hono";

import * as XLSX from "xlsx";
import { backupImportSchema } from "../schemas.ts";
import { applyImport, buildBackupPayload, wipeUserData } from "./backup-helpers.ts";
import type { AppEnv } from "./types.ts";
import { jsonData, jsonError, validateJson } from "./responses.ts";

const MAX_XLSX_BYTES = 10 * 1024 * 1024;

export const backupRoutes = new Hono<AppEnv>();

backupRoutes.get("/json", (c) => {
  const db = c.get("db");
  const user = c.get("user");
  return jsonData(c, buildBackupPayload(db, user.id));
});

backupRoutes.post("/json/import", validateJson(backupImportSchema), (c) => {
  const body = c.req.valid("json");
  const db = c.get("db");
  const user = c.get("user");
  const tx = db.transaction(() => {
    wipeUserData(db, user.id, true, true);
    applyImport(db, user.id, {
      transactions: body.transactions ?? [],
      monthlyMovements: body.monthlyMovements ?? [],
      monthlySnapshots: body.monthlySnapshots ?? [],
      assetColors: body.assetColors ?? {},
      assetRisks: body.assetRisks ?? {},
      preferences: {
        showZeroAssets: Boolean((body.preferences ?? {}).showZeroAssets ?? false)
      },
      replaceStyles: true,
      replacePrefs: true
    });
  });
  tx();
  return jsonData(c, { ok: true });
});

backupRoutes.get("/xlsx", (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const payload = buildBackupPayload(db, user.id);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(payload.transactions ?? []),
    "rawTransactions"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(payload.monthlyMovements ?? []),
    "movements"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(payload.monthlySnapshots ?? []),
    "monthlySnapshots"
  );
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
    XLSX.utils.json_to_sheet([
      { showZeroAssets: Boolean(payload.preferences?.showZeroAssets ?? false) }
    ]),
    "preferences"
  );

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  c.header(
    "content-type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  c.header(
    "content-disposition",
    `attachment; filename="mymoney-${new Date().toISOString().slice(0, 10)}.xlsx"`
  );
  return c.body(buf, 200);
});

backupRoutes.post("/xlsx/import", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const contentType = c.req.header("content-type") ?? "";
  let workbook: XLSX.WorkBook | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return jsonError(c, "MISSING_FILE", "Missing uploaded file in 'file' field", 400);
    }
    if (file.size > MAX_XLSX_BYTES) {
      return jsonError(c, "FILE_TOO_LARGE", "File exceeds 10 MB limit", 400);
    }
    const arr = await file.arrayBuffer();
    try {
      workbook = XLSX.read(Buffer.from(arr), { type: "buffer" });
    } catch {
      return jsonError(c, "INVALID_FILE", "Could not parse file as XLSX", 400);
    }
  } else {
    const payload = (await c.req.json().catch(() => null)) as { base64?: string } | null;
    if (!payload?.base64 || typeof payload.base64 !== "string") {
      return jsonError(
        c,
        "MISSING_FILE",
        "Expected multipart form upload or JSON {base64}",
        400
      );
    }
    const rawBytes = Buffer.from(payload.base64, "base64");
    if (rawBytes.byteLength > MAX_XLSX_BYTES) {
      return jsonError(c, "FILE_TOO_LARGE", "File exceeds 10 MB limit", 400);
    }
    try {
      workbook = XLSX.read(rawBytes, { type: "buffer" });
    } catch {
      return jsonError(c, "INVALID_FILE", "Could not parse file as XLSX", 400);
    }
  }

  const txSheet = workbook.Sheets["rawTransactions"];
  const mmSheet = workbook.Sheets["movements"];
  const snapSheet = workbook.Sheets["monthlySnapshots"];
  const styleSheet = workbook.Sheets["assetStyles"];
  const prefSheet = workbook.Sheets["preferences"];

  const transactions = txSheet
    ? (XLSX.utils.sheet_to_json(txSheet) as Record<string, unknown>[])
    : [];
  const monthlyMovements = mmSheet
    ? (XLSX.utils.sheet_to_json(mmSheet) as Record<string, unknown>[])
    : [];
  const monthlySnapshots = snapSheet
    ? (XLSX.utils.sheet_to_json(snapSheet) as Record<string, unknown>[])
    : [];
  const styleRows = styleSheet
    ? (XLSX.utils.sheet_to_json(styleSheet) as Record<string, unknown>[])
    : [];
  const prefRows = prefSheet
    ? (XLSX.utils.sheet_to_json(prefSheet) as Record<string, unknown>[])
    : [];

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
    wipeUserData(db, user.id, hasStyleSheet, hasPrefSheet);
    applyImport(db, user.id, {
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
  return jsonData(c, {
    ok: true,
    imported: {
      transactions: transactions.length,
      monthlyMovements: monthlyMovements.length,
      monthlySnapshots: monthlySnapshots.length
    }
  });
});

export const purgeRoutes = new Hono<AppEnv>();

purgeRoutes.post("/purge", (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const tx = db.transaction(() => {
    wipeUserData(db, user.id, true, true);
  });
  tx();
  return jsonData(c, { ok: true });
});
