import { desc, eq } from "drizzle-orm";
import { getDrizzle, type SQLiteDB } from "../db.ts";
import {
  asset_styles,
  monthly_movements,
  monthly_snapshots,
  transactions,
  user_preferences
} from "../db/schema.ts";
import { inferType, makeId, normalizeMm, normalizeSnap, normalizeTx } from "../helpers.ts";

export type ImportPayload = {
  transactions: Record<string, unknown>[];
  monthlyMovements: Record<string, unknown>[];
  monthlySnapshots: Record<string, unknown>[];
  assetColors: Record<string, string>;
  assetRisks: Record<string, string>;
  preferences: { showZeroAssets: boolean };
  replaceStyles: boolean;
  replacePrefs: boolean;
};

export function buildBackupPayload(db: SQLiteDB, userId: number) {
  const dbo = getDrizzle(db);
  const txRows = dbo
    .select()
    .from(transactions)
    .where(eq(transactions.user_id, userId))
    .orderBy(desc(transactions.tx_date), desc(transactions.id))
    .all() as Parameters<typeof normalizeTx>[0][];
  const mmRows = dbo
    .select()
    .from(monthly_movements)
    .where(eq(monthly_movements.user_id, userId))
    .orderBy(monthly_movements.name, desc(monthly_movements.id))
    .all() as Parameters<typeof normalizeMm>[0][];
  const snapRows = dbo
    .select()
    .from(monthly_snapshots)
    .where(eq(monthly_snapshots.user_id, userId))
    .orderBy(desc(monthly_snapshots.snapshot_date), desc(monthly_snapshots.id))
    .all() as Parameters<typeof normalizeSnap>[0][];
  const styleRows = dbo
    .select({
      asset: asset_styles.asset,
      color_hex: asset_styles.color_hex,
      risk_level: asset_styles.risk_level
    })
    .from(asset_styles)
    .where(eq(asset_styles.user_id, userId))
    .all();
  const prefRow = dbo
    .select({ show_zero_assets: user_preferences.show_zero_assets })
    .from(user_preferences)
    .where(eq(user_preferences.user_id, userId))
    .limit(1)
    .get();

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

export function wipeUserData(
  db: SQLiteDB,
  userId: number,
  includeStyles: boolean,
  includePrefs: boolean
): void {
  const dbo = getDrizzle(db);
  dbo.delete(transactions).where(eq(transactions.user_id, userId)).run();
  dbo.delete(monthly_movements).where(eq(monthly_movements.user_id, userId)).run();
  dbo.delete(monthly_snapshots).where(eq(monthly_snapshots.user_id, userId)).run();
  if (includeStyles) dbo.delete(asset_styles).where(eq(asset_styles.user_id, userId)).run();
  if (includePrefs) dbo.delete(user_preferences).where(eq(user_preferences.user_id, userId)).run();
}

export function applyImport(db: SQLiteDB, userId: number, payload: ImportPayload): void {
  const dbo = getDrizzle(db);

  const txRows = payload.transactions.map((row) => {
    const id = String(row.id ?? makeId("tx")).slice(0, 64);
    const buyValue = Number(row.buyValue ?? 0);
    const pnl = Number(row.pnl ?? 0);
    const tipo = String(row.tipo ?? "");
    return {
      id,
      user_id: userId,
      tx_date: String(row.date ?? row.txDate ?? "").slice(0, 10),
      asset: String(row.asset ?? ""),
      tipo,
      derived_type: String(row.derivedType ?? row.type ?? inferType(tipo, buyValue, pnl)),
      buy_value: buyValue,
      pnl,
      current_value: Number.isFinite(Number(row.currentValue)) ? Number(row.currentValue) : buyValue + pnl,
      note: String(row.note ?? "")
    };
  });
  if (txRows.length > 0) {
    dbo.insert(transactions).values(txRows).onConflictDoNothing().run();
  }

  const validDirections = new Set(["income", "expense"]);
  const mmRows = payload.monthlyMovements.map((row) => ({
    id: String(row.id ?? makeId("mm")).slice(0, 64),
    user_id: userId,
    name: String(row.name ?? ""),
    direction: validDirections.has(String(row.direction)) ? String(row.direction) : "income",
    amount: Math.abs(Number(row.amount ?? 0)),
    note: String(row.note ?? "")
  }));
  if (mmRows.length > 0) {
    dbo.insert(monthly_movements).values(mmRows).onConflictDoNothing().run();
  }

  const snapRows = payload.monthlySnapshots.map((row) => ({
    id: String(row.id ?? makeId("snap")).slice(0, 64),
    user_id: userId,
    snapshot_date: String(row.date ?? row.snapshotDate ?? "").slice(0, 10),
    low_risk: Number(row.low ?? row.lowRisk ?? 0),
    medium_risk: Number(row.medium ?? row.mediumRisk ?? 0),
    high_risk: Number(row.high ?? row.highRisk ?? 0),
    liquid: Number(row.liquid ?? 0)
  }));
  if (snapRows.length > 0) {
    dbo.insert(monthly_snapshots).values(snapRows).onConflictDoNothing().run();
  }

  if (payload.replaceStyles) {
    const assets = new Set<string>([
      ...Object.keys(payload.assetColors),
      ...Object.keys(payload.assetRisks)
    ]);
    const styleRows = Array.from(assets).map((asset) => ({
      user_id: userId,
      asset,
      color_hex: payload.assetColors[asset] ?? null,
      risk_level: payload.assetRisks[asset] ?? null
    }));
    if (styleRows.length > 0) {
      dbo.insert(asset_styles).values(styleRows).onConflictDoNothing().run();
    }
  }

  if (payload.replacePrefs) {
    dbo
      .insert(user_preferences)
      .values({
        user_id: userId,
        show_zero_assets: payload.preferences.showZeroAssets ? 1 : 0
      })
      .run();
  }
}
