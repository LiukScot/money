import { describe, expect, test } from "bun:test";
import { apiRequest, createTestApi, seedUser, setupAuthed } from "./test-helpers.ts";

describe("security headers (PR #13 regression)", () => {
  test("login response carries CSP + Referrer-Policy + nosniff + frame-deny", async () => {
    const ctx = createTestApi();
    await seedUser(ctx.db);
    const res = await apiRequest(ctx.api, "/api/v1/auth/login", {
      method: "POST",
      body: { email: "user@example.com", password: "Password123!" }
    });
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });

  test("error response carries CSP + Referrer-Policy", async () => {
    const ctx = createTestApi();
    const res = await apiRequest(ctx.api, "/api/v1/transactions");
    expect(res.status).toBe(401);
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  test("session response carries CSP + Referrer-Policy", async () => {
    const ctx = createTestApi();
    const res = await apiRequest(ctx.api, "/api/v1/auth/session");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  test("xlsx download response carries security headers", async () => {
    const { ctx, cookie } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/backup/xlsx", { cookie });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  test("OPTIONS preflight carries security headers", async () => {
    const ctx = createTestApi();
    const res = await ctx.api.fetch(
      new Request("http://test/api/v1/transactions", {
        method: "OPTIONS",
        headers: { origin: "http://example.test" }
      })
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
  });
});

describe("CORS handling", () => {
  test("rejects disallowed cross-origin with 403", async () => {
    const ctx = createTestApi();
    const res = await ctx.api.fetch(
      new Request("http://test/api/v1/transactions", {
        method: "GET",
        headers: { origin: "http://evil.example" }
      })
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("ORIGIN_NOT_ALLOWED");
  });

  test("allows configured origin", async () => {
    const ctx = createTestApi();
    const res = await ctx.api.fetch(
      new Request("http://test/api/v1/auth/session", {
        method: "GET",
        headers: { origin: "http://localhost:5174" }
      })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:5174");
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
    expect(res.headers.get("vary")).toBe("Origin");
  });

  test("rejects origin that matches server URL but is not in allow-list", async () => {
    const ctx = createTestApi();
    const res = await ctx.api.fetch(
      new Request("http://test/api/v1/auth/session", {
        method: "GET",
        headers: { origin: "http://test" }
      })
    );
    expect(res.status).toBe(403);
  });
});

describe("404 + 405 routing", () => {
  test("unknown route returns 404", async () => {
    const ctx = createTestApi();
    const res = await apiRequest(ctx.api, "/api/v1/does-not-exist");
    expect(res.status).toBe(401);
  });

  test("unknown route while authenticated returns 404", async () => {
    const { ctx, cookie } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/does-not-exist", { cookie });
    expect(res.status).toBe(404);
  });

  test("non-API method other than GET/HEAD returns 405", async () => {
    const ctx = createTestApi();
    const res = await ctx.api.fetch(new Request("http://test/", { method: "POST" }));
    expect(res.status).toBe(405);
  });
});
