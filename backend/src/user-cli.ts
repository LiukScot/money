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
    const password = required("password");
    const name = arg("name") ?? null;
    const hash = await Bun.password.hash(password, { algorithm: "argon2id" });
    dbo.insert(users).values({ email, password_hash: hash, name }).run();
    console.log(`User created: ${email}`);
    db.close();
    return;
  }

  if (cmd === "reset-password") {
    const email = required("email").trim().toLowerCase();
    const password = required("password");
    const hash = await Bun.password.hash(password, { algorithm: "argon2id" });
    const result = dbo
      .update(users)
      .set({ password_hash: hash, updated_at: sql`CURRENT_TIMESTAMP` })
      .where(eq(users.email, email))
      .returning({ id: users.id })
      .all();
    if (result.length === 0) throw new Error(`User not found: ${email}`);
    console.log(`Password reset for ${email}`);
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
    console.log(`Disabled user: ${email}`);
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
    console.log(`Enabled user: ${email}`);
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
