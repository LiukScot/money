import { describe, expect, test } from "bun:test";
import {
  apiRequest,
  createTestApi,
  extractSessionCookie,
  loginRequest,
  seedUser,
  TEST_COOKIE_NAME
} from "./test-helpers.ts";

describe("POST /api/v1/auth/login", () => {
  test("rejects unknown email with 401 INVALID_CREDENTIALS", async () => {
    const ctx = createTestApi();
    await seedUser(ctx.db, { email: "user@example.com", password: "Password123!" });
    const res = await apiRequest(ctx.api, "/api/v1/auth/login", {
      method: "POST",
      body: { email: "nobody@example.com", password: "Password123!" }
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_CREDENTIALS");
  });

  test("rejects wrong password with 401", async () => {
    const ctx = createTestApi();
    await seedUser(ctx.db, { email: "user@example.com", password: "Password123!" });
    const res = await apiRequest(ctx.api, "/api/v1/auth/login", {
      method: "POST",
      body: { email: "user@example.com", password: "WrongPassword!" }
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_CREDENTIALS");
  });

  test("rejects disabled account with 403", async () => {
    const ctx = createTestApi();
    await seedUser(ctx.db, {
      email: "user@example.com",
      password: "Password123!",
      disabledAt: new Date().toISOString()
    });
    const res = await apiRequest(ctx.api, "/api/v1/auth/login", {
      method: "POST",
      body: { email: "user@example.com", password: "Password123!" }
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("ACCOUNT_DISABLED");
  });

  test("succeeds with correct credentials and sets session cookie", async () => {
    const ctx = createTestApi();
    await seedUser(ctx.db, { email: "user@example.com", password: "Password123!" });
    const res = await apiRequest(ctx.api, "/api/v1/auth/login", {
      method: "POST",
      body: { email: "user@example.com", password: "Password123!" }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.email).toBe("user@example.com");
    const cookie = res.headers.get("set-cookie");
    expect(cookie).toContain(`${TEST_COOKIE_NAME}=`);
    expect(cookie).toContain("HttpOnly");
  });

  test("rejects password longer than 72 chars (PR #13 regression)", async () => {
    const ctx = createTestApi();
    await seedUser(ctx.db);
    const res = await apiRequest(ctx.api, "/api/v1/auth/login", {
      method: "POST",
      body: { email: "user@example.com", password: "x".repeat(73) }
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("rejects email longer than 254 chars (PR #13 regression)", async () => {
    const ctx = createTestApi();
    await seedUser(ctx.db);
    const longEmail = `${"x".repeat(250)}@e.co`;
    const res = await apiRequest(ctx.api, "/api/v1/auth/login", {
      method: "POST",
      body: { email: longEmail, password: "Password123!" }
    });
    expect(res.status).toBe(400);
  });

  test("rejects malformed email with 400", async () => {
    const ctx = createTestApi();
    await seedUser(ctx.db);
    const res = await apiRequest(ctx.api, "/api/v1/auth/login", {
      method: "POST",
      body: { email: "not-an-email", password: "Password123!" }
    });
    expect(res.status).toBe(400);
  });

  test("rejects empty body with 400", async () => {
    const ctx = createTestApi();
    const res = await apiRequest(ctx.api, "/api/v1/auth/login", { method: "POST", body: {} });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/auth/register", () => {
  test("returns 403 SIGNUP_DISABLED", async () => {
    const ctx = createTestApi();
    const res = await apiRequest(ctx.api, "/api/v1/auth/register", {
      method: "POST",
      body: { email: "new@example.com", password: "Password123!" }
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("SIGNUP_DISABLED");
  });
});

describe("POST /api/v1/auth/logout", () => {
  test("clears session cookie even when no session present", async () => {
    const ctx = createTestApi();
    const res = await apiRequest(ctx.api, "/api/v1/auth/logout", { method: "POST" });
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie");
    expect(cookie).toContain(`${TEST_COOKIE_NAME}=`);
    expect(cookie).toContain("Max-Age=0");
  });

  test("deletes session row and clears cookie when logged in", async () => {
    const ctx = createTestApi();
    const seeded = await seedUser(ctx.db);
    const cookie = await loginRequest(ctx.api, seeded.email, seeded.password);
    const res = await apiRequest(ctx.api, "/api/v1/auth/logout", { method: "POST", cookie });
    expect(res.status).toBe(200);

    const sessionRes = await apiRequest(ctx.api, "/api/v1/auth/session", { cookie });
    const body = await sessionRes.json();
    expect(body.data.authenticated).toBe(false);
  });
});

describe("GET /api/v1/auth/session", () => {
  test("returns authenticated=false without cookie", async () => {
    const ctx = createTestApi();
    const res = await apiRequest(ctx.api, "/api/v1/auth/session");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.authenticated).toBe(false);
  });

  test("returns authenticated=true with valid session cookie", async () => {
    const ctx = createTestApi();
    const seeded = await seedUser(ctx.db);
    const cookie = await loginRequest(ctx.api, seeded.email, seeded.password);
    const res = await apiRequest(ctx.api, "/api/v1/auth/session", { cookie });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.authenticated).toBe(true);
    expect(body.data.user.email).toBe(seeded.email);
  });

  test("returns authenticated=false for stale/unknown cookie", async () => {
    const ctx = createTestApi();
    const res = await apiRequest(ctx.api, "/api/v1/auth/session", {
      cookie: `${TEST_COOKIE_NAME}=ghostsession`
    });
    const body = await res.json();
    expect(body.data.authenticated).toBe(false);
  });
});

describe("POST /api/v1/auth/change-password", () => {
  test("requires authentication", async () => {
    const ctx = createTestApi();
    const res = await apiRequest(ctx.api, "/api/v1/auth/change-password", {
      method: "POST",
      body: { currentPassword: "Password123!", newPassword: "NewPassword456!" }
    });
    expect(res.status).toBe(401);
  });

  test("rejects wrong current password with 400", async () => {
    const ctx = createTestApi();
    const seeded = await seedUser(ctx.db);
    const cookie = await loginRequest(ctx.api, seeded.email, seeded.password);
    const res = await apiRequest(ctx.api, "/api/v1/auth/change-password", {
      method: "POST",
      cookie,
      body: { currentPassword: "WrongPassword!", newPassword: "NewPassword456!" }
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_CURRENT_PASSWORD");
  });

  test("rejects short new password with 400", async () => {
    const ctx = createTestApi();
    const seeded = await seedUser(ctx.db);
    const cookie = await loginRequest(ctx.api, seeded.email, seeded.password);
    const res = await apiRequest(ctx.api, "/api/v1/auth/change-password", {
      method: "POST",
      cookie,
      body: { currentPassword: seeded.password, newPassword: "short" }
    });
    expect(res.status).toBe(400);
  });

  test("rejects new password > 72 chars (PR #13 regression)", async () => {
    const ctx = createTestApi();
    const seeded = await seedUser(ctx.db);
    const cookie = await loginRequest(ctx.api, seeded.email, seeded.password);
    const res = await apiRequest(ctx.api, "/api/v1/auth/change-password", {
      method: "POST",
      cookie,
      body: { currentPassword: seeded.password, newPassword: "x".repeat(73) }
    });
    expect(res.status).toBe(400);
  });

  test("succeeds, rotates session, accepts new password on next login", async () => {
    const ctx = createTestApi();
    const seeded = await seedUser(ctx.db);
    const oldCookie = await loginRequest(ctx.api, seeded.email, seeded.password);
    const res = await apiRequest(ctx.api, "/api/v1/auth/change-password", {
      method: "POST",
      cookie: oldCookie,
      body: { currentPassword: seeded.password, newPassword: "NewPassword456!" }
    });
    expect(res.status).toBe(200);
    const newCookie = extractSessionCookie(res.headers.get("set-cookie"));
    expect(newCookie).not.toBe(oldCookie);

    const loginRes = await apiRequest(ctx.api, "/api/v1/auth/login", {
      method: "POST",
      body: { email: seeded.email, password: "NewPassword456!" }
    });
    expect(loginRes.status).toBe(200);
  });
});

describe("bcrypt legacy hash rehash on login (security regression)", () => {
  test("bcrypt hash accepted and rehashed to argon2id", async () => {
    const ctx = createTestApi();
    const bcrypt = (await import("bcryptjs")).default;
    const password = "LegacyPass123!";
    const legacyHash = bcrypt.hashSync(password, 6);
    ctx.db
      .query(`INSERT INTO users (email, password_hash) VALUES (?, ?)`)
      .run("legacy@example.com", legacyHash);

    const res = await apiRequest(ctx.api, "/api/v1/auth/login", {
      method: "POST",
      body: { email: "legacy@example.com", password }
    });
    expect(res.status).toBe(200);

    const row = ctx.db
      .query(`SELECT password_hash FROM users WHERE email = ?`)
      .get("legacy@example.com") as { password_hash: string };
    expect(row.password_hash.startsWith("$argon2id$")).toBe(true);
  });
});
