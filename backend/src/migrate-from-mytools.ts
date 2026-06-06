import fs from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";
import { eq, sql } from "drizzle-orm";
import { getDrizzle, openDb, runMigrations } from "./db.ts";
import {
  users as usersTbl,
  transactions as txTbl,
  monthly_movements as mmTbl,
  monthly_snapshots as snapTbl,
  asset_styles as styleTbl,
  user_preferences as prefTbl
} from "./db/schema.ts";
import { inferType } from "./helpers.ts";

type Args = {
  source: string;
  target: string;
  primaryEmail: string;
  fresh: boolean;
  report: string;
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const get = (key: string, fallback: string) => {
    const pref = `--${key}=`;
    const hit = args.find((a) => a.startsWith(pref));
    return hit ? hit.slice(pref.length) : fallback;
  };
  const fresh = args.includes("--fresh");
  const source = get("source", path.resolve(process.cwd(), "../../myTools/data/mytools.sqlite"));
  const target = get("target", process.env.DB_PATH || path.resolve(process.cwd(), "../data/mymoney.sqlite"));
  const primaryEmail = get("primary-email", process.env.MIGRATION_PRIMARY_EMAIL || "").trim();
  const report = get("report", path.resolve(process.cwd(), "../data/mymoney-migration-report.json"));
  if (!primaryEmail) {
    throw new Error("Missing primary email. Use --primary-email=... or MIGRATION_PRIMARY_EMAIL.");
  }
  return { source, target, primaryEmail, fresh, report };
}

function safeNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// reason: legacy JSON shape from external source DB is unknown at compile time
function readSourceJson(db: Database, name: string): any | null {
  const row = db.query(`SELECT data FROM files WHERE name = ? LIMIT 1`).get(name) as any; // reason: bun:sqlite raw query result has no type info
  if (!row?.data) return null;
  try {
    return JSON.parse(row.data);
  } catch (err) {
    console.error(`[migrate] could not parse JSON for key "${name}":`, err);
    return null;
  }
}

