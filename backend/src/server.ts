import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { lte } from "drizzle-orm";
import { getDrizzle, openDb, runMigrations } from "./db.ts";
import { user_sessions } from "./db/schema.ts";
import { createApi } from "./api/index.ts";
import { applySecurityHeaders } from "./security-headers.ts";

const envSchema = z.object({
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().default(8001),
  DB_PATH: z.string().default(path.resolve(process.cwd(), "../data/mymoney.sqlite")),
  SESSION_TTL_SECONDS: z.coerce.number().default(60 * 60 * 24 * 30), // 30 days
  SESSION_COOKIE_NAME: z.string().default("MYMONEY_SESSID"),
  ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:5174,http://127.0.0.1:5174,http://localhost:8001,http://127.0.0.1:8001"),
  PUBLIC_DIR: z.string().default(path.resolve(process.cwd(), "../frontend/dist")),
  // Default false so a plain-HTTP self-hosted LAN instance works out of the
  // box. Internet-facing deployments must serve over HTTPS and set
  // COOKIE_SECURE=true, otherwise the session cookie travels without the
  // Secure flag and can be intercepted.
  COOKIE_SECURE: z.string().default("false"),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().default(5),
  LOGIN_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().default(15 * 60)
});

const env = envSchema.parse(process.env);

if (env.COOKIE_SECURE.toLowerCase() !== "true") {
  console.warn(
    "⚠️  COOKIE_SECURE is disabled: session cookies are sent without the Secure flag. Use HTTPS and set COOKIE_SECURE=true for internet-facing deployments."
  );
}

fs.mkdirSync(path.dirname(env.DB_PATH), { recursive: true });
const db = openDb(env.DB_PATH);
runMigrations(db);
function sweepExpiredSessions() {
  getDrizzle(db)
    .delete(user_sessions)
    .where(lte(user_sessions.expires_at, Math.floor(Date.now() / 1000)))
    .run();
}
sweepExpiredSessions();
const sessionCleanupInterval = setInterval(sweepExpiredSessions, 60 * 60 * 1000);
process.once("SIGTERM", () => clearInterval(sessionCleanupInterval));
process.once("SIGINT", () => clearInterval(sessionCleanupInterval));

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

    if (url.pathname.startsWith("/api/")) {
      return api.fetch(req);
    }

    const https = env.COOKIE_SECURE.toLowerCase() === "true";
    if (req.method !== "GET" && req.method !== "HEAD") {
      const headers = new Headers({ "content-type": "application/json" });
      applySecurityHeaders(headers, https);
      return new Response(
        JSON.stringify({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } }),
        { status: 405, headers }
      );
    }

    const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;
    const staticFile = resolveStaticFile(env.PUBLIC_DIR, url.pathname);
    if (staticFile) {
      const headers = new Headers();
      applySecurityHeaders(headers, https);
      // Vite hashes all filenames under /assets/ — safe to cache indefinitely.
      // Everything else (index.html) must revalidate on every request.
      if (url.pathname.startsWith("/assets/")) {
        headers.set("cache-control", `public, max-age=${ONE_YEAR_SECONDS}, immutable`);
      } else {
        headers.set("cache-control", "no-cache");
      }
      return new Response(Bun.file(staticFile), { headers });
    }

    const indexFile = path.resolve(env.PUBLIC_DIR, "index.html");
    if (fs.existsSync(indexFile)) {
      const headers = new Headers();
      applySecurityHeaders(headers, https);
      headers.set("cache-control", "no-cache");
      return new Response(Bun.file(indexFile), { headers });
    }

    return new Response("myMoney backend running. Frontend build not found.", { status: 200 });
  }
});

console.log(`myMoney backend listening on http://${env.HOST}:${server.port}`);
