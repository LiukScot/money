import path from "node:path";
import { defineConfig } from "drizzle-kit";

const dbPath =
  process.env.DB_PATH || path.resolve(process.cwd(), "../data/mymoney.sqlite");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath,
  },
});
