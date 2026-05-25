import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { lte } from "drizzle-orm";
import { getDrizzle, openDb, runMigrations } from "./db.ts";
import { user_sessions } from "./db/schema.ts";
import { createApi } from "./app.ts";
import { makeError, setSecurityHeaders } from "./helpers.ts";

const envSchema = z.object({
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().default(8001),
  DB_PATH: z.string().default(path.resolve(process.cwd(), "../data/mymoney.sqlite")),
  SESSION_TTL_SECONDS: z.coerce.number().default(60 * 60 * 24 * 30),
  SESSION_COOKIE_NAME: z.string().default("MYMONEY_SESSID"),
  ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:5174,http://127.0.0.1:5174,http://localhost:8001,http://127.0.0.1:8001"),
  PUBLIC_DIR: z.string().default(path.resolve(process.cwd(), "../frontend/dist")),
  COOKIE_SECURE: z.string().default("false")
});

const env = envSchema.parse(process.env);

fs.mkdirSync(path.dirname(env.DB_PATH), { recursive: true });
const db = openDb(env.DB_PATH);
runMigrations(db);
getDrizzle(db)
  .delete(user_sessions)
  .where(lte(user_sessions.expires_at, Math.floor(Date.now() / 1000)))
  .run();

const api = createApi({ db, env });

function resolveStaticFile(publicDir: string, requestPath: string): string | null {
  const normalized = requestPath === "/" ? "/index.html" : requestPath;
  const unsafePath = path.resolve(publicDir, `.${normalized}`);
  const safeRoot = path.resolve(publicDir);
  if (!unsafePath.startsWith(safeRoot)) return null;
  if (fs.existsSync(unsafePath) && fs.statSync(unsafePath).isFile()) {
    return unsafePath;
  }
  return null;
}

const server = Bun.serve({
  hostname: env.HOST,
  port: env.PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const cors = api.getCorsHeaders(req);
    if (cors instanceof Response) return cors;

    if (url.pathname.startsWith("/api/")) {
      return api.fetch(req);
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      return makeError("METHOD_NOT_ALLOWED", "Method not allowed", 405, undefined, cors);
    }

    if (
      url.pathname === "/hub" ||
      url.pathname.startsWith("/hub/") ||
      url.pathname === "/myhealth" ||
      url.pathname.startsWith("/myhealth/") ||
      url.pathname === "/mymoney" ||
      url.pathname.startsWith("/mymoney/")
    ) {
      return makeError("NOT_FOUND", "Route not found", 404, undefined, cors);
    }

    const staticFile = resolveStaticFile(env.PUBLIC_DIR, url.pathname);
    if (staticFile) {
      setSecurityHeaders(cors);
      return new Response(Bun.file(staticFile), { headers: cors });
    }

    const indexFile = path.resolve(env.PUBLIC_DIR, "index.html");
    if (fs.existsSync(indexFile)) {
      setSecurityHeaders(cors);
      return new Response(Bun.file(indexFile), { headers: cors });
    }

    return new Response("myMoney backend running. Frontend build not found.", {
      status: 200,
      headers: cors
    });
  }
});

console.log(`myMoney backend listening on http://${env.HOST}:${server.port}`);
