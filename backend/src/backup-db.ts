import fs from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";

const dbPath = process.env.DB_PATH || path.resolve(process.cwd(), "../data/mymoney.sqlite");
const backupDir = process.env.BACKUP_DIR || path.resolve(process.cwd(), "../data/backups");

if (!fs.existsSync(dbPath)) {
  console.error(`DB not found: ${dbPath}`);
  process.exit(1);
}

fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const target = path.join(backupDir, `mymoney-${stamp}.sqlite`);

const db = new Database(dbPath);
try {
  db.query(`VACUUM INTO ?`).run(target);
} finally {
  db.close();
}

console.log(target);
