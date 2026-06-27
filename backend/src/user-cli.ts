import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { getDrizzle, openDb, runMigrations } from "./db.ts";
import { users } from "./db/schema.ts";

const dbPath = process.env.DB_PATH || path.resolve(process.cwd(), "../data/mymoney.sqlite");
const cmd = process.argv[2];
const args = process.argv.slice(3);

function arg(name: string): string | undefined {
  const pref = `--${name}=`;
  const hit = args.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : undefined;
}

function required(name: string): string {
  const v = arg(name);
  if (!v) throw new Error(`Missing --${name}=...`);
  return v;
}

/**
 * Resolve the password without forcing it onto the command line, where it
 * would leak into shell history and the process list (`ps`). Precedence:
 * CLI_PASSWORD env -> --password arg (kept for backward compat) -> an
 * interactive prompt with terminal echo disabled. Never logged.
 */
async function resolvePassword(): Promise<string> {
  const fromEnv = process.env.CLI_PASSWORD;
  if (fromEnv) return fromEnv;

  const fromArg = arg("password");
  if (fromArg) {
    console.warn("Warning: --password exposes the password in the process list. Prefer CLI_PASSWORD env or interactive mode.");
    return fromArg;
  }

  if (!process.stdin.isTTY) {
    throw new Error(
      "No password provided. Set CLI_PASSWORD, pass --password=..., or run interactively."
    );
  }
  return promptHidden("Password: ");
}

function promptHidden(label: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const ENTER = ["\n", "\r"];
    const EOF = "\u0004"; // Ctrl-D
    const SIGINT = "\u0003"; // Ctrl-C
    const BACKSPACE = ["\u007f", "\b"]; // DEL, backspace
    process.stdout.write(label);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let value = "";
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ENTER.includes(ch) || ch === EOF) {
          cleanup();
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === SIGINT) {
          cleanup();
          process.stdout.write("\n");
          reject(new Error("Aborted"));
          return;
        }
        if (BACKSPACE.includes(ch)) {
          value = value.slice(0, -1);
          continue;
        }
        value += ch;
      }
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      stdin.removeListener("error", onError);
    };
    stdin.on("data", onData);
    stdin.on("error", onError);
  });
}

async function main() {
  const db = openDb(dbPath);
  runMigrations(db);
  const dbo = getDrizzle(db);

  if (cmd === "list") {
    const rows = dbo
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        disabled_at: users.disabled_at,
        created_at: users.created_at,
        updated_at: users.updated_at
      })
      .from(users)
      .orderBy(users.id)
      .all();
    console.table(rows);
    db.close();
    return;
  }

  if (cmd === "create") {
    const email = required("email").trim().toLowerCase();
    const password = await resolvePassword();
    if (password.length > 1024) throw new Error("Password too long (max 1024 chars)");
    const name = arg("name") ?? null;
    const hash = await Bun.password.hash(password, { algorithm: "argon2id" });
    dbo.insert(users).values({ email, password_hash: hash, name }).run();
    console.log("User created successfully");
    db.close();
    return;
  }

  if (cmd === "reset-password") {
    const email = required("email").trim().toLowerCase();
    const password = await resolvePassword();
    if (password.length > 1024) throw new Error("Password too long (max 1024 chars)");
    const hash = await Bun.password.hash(password, { algorithm: "argon2id" });
    const result = dbo
      .update(users)
      .set({ password_hash: hash, updated_at: sql`CURRENT_TIMESTAMP` })
      .where(eq(users.email, email))
      .returning({ id: users.id })
      .all();
    if (result.length === 0) throw new Error(`User not found: ${email}`);
    console.log("Password reset successfully");
    db.close();
    return;
  }

  if (cmd === "disable") {
    const email = required("email").trim().toLowerCase();
    const result = dbo
      .update(users)
      .set({ disabled_at: sql`CURRENT_TIMESTAMP`, updated_at: sql`CURRENT_TIMESTAMP` })
      .where(eq(users.email, email))
      .returning({ id: users.id })
      .all();
    if (result.length === 0) throw new Error(`User not found: ${email}`);
    console.log("User disabled successfully");
    db.close();
    return;
  }

  if (cmd === "enable") {
    const email = required("email").trim().toLowerCase();
    const result = dbo
      .update(users)
      .set({ disabled_at: null, updated_at: sql`CURRENT_TIMESTAMP` })
      .where(eq(users.email, email))
      .returning({ id: users.id })
      .all();
    if (result.length === 0) throw new Error(`User not found: ${email}`);
    console.log("User enabled successfully");
    db.close();
    return;
  }

  db.close();
  throw new Error("Unknown command. Use list/create/reset-password/disable/enable.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
