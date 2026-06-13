import { Hono } from "hono";

import ExcelJS from "exceljs";
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
  try {
    tx();
  } catch (e) {
    console.error("[backup] json import failed:", e);
    return jsonError(c, "IMPORT_FAILED", "Import failed. Check server logs for details.", 500);
  }
  return jsonData(c, { ok: true });
});

/**
 * Append an array of plain objects as a worksheet. First row = header keys,
 * remaining rows = values in header order. Mirrors the shape produced by
 * xlsx's deprecated `json_to_sheet` so import side stays compatible.
 */
function addObjectsSheet(
  wb: ExcelJS.Workbook,
  name: string,
  rows: Record<string, unknown>[]
): void {
  const ws = wb.addWorksheet(name);
  if (rows.length === 0) return;
  const headers = Array.from(
    new Set(rows.flatMap((r) => Object.keys(r)))
  );
  ws.columns = headers.map((h) => ({ header: h, key: h }));
  for (const row of rows) ws.addRow(row);
}

/**
 * Inverse of `addObjectsSheet`. Reads row 1 as headers, returns each
 * subsequent row as an object keyed by header. Skips fully-empty rows.
 */
function sheetToObjects(ws: ExcelJS.Worksheet | undefined): Record<string, unknown>[] {
  if (!ws) return [];
  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? "");
  });
  if (headers.length === 0) return [];
  const out: Record<string, unknown>[] = [];
  for (let r = 2; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const obj: Record<string, unknown> = {};
    let hasValue = false;
    for (let c = 0; c < headers.length; c += 1) {
      const header = headers[c];
      if (!header) continue;
      const raw = row.getCell(c + 1).value;
      if (raw == null || raw === "") continue;
      // ExcelJS returns Date objects for date-typed cells, numbers for
      // numeric cells, strings otherwise. Coerce dates to YYYY-MM-DD so
      // the downstream importer (which expects ISO date strings) stays
      // happy. NOTE: this drops the time component — currently all date
      // columns in the schema (tx_date, snapshot_date) are date-only.
      // If a future column needs a timestamp, branch on the column name
      // or use full toISOString().
      obj[header] = raw instanceof Date ? raw.toISOString().slice(0, 10) : raw;
      hasValue = true;
    }
    if (hasValue) out.push(obj);
  }
  return out;
}

backupRoutes.get("/xlsx", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const payload = buildBackupPayload(db, user.id);

  const wb = new ExcelJS.Workbook();
  addObjectsSheet(wb, "rawTransactions", payload.transactions ?? []);
  addObjectsSheet(wb, "movements", payload.monthlyMovements ?? []);
  addObjectsSheet(wb, "monthlySnapshots", payload.monthlySnapshots ?? []);

  const styleAssets = new Set<string>([
    ...Object.keys(payload.assetColors ?? {}),
    ...Object.keys(payload.assetRisks ?? {})
  ]);
  const styleRows = Array.from(styleAssets).map((asset) => ({
    asset,
    colorHex: payload.assetColors?.[asset] ?? "",
    riskLevel: payload.assetRisks?.[asset] ?? ""
  }));
  addObjectsSheet(wb, "assetStyles", styleRows);
  addObjectsSheet(wb, "preferences", [
    { showZeroAssets: Boolean(payload.preferences?.showZeroAssets ?? false) }
  ]);

  const buf = Buffer.from(await wb.xlsx.writeBuffer());
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
  const wb = new ExcelJS.Workbook();

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
      await wb.xlsx.load(arr);
    } catch {
      return jsonError(c, "INVALID_FILE", "Could not parse file as XLSX", 400);
    }
  } else {
    let payload: { base64?: string } | null = null;
    try {
      payload = (await c.req.json()) as { base64?: string };
    } catch (e: unknown) {
      console.error("[backup] json parse failed:", e);
      return jsonError(c, "INVALID_JSON", "Request body is not valid JSON", 400);
    }
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
      await wb.xlsx.load(rawBytes.buffer.slice(rawBytes.byteOffset, rawBytes.byteOffset + rawBytes.byteLength));
    } catch {
      return jsonError(c, "INVALID_FILE", "Could not parse file as XLSX", 400);
    }
  }

  const txSheet = wb.getWorksheet("rawTransactions");
  const mmSheet = wb.getWorksheet("movements");
  const snapSheet = wb.getWorksheet("monthlySnapshots");
  const styleSheet = wb.getWorksheet("assetStyles");
  const prefSheet = wb.getWorksheet("preferences");

  const transactions = sheetToObjects(txSheet);
  const monthlyMovements = sheetToObjects(mmSheet);
  const monthlySnapshots = sheetToObjects(snapSheet);
  const styleRows = sheetToObjects(styleSheet);
  const prefRows = sheetToObjects(prefSheet);

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
  try {
    tx();
  } catch (e) {
    console.error("[backup] xlsx import failed:", e);
    return jsonError(c, "IMPORT_FAILED", "Import failed. Check server logs for details.", 500);
  }
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
  try {
    tx();
  } catch (e) {
    console.error("[purge] failed:", e);
    return jsonError(c, "PURGE_FAILED", "Purge failed. Check server logs for details.", 500);
  }
  return jsonData(c, { ok: true });
});
