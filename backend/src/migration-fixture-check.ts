import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Database } from "bun:sqlite";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function text(out: Uint8Array): string {
  return Buffer.from(out).toString("utf8");
}

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mymoney-migration-fixture-"));
const sourcePath = path.join(workDir, "legacy.sqlite");
const targetPath = path.join(workDir, "mymoney.sqlite");
const reportPath = path.join(workDir, "report.json");

const source = new Database(sourcePath);
source.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT,
    created_at TEXT,
    updated_at TEXT
  );
  CREATE TABLE files (
    name TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );
`);

source
  .query(`INSERT INTO users (id, email, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
  .run(1, "primary@example.com", "legacy-hash-1", "Primary", "2026-01-01 00:00:00", "2026-01-01 00:00:00");
source
  .query(`INSERT INTO users (id, email, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
  .run(2, "secondary@example.com", "legacy-hash-2", "Secondary", "2026-01-01 00:00:00", "2026-01-01 00:00:00");

const moneyPayload = {
  transactions: [
    {
      id: "tx-1",
      date: "2026-01-15",
      asset: "ETF-A",
      tipo: "nuovo vincolo",
      buyValue: 1000,
      pnl: 50,
      currentValue: 1050,
      note: "first"
    },
    {
      id: "tx-2",
      date: "2026-01-16",
      asset: "ETF-B",
      tipo: "cedola",
      buyValue: 0,
      pnl: 10,
      currentValue: 10,
      note: "second"
    }
  ],
  monthlyMovements: [{ id: "mm-1", name: "Salary", direction: "income", amount: 3000, note: "" }],
  monthlySnapshots: [{ id: "snap-1", date: "2026-01-31", low: 1000, medium: 2000, high: 1500, liquid: 500 }],
  assetColors: { "ETF-A": "#000000", "ETF-B": "#111111" },
  assetRisks: { "ETF-A": "low", "ETF-B": "medium" },
  preferences: { showZeroAssets: true }
};

source.query(`INSERT INTO files (name, data) VALUES (?, ?)`).run("money.json", JSON.stringify(moneyPayload));
source.close();

const migration = Bun.spawnSync(
  [
    process.execPath,
    "src/migrate-from-mytools.ts",
    "--fresh",
    `--source=${sourcePath}`,
    `--target=${targetPath}`,
    `--report=${reportPath}`,
    "--primary-email=primary@example.com"
  ],
  {
    cwd: process.cwd(),
    env: process.env,
    stdout: "pipe",
    stderr: "pipe"
  }
);

if (migration.exitCode !== 0) {
  throw new Error(`Migration failed\nstdout:\n${text(migration.stdout)}\nstderr:\n${text(migration.stderr)}`);
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as Record<string, unknown>;
assert(report.usersCopied === 2, "Expected 2 migrated users");
assert(report.transactions === 2, "Expected 2 transactions");
assert(report.monthlyMovements === 1, "Expected 1 monthly movement");
assert(report.monthlySnapshots === 1, "Expected 1 monthly snapshot");
assert(report.assetStyles === 2, "Expected 2 asset styles");

const target = new Database(targetPath, { readonly: true });
const count = (table: string) => Number((target.query(`SELECT COUNT(*) as c FROM ${table}`).get() as any)?.c ?? 0);
assert(count("users") === 2, "Target users count mismatch");
assert(count("transactions") === 2, "Target transactions count mismatch");
assert(count("monthly_movements") === 1, "Target monthly movements count mismatch");
assert(count("monthly_snapshots") === 1, "Target monthly snapshots count mismatch");
assert(count("asset_styles") === 2, "Target asset styles count mismatch");
target.close();

console.log("myMoney migration fixture check passed");