function main() {
  const cfg = parseArgs();

  if (!fs.existsSync(cfg.source)) {
    throw new Error(`Source DB not found: ${cfg.source}`);
  }

  fs.mkdirSync(path.dirname(cfg.target), { recursive: true });
  if (cfg.fresh && fs.existsSync(cfg.target)) {
    fs.rmSync(cfg.target, { force: true });
  }

  const source = new Database(cfg.source, { readonly: true });
  const target = openDb(cfg.target);
  runMigrations(target);
  const targetDbo = getDrizzle(target);

  const sourceUsers = source.query(`SELECT id, email, password_hash, name, created_at, updated_at FROM users ORDER BY id ASC`).all() as any[]; // reason: legacy source SQLite schema, fields accessed via String()/coercion below
  const primary = sourceUsers.find((u) => String(u.email).toLowerCase() === cfg.primaryEmail.toLowerCase());
  if (!primary) {
    throw new Error(`Primary email ${cfg.primaryEmail} not found in source users table.`);
  }

  const money = readSourceJson(source, "money.json") || {};
  const transactions = Array.isArray(money.transactions) ? money.transactions : [];
  const monthlyMovements = Array.isArray(money.monthlyMovements) ? money.monthlyMovements : [];
  const monthlySnapshots = Array.isArray(money.monthlySnapshots) ? money.monthlySnapshots : [];
  const assetColors = money.assetColors && typeof money.assetColors === "object" ? money.assetColors : {};
  const assetRisks = money.assetRisks && typeof money.assetRisks === "object" ? money.assetRisks : {};
  const preferences = money.preferences && typeof money.preferences === "object" ? money.preferences : {};

  const report: Record<string, unknown> = {
    source: cfg.source,
    target: cfg.target,
    primaryEmail: cfg.primaryEmail,
    migratedAt: new Date().toISOString(),
    usersCopied: 0,
    transactions: 0,
    monthlyMovements: 0,
    monthlySnapshots: 0,
    assetStyles: 0
  };

  const tx = target.transaction(() => {
    sourceUsers.forEach((user) => {
      targetDbo
        .insert(usersTbl)
        .values({
          id: user.id,
          email: user.email,
          password_hash: user.password_hash,
          name: user.name ?? null,
          ...(user.created_at ? { created_at: user.created_at } : {}),
          ...(user.updated_at ? { updated_at: user.updated_at } : {})
        })
        .onConflictDoUpdate({
          target: usersTbl.id,
          set: {
            email: user.email,
            password_hash: user.password_hash,
            name: user.name ?? null,
            ...(user.updated_at ? { updated_at: user.updated_at } : {})
          }
        })
        .run();
    });

    targetDbo.delete(txTbl).where(eq(txTbl.user_id, primary.id)).run();
    targetDbo.delete(mmTbl).where(eq(mmTbl.user_id, primary.id)).run();
    targetDbo.delete(snapTbl).where(eq(snapTbl.user_id, primary.id)).run();
    targetDbo.delete(styleTbl).where(eq(styleTbl.user_id, primary.id)).run();
    targetDbo.delete(prefTbl).where(eq(prefTbl.user_id, primary.id)).run();

    transactions.forEach((row: any, idx: number) => { // reason: legacy JSON shape, accessed via coercion
      const id = String(row.id ?? `tx-${idx}-${Date.now()}`);
      const date = String(row.date ?? "").slice(0, 10);
      const asset = String(row.asset ?? "");
      const tipo = String(row.tipo ?? row.type ?? "");
      const buyValue = safeNum(row.buyValue, 0);
      const pnl = safeNum(row.pnl, 0);
      const currentValue = Number.isFinite(Number(row.currentValue)) ? safeNum(row.currentValue) : buyValue + pnl;
      const derivedType = String(row.derived_type ?? row.type ?? inferType(tipo, buyValue, pnl));
      const note = String(row.note ?? "");
      targetDbo
        .insert(txTbl)
        .values({
          id,
          user_id: primary.id,
          tx_date: date,
          asset,
          tipo,
          derived_type: derivedType,
          buy_value: buyValue,
          pnl,
          current_value: currentValue,
          note
        })
        .run();
    });

    monthlyMovements.forEach((row: any, idx: number) => { // reason: legacy JSON shape, accessed via coercion
      const id = String(row.id ?? `mm-${idx}-${Date.now()}`);
      targetDbo
        .insert(mmTbl)
        .values({
          id,
          user_id: primary.id,
          name: String(row.name ?? ""),
          direction: String(row.direction ?? "income"),
          amount: Math.abs(safeNum(row.amount, 0)),
          note: String(row.note ?? "")
        })
        .run();
    });

    monthlySnapshots.forEach((row: any, idx: number) => { // reason: legacy JSON shape, accessed via coercion
      const id = String(row.id ?? `snap-${idx}-${Date.now()}`);
      targetDbo
        .insert(snapTbl)
        .values({
          id,
          user_id: primary.id,
          snapshot_date: String(row.date ?? "").slice(0, 10),
          low_risk: safeNum(row.low, 0),
          medium_risk: safeNum(row.medium, 0),
          high_risk: safeNum(row.high, 0),
          liquid: safeNum(row.liquid, 0)
        })
        .run();
    });

    const assets = new Set<string>([
      ...Object.keys(assetColors),
      ...Object.keys(assetRisks),
      ...transactions.map((t: any) => String(t.asset ?? "")).filter(Boolean) // reason: legacy JSON shape
    ]);

    assets.forEach((asset) => {
      const color = assetColors[asset] ? String(assetColors[asset]) : null;
      const risk = assetRisks[asset] ? String(assetRisks[asset]) : null;
      targetDbo
        .insert(styleTbl)
        .values({
          user_id: primary.id,
          asset,
          color_hex: color,
          risk_level: risk
        })
        .onConflictDoUpdate({
          target: [styleTbl.user_id, styleTbl.asset],
          set: {
            color_hex: color,
            risk_level: risk,
            updated_at: sql`CURRENT_TIMESTAMP`
          }
        })
        .run();
    });

    targetDbo
      .insert(prefTbl)
      .values({
        user_id: primary.id,
        show_zero_assets: preferences.showZeroAssets ? 1 : 0
      })
      .onConflictDoUpdate({
        target: prefTbl.user_id,
        set: {
          show_zero_assets: preferences.showZeroAssets ? 1 : 0,
          updated_at: sql`CURRENT_TIMESTAMP`
        }
      })
      .run();

    report.usersCopied = sourceUsers.length;
    report.transactions = transactions.length;
    report.monthlyMovements = monthlyMovements.length;
    report.monthlySnapshots = monthlySnapshots.length;
    report.assetStyles = assets.size;
  });

  tx();

  fs.mkdirSync(path.dirname(cfg.report), { recursive: true });
  fs.writeFileSync(cfg.report, JSON.stringify(report, null, 2));

  source.close();
  target.close();

  console.log(`Migration complete. Report written to ${cfg.report}`);
}

main();
