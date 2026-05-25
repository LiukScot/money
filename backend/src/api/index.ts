import { Hono } from "hono";
import type { SQLiteDB } from "../db.ts";
import type { ApiEnv } from "../schemas.ts";
import { createRateLimiter } from "../rate-limit.ts";
import { authRoutes } from "./auth.ts";
import { backupRoutes, purgeRoutes } from "./backup.ts";
import { movementRoutes } from "./movements.ts";
import { originGuard, securityHeaders, sessionGuard } from "./middleware.ts";
import { prefsRoutes } from "./prefs.ts";
import { snapshotRoutes } from "./snapshots.ts";
import { stylesRoutes } from "./styles.ts";
import { transactionRoutes } from "./transactions.ts";
import type { AppEnv } from "./types.ts";
import { jsonError } from "./responses.ts";

export type CreateApiOptions = {
  db: SQLiteDB;
  env: ApiEnv;
};

const PUBLIC_AUTH_PATHS = new Set([
  "/api/v1/auth/login",
  "/api/v1/auth/logout",
  "/api/v1/auth/session",
  "/api/v1/auth/register"
]);

export function createApi(opts: CreateApiOptions) {
  const app = new Hono<AppEnv>();

  // Per-instance rate limiter: defaults to 5 login attempts per IP per
  // 15 min, configurable via LOGIN_RATE_LIMIT_MAX and
  // LOGIN_RATE_LIMIT_WINDOW_SECONDS. argon2id verify is ~100 ms; without
  // this cap an unauthenticated caller can pin a CPU core. Lives on the
  // API instance so each createApi() call gets a fresh bucket.
  // Set LOGIN_RATE_LIMIT_MAX=0 to disable (e.g. E2E test runs).
  const loginRateLimiter = createRateLimiter(
    opts.env.LOGIN_RATE_LIMIT_MAX,
    opts.env.LOGIN_RATE_LIMIT_WINDOW_SECONDS * 1000
  );

  app.use("*", securityHeaders);
  app.use("*", async (c, next) => {
    c.set("db", opts.db);
    c.set("env", opts.env);
    c.set("loginRateLimiter", loginRateLimiter);
    await next();
  });
  app.use("*", originGuard(opts.env.ALLOWED_ORIGINS));

  app.use("/api/v1/*", async (c, next) => {
    if (PUBLIC_AUTH_PATHS.has(c.req.path)) return next();
    return sessionGuard(c, next);
  });

  app.route("/api/v1/auth", authRoutes);
  app.route("/api/v1/transactions", transactionRoutes);
  app.route("/api/v1/monthly-movements", movementRoutes);
  app.route("/api/v1/monthly-snapshots", snapshotRoutes);
  app.route("/api/v1/assets/styles", stylesRoutes);
  app.route("/api/v1/preferences", prefsRoutes);
  app.route("/api/v1/backup", backupRoutes);
  app.route("/api/v1/data", purgeRoutes);

  app.notFound((c) => {
    if (c.req.path.startsWith("/api/")) {
      return jsonError(c, "NOT_FOUND", "Route not found", 404);
    }
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      return jsonError(c, "METHOD_NOT_ALLOWED", "Method not allowed", 405);
    }
    return jsonError(c, "NOT_FOUND", "Route not found", 404);
  });

  app.onError((err, c) => {
    console.error("[hono] unhandled error:", err);
    return jsonError(c, "INTERNAL_ERROR", "Internal server error", 500);
  });

  return {
    fetch: app.fetch.bind(app)
  };
}
