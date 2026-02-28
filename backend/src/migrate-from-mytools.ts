import fs from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";
import { openDb, runMigrations } from "./db.ts";

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

function readSourceJson(db: Database, name: string): any | null {
  const row = db.query(`SELECT data FROM files WHERE name = ? LIMIT 1`).get(name) as any;
  if (!row?.data) return null;
  try {
    return JSON.parse(row.data);
  } catch {
    return null;
  }
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

  const users = source.query(`SELECT id, email, password_hash, name, created_at, updated_at FROM users ORDER BY id ASC`).all() as any[];
  const primary = users.find((u) => String(u.email).toLowerCase() === cfg.primaryEmail.toLowerCase());
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
    const upsertUser = target.query(
      `INSERT INTO users (id, email, password_hash, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))
       ON CONFLICT(id) DO UPDATE SET
        email=excluded.email,
        password_hash=excluded.password_hash,
        name=excluded.name,
        updated_at=COALESCE(excluded.updated_at, CURRENT_TIMESTAMP)`
    );

    users.forEach((user) => {
      upsertUser.run(user.id, user.email, user.password_hash, user.name ?? null, user.created_at ?? null, user.updated_at ?? null);
    });

    target.query(`DELETE FROM transactions WHERE user_id = ?`).run(primary.id);
    target.query(`DELETE FROM monthly_movements WHERE user_id = ?`).run(primary.id);
    target.query(`DELETE FROM monthly_snapshots WHERE user_id = ?`).run(primary.id);
    target.query(`DELETE FROM asset_styles WHERE user_id = ?`).run(primary.id);
    target.query(`DELETE FROM user_preferences WHERE user_id = ?`).run(primary.id);

    const insertTx = target.query(
      `INSERT INTO transactions (id, user_id, tx_date, asset, tipo, derived_type, buy_value, pnl, current_value, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    transactions.forEach((row: any, idx: number) => {
      const id = String(row.id ?? `tx-${idx}-${Date.now()}`);
      const date = String(row.date ?? "").slice(0, 10);
      const asset = String(row.asset ?? "");
      const tipo = String(row.tipo ?? row.type ?? "");
      const buyValue = safeNum(row.buyValue, 0);
      const pnl = safeNum(row.pnl, 0);
      const currentValue = Number.isFinite(Number(row.currentValue)) ? safeNum(row.currentValue) : buyValue + pnl;
      const derivedType = String(row.derived_type ?? row.type ?? inferType(tipo, buyValue, pnl));
      const note = String(row.note ?? "");
      insertTx.run(id, primary.id, date, asset, tipo, derivedType, buyValue, pnl, currentValue, note);
    });

    const insertMm = target.query(
      `INSERT INTO monthly_movements (id, user_id, name, direction, amount, note)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    monthlyMovements.forEach((row: any, idx: number) => {
      const id = String(row.id ?? `mm-${idx}-${Date.now()}`);
      insertMm.run(
        id,
        primary.id,
        String(row.name ?? ""),
        String(row.direction ?? "income"),
        Math.abs(safeNum(row.amount, 0)),
        String(row.note ?? "")
      );
    });

    const insertSnap = target.query(
      `INSERT INTO monthly_snapshots (id, user_id, snapshot_date, low_risk, medium_risk, high_risk, liquid)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    monthlySnapshots.forEach((row: any, idx: number) => {
      const id = String(row.id ?? `snap-${idx}-${Date.now()}`);
      insertSnap.run(
        id,
        primary.id,
        String(row.date ?? "").slice(0, 10),
        safeNum(row.low, 0),
        safeNum(row.medium, 0),
        safeNum(row.high, 0),
        safeNum(row.liquid, 0)
      );
    });

    const insertStyle = target.query(
      `INSERT INTO asset_styles (user_id, asset, color_hex, risk_level, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id, asset) DO UPDATE SET color_hex=excluded.color_hex, risk_level=excluded.risk_level, updated_at=CURRENT_TIMESTAMP`
    );

    const assets = new Set<string>([
      ...Object.keys(assetColors),
      ...Object.keys(assetRisks),
      ...transactions.map((t: any) => String(t.asset ?? "")).filter(Boolean)
    ]);

    assets.forEach((asset) => {
      const color = assetColors[asset] ? String(assetColors[asset]) : null;
      const risk = assetRisks[asset] ? String(assetRisks[asset]) : null;
      insertStyle.run(primary.id, asset, color, risk);
    });

    target
      .query(
        `INSERT OR REPLACE INTO user_preferences (user_id, show_zero_assets, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)`
      )
      .run(primary.id, preferences.showZeroAssets ? 1 : 0);

    report.usersCopied = users.length;
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
