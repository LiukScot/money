import { Database } from "bun:sqlite";
import { migrationStatements, SCHEMA_VERSION } from "./schema.ts";

export type SQLiteDB = Database;

export function openDb(dbPath: string): SQLiteDB {
  const db = new Database(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

export function runMigrations(db: SQLiteDB): void {
  const tx = db.transaction(() => {
    migrationStatements.forEach((stmt) => db.exec(stmt));
    db.query(
      `INSERT INTO app_meta(key, value) VALUES('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`
    ).run(String(SCHEMA_VERSION));
  });
  tx();
}
