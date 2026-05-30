import path from "node:path";
import { fileURLToPath } from "node:url";
import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import * as schema from "./db/schema.ts";

export type SQLiteDB = Database;
export type DrizzleDB = BunSQLiteDatabase<typeof schema>;

const MIGRATIONS_FOLDER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../drizzle"
);

export function openDb(dbPath: string): SQLiteDB {
  const db = new Database(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA synchronous = NORMAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  return db;
}

export function getDrizzle(db: SQLiteDB): DrizzleDB {
  return drizzle(db, { schema });
}

export function runMigrations(db: SQLiteDB): void {
  baselineIfNeeded(db);
  const drizzleDb = drizzle(db);
  migrate(drizzleDb, { migrationsFolder: MIGRATIONS_FOLDER });
}

function baselineIfNeeded(db: SQLiteDB): void {
  const usersExists = db
    .query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users' LIMIT 1"
    )
    .get();
  const drizzleMetaExists = db
    .query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations' LIMIT 1"
    )
    .get();
  if (!usersExists || drizzleMetaExists) return;
  const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });
  const first = migrations[0];
  if (!first) return;
  const tx = db.transaction(() => {
    db.exec(
      `CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hash TEXT NOT NULL,
        created_at NUMERIC
      )`
    );
    db.run(`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`, [
      first.hash,
      Date.now()
    ]);
  });
  tx();
}
