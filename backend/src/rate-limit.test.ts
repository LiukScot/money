import { describe, expect, test } from "bun:test";

import { createRateLimiter } from "./rate-limit.ts";
import { createTestApi, seedUser } from "./test-helpers.ts";

describe("createRateLimiter (unit)", () => {
  test("allows up to maxAttempts within window then denies", () => {
    const limiter = createRateLimiter(3, 60_000);
    expect(limiter.check("ip-1").allowed).toBe(true);
    expect(limiter.check("ip-1").allowed).toBe(true);
    expect(limiter.check("ip-1").allowed).toBe(true);
    const blocked = limiter.check("ip-1");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  test("keeps buckets per-key", () => {
    const limiter = createRateLimiter(1, 60_000);
    expect(limiter.check("ip-a").allowed).toBe(true);
    expect(limiter.check("ip-b").allowed).toBe(true);
    expect(limiter.check("ip-a").allowed).toBe(false);
  });

  test("_reset clears all buckets", () => {
    const limiter = createRateLimiter(1, 60_000);
    limiter.check("ip-1");
    expect(limiter.check("ip-1").allowed).toBe(false);
    limiter._reset();
    expect(limiter.check("ip-1").allowed).toBe(true);
  });

  test("maxAttempts=0 disables the limiter", () => {
    const limiter = createRateLimiter(0, 60_000);
    for (let i = 0; i < 100; i += 1) {
      expect(limiter.check("ip-1").allowed).toBe(true);
    }
  });

  test("expired window allows next attempt", async () => {
    const limiter = createRateLimiter(1, 1);
    expect(limiter.check("ip-1").allowed).toBe(true);
    expect(limiter.check("ip-1").allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 5));
    expect(limiter.check("ip-1").allowed).toBe(true);
  });
});

describe("POST /api/v1/auth/login rate limit (integration)", () => {
  test("returns 429 with Retry-After after 5 failed attempts from same IP", async () => {
    const ctx = createTestApi();
    await seedUser(ctx.db, { email: "ratelimit@example.com", password: "Password123!" });

    const attempt = (password: string) =>
      ctx.api.fetch(
        new Request("http://test/api/v1/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.42" },
          body: JSON.stringify({ email: "ratelimit@example.com", password })
        })
      );

    // 5 attempts with wrong password — all return 401, none yet rate-limited.
    for (let i = 0; i < 5; i += 1) {
      const res = await attempt("Wrong!");
      expect(res.status).toBe(401);
    }

    // 6th attempt from same IP is short-circuited before verifyPassword.
    const sixth = await attempt("Wrong!");
    expect(sixth.status).toBe(429);
    expect(sixth.headers.get("retry-after")).not.toBeNull();
    const body = (await sixth.json()) as { error: { code: string } };
    expect(body.error.code).toBe("RATE_LIMITED");
  });

  test("same rate-limit bucket applies to /change-password", async () => {
    const ctx = createTestApi();
    const seeded = await seedUser(ctx.db, { email: "rl2@example.com", password: "Password123!" });
    // Login first to get a valid session (change-password requires auth via global sessionGuard).
    const loginRes = await ctx.api.fetch(
      new Request("http://test/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.99" },
        body: JSON.stringify({ email: seeded.email, password: seeded.password })
      })
    );
    const sessionCookie = loginRes.headers.get("set-cookie")?.split(";")[0] ?? "";

    // Exhaust the bucket via 5 more login attempts (loginRateLimiter is shared).
    for (let i = 0; i < 5; i += 1) {
      await ctx.api.fetch(
        new Request("http://test/api/v1/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.99" },
          body: JSON.stringify({ email: seeded.email, password: "Wrong!" })
        })
      );
    }

    // change-password from same IP with valid session → rate-limited before inner handler runs.
    const res = await ctx.api.fetch(
      new Request("http://test/api/v1/auth/change-password", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "10.0.0.99",
          cookie: sessionCookie
        },
        body: JSON.stringify({ currentPassword: "Wrong!", newPassword: "NewPassword456!" })
      })
    );
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("RATE_LIMITED");
  });

  test("different IPs each get their own bucket", async () => {
    const ctx = createTestApi();
    await seedUser(ctx.db, { email: "buckets@example.com", password: "Password123!" });

    const attemptFrom = (ip: string) =>
      ctx.api.fetch(
        new Request("http://test/api/v1/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": ip },
          body: JSON.stringify({ email: "buckets@example.com", password: "Wrong!" })
        })
      );

    // Use up ip-A's full 5 attempts.
    for (let i = 0; i < 5; i += 1) {
      const res = await attemptFrom("10.0.0.1");
      expect(res.status).toBe(401);
    }
    const ipABlocked = await attemptFrom("10.0.0.1");
    expect(ipABlocked.status).toBe(429);

    // ip-B should still get a fresh 401, not 429.
    const ipBOk = await attemptFrom("10.0.0.2");
    expect(ipBOk.status).toBe(401);
  });
});
