import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Database } from "bun:sqlite";

function mkTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const cwd = path.resolve(import.meta.dir, "..");

async function runScript(
  script: string,
  args: string[],
  env: Record<string, string> = {}
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, `src/${script}`, ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe"
  });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { exitCode, stdout, stderr };
}

describe("migrate.ts", () => {
  test("creates DB with full schema", async () => {
    const dir = mkTmpDir("mymoney-migrate-");
    const dbPath = path.join(dir, "test.sqlite");
    const result = await runScript("migrate.ts", [`--db=${dbPath}`]);
    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(dbPath)).toBe(true);

    const db = new Database(dbPath, { readonly: true });
    const tables = db
      .query(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("users");
    expect(names).toContain("transactions");
    expect(names).toContain("monthly_movements");
    expect(names).toContain("monthly_snapshots");
    expect(names).toContain("asset_styles");
    expect(names).toContain("user_preferences");
    expect(names).toContain("user_sessions");
    expect(names).toContain("__drizzle_migrations");
    db.close();
  });

  test("is idempotent: rerun is no-op", async () => {
    const dir = mkTmpDir("mymoney-migrate-idemp-");
    const dbPath = path.join(dir, "test.sqlite");
    await runScript("migrate.ts", [`--db=${dbPath}`]);
    const result = await runScript("migrate.ts", [`--db=${dbPath}`]);
    expect(result.exitCode).toBe(0);
  });

  test("--fresh wipes DB", async () => {
    const dir = mkTmpDir("mymoney-migrate-fresh-");
    const dbPath = path.join(dir, "test.sqlite");
    await runScript("migrate.ts", [`--db=${dbPath}`]);
    const db = new Database(dbPath);
    db.query(`INSERT INTO users (email, password_hash) VALUES (?, ?)`).run("a@b.c", "hash");
    db.close();

    await runScript("migrate.ts", [`--db=${dbPath}`, "--fresh"]);
    const db2 = new Database(dbPath, { readonly: true });
    const count = db2.query(`SELECT COUNT(*) as c FROM users`).get() as { c: number };
    expect(count.c).toBe(0);
    db2.close();
  });
});

describe("user-cli.ts", () => {
  test("create + list + reset-password + disable + enable", async () => {
    const dir = mkTmpDir("mymoney-user-cli-");
    const dbPath = path.join(dir, "test.sqlite");
    await runScript("migrate.ts", [`--db=${dbPath}`]);

    const create = await runScript(
      "user-cli.ts",
      ["create", "--email=user@example.com", "--password=Password123!", "--name=User"],
      { DB_PATH: dbPath }
    );
    expect(create.exitCode).toBe(0);
    expect(create.stdout).toContain("User created");

    const list = await runScript("user-cli.ts", ["list"], { DB_PATH: dbPath });
    expect(list.exitCode).toBe(0);
    expect(list.stdout).toContain("user@example.com");

    const db = new Database(dbPath, { readonly: true });
    const before = db
      .query(`SELECT password_hash FROM users WHERE email = ?`)
      .get("user@example.com") as { password_hash: string };
    db.close();

    const reset = await runScript(
      "user-cli.ts",
      ["reset-password", "--email=user@example.com", "--password=NewPassword456!"],
      { DB_PATH: dbPath }
    );
    expect(reset.exitCode).toBe(0);

    const db2 = new Database(dbPath, { readonly: true });
    const after = db2
      .query(`SELECT password_hash FROM users WHERE email = ?`)
      .get("user@example.com") as { password_hash: string };
    db2.close();
    expect(after.password_hash).not.toBe(before.password_hash);

    const disable = await runScript("user-cli.ts", ["disable", "--email=user@example.com"], {
      DB_PATH: dbPath
    });
    expect(disable.exitCode).toBe(0);
    const enable = await runScript("user-cli.ts", ["enable", "--email=user@example.com"], {
      DB_PATH: dbPath
    });
    expect(enable.exitCode).toBe(0);
  });

  test("reset-password fails for unknown user", async () => {
    const dir = mkTmpDir("mymoney-user-cli-fail-");
    const dbPath = path.join(dir, "test.sqlite");
    await runScript("migrate.ts", [`--db=${dbPath}`]);
    const result = await runScript(
      "user-cli.ts",
      ["reset-password", "--email=ghost@example.com", "--password=Password123!"],
      { DB_PATH: dbPath }
    );
    expect(result.exitCode).not.toBe(0);
  });
});

describe("backup-db.ts + restore-db.ts round-trip", () => {
  test("backup → wipe → restore restores data", async () => {
    const dir = mkTmpDir("mymoney-bk-");
    const dbPath = path.join(dir, "main.sqlite");
    const backupDir = path.join(dir, "backups");

    await runScript("migrate.ts", [`--db=${dbPath}`]);

    const db = new Database(dbPath);
    db.query(`INSERT INTO users (email, password_hash) VALUES (?, ?)`).run("user@example.com", "hash");
    db.close();

    const backup = await runScript("backup-db.ts", [], { DB_PATH: dbPath, BACKUP_DIR: backupDir });
    expect(backup.exitCode).toBe(0);
    const backupFile = backup.stdout.trim();
    expect(fs.existsSync(backupFile)).toBe(true);

    fs.rmSync(dbPath, { force: true });
    expect(fs.existsSync(dbPath)).toBe(false);

    const restore = await runScript("restore-db.ts", [`--file=${backupFile}`], { DB_PATH: dbPath });
    expect(restore.exitCode).toBe(0);
    expect(fs.existsSync(dbPath)).toBe(true);

    const db2 = new Database(dbPath, { readonly: true });
    const row = db2
      .query(`SELECT email FROM users WHERE email = ?`)
      .get("user@example.com") as { email: string };
    expect(row.email).toBe("user@example.com");
    db2.close();
  });

  test("backup fails when DB does not exist", async () => {
    const dir = mkTmpDir("mymoney-bk-fail-");
    const result = await runScript("backup-db.ts", [], {
      DB_PATH: path.join(dir, "ghost.sqlite"),
      BACKUP_DIR: dir
    });
    expect(result.exitCode).not.toBe(0);
  });

  test("restore fails when source missing", async () => {
    const dir = mkTmpDir("mymoney-rs-fail-");
    const result = await runScript("restore-db.ts", [`--file=${path.join(dir, "ghost.sqlite")}`], {
      DB_PATH: path.join(dir, "main.sqlite")
    });
    expect(result.exitCode).not.toBe(0);
  });

  test("restore preserves pre-restore backup", async () => {
    const dir = mkTmpDir("mymoney-rs-preserve-");
    const dbPath = path.join(dir, "main.sqlite");
    const backupDir = path.join(dir, "backups");

    await runScript("migrate.ts", [`--db=${dbPath}`]);
    const db = new Database(dbPath);
    db.query(`INSERT INTO users (email, password_hash) VALUES (?, ?)`).run("a@b.c", "h");
    db.close();
    const backup = await runScript("backup-db.ts", [], { DB_PATH: dbPath, BACKUP_DIR: backupDir });
    const backupFile = backup.stdout.trim();

    await runScript("restore-db.ts", [`--file=${backupFile}`], { DB_PATH: dbPath });
    const files = fs.readdirSync(dir).filter((f) => f.includes(".pre-restore-"));
    expect(files.length).toBeGreaterThan(0);
  });
});
