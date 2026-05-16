import { describe, expect, test } from "bun:test";
import { apiRequest, loginRequest, seedUser, setupAuthed } from "./test-helpers.ts";

const validMm = { name: "Salary", direction: "income", amount: 3000, note: "" };

describe("monthly-movements auth", () => {
  test("GET requires auth", async () => {
    const { ctx } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/monthly-movements", { cookie: "" });
    expect(res.status).toBe(401);
  });

  test("POST requires auth", async () => {
    const { ctx } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/monthly-movements", { method: "POST", body: validMm });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/monthly-movements", () => {
  test("creates valid movement", async () => {
    const { ctx, cookie } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/monthly-movements", {
      method: "POST",
      cookie,
      body: validMm
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toMatch(/^mm-[0-9a-f-]+$/);
  });

  test("rejects negative amount (zod nonnegative)", async () => {
    const { ctx, cookie } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/monthly-movements", {
      method: "POST",
      cookie,
      body: { ...validMm, amount: -100 }
    });
    expect(res.status).toBe(400);
  });

  test("rejects invalid direction enum", async () => {
    const { ctx, cookie } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/monthly-movements", {
      method: "POST",
      cookie,
      body: { ...validMm, direction: "transfer" }
    });
    expect(res.status).toBe(400);
  });

  test("rejects empty name", async () => {
    const { ctx, cookie } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/monthly-movements", {
      method: "POST",
      cookie,
      body: { ...validMm, name: "" }
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/monthly-movements", () => {
  test("returns [] empty", async () => {
    const { ctx, cookie } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/monthly-movements", { cookie });
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  test("isolates rows across users (IDOR)", async () => {
    const { ctx, cookie } = await setupAuthed();
    await apiRequest(ctx.api, "/api/v1/monthly-movements", {
      method: "POST",
      cookie,
      body: validMm
    });
    await seedUser(ctx.db, { email: "other@example.com", password: "Password123!" });
    const otherCookie = await loginRequest(ctx.api, "other@example.com", "Password123!");
    const res = await apiRequest(ctx.api, "/api/v1/monthly-movements", { cookie: otherCookie });
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

describe("PUT /api/v1/monthly-movements/:id", () => {
  test("updates and returns ok", async () => {
    const { ctx, cookie } = await setupAuthed();
    const created = await apiRequest(ctx.api, "/api/v1/monthly-movements", {
      method: "POST",
      cookie,
      body: validMm
    });
    const { data } = await created.json();
    const res = await apiRequest(ctx.api, `/api/v1/monthly-movements/${data.id}`, {
      method: "PUT",
      cookie,
      body: { ...validMm, amount: 5000 }
    });
    expect(res.status).toBe(200);
  });

  test("returns 404 for non-existent id", async () => {
    const { ctx, cookie } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/monthly-movements/ghost", {
      method: "PUT",
      cookie,
      body: validMm
    });
    expect(res.status).toBe(404);
  });

  test("cannot update other user's movement (IDOR)", async () => {
    const { ctx, cookie } = await setupAuthed();
    const created = await apiRequest(ctx.api, "/api/v1/monthly-movements", {
      method: "POST",
      cookie,
      body: validMm
    });
    const { data } = await created.json();
    await seedUser(ctx.db, { email: "other@example.com", password: "Password123!" });
    const otherCookie = await loginRequest(ctx.api, "other@example.com", "Password123!");
    const res = await apiRequest(ctx.api, `/api/v1/monthly-movements/${data.id}`, {
      method: "PUT",
      cookie: otherCookie,
      body: { ...validMm, name: "hacked" }
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/v1/monthly-movements/:id", () => {
  test("deletes and returns ok", async () => {
    const { ctx, cookie } = await setupAuthed();
    const created = await apiRequest(ctx.api, "/api/v1/monthly-movements", {
      method: "POST",
      cookie,
      body: validMm
    });
    const { data } = await created.json();
    const res = await apiRequest(ctx.api, `/api/v1/monthly-movements/${data.id}`, {
      method: "DELETE",
      cookie
    });
    expect(res.status).toBe(200);
  });

  test("cannot delete other user's row (IDOR)", async () => {
    const { ctx, cookie } = await setupAuthed();
    const created = await apiRequest(ctx.api, "/api/v1/monthly-movements", {
      method: "POST",
      cookie,
      body: validMm
    });
    const { data } = await created.json();
    await seedUser(ctx.db, { email: "other@example.com", password: "Password123!" });
    const otherCookie = await loginRequest(ctx.api, "other@example.com", "Password123!");
    const res = await apiRequest(ctx.api, `/api/v1/monthly-movements/${data.id}`, {
      method: "DELETE",
      cookie: otherCookie
    });
    expect(res.status).toBe(404);
  });
});
