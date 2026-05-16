import { describe, expect, test } from "bun:test";
import { apiRequest, loginRequest, seedUser, setupAuthed } from "./test-helpers.ts";

const validSnap = {
  snapshotDate: "2026-05-31",
  lowRisk: 1000,
  mediumRisk: 2000,
  highRisk: 1500,
  liquid: 500
};

describe("monthly-snapshots auth", () => {
  test("GET requires auth", async () => {
    const { ctx } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/monthly-snapshots", { cookie: "" });
    expect(res.status).toBe(401);
  });

  test("POST requires auth", async () => {
    const { ctx } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/monthly-snapshots", {
      method: "POST",
      body: validSnap
    });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/monthly-snapshots", () => {
  test("creates valid snapshot", async () => {
    const { ctx, cookie } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/monthly-snapshots", {
      method: "POST",
      cookie,
      body: validSnap
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toMatch(/^snap-[0-9a-f-]+$/);
  });

  test("rejects empty snapshotDate", async () => {
    const { ctx, cookie } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/monthly-snapshots", {
      method: "POST",
      cookie,
      body: { ...validSnap, snapshotDate: "" }
    });
    expect(res.status).toBe(400);
  });

  test("rejects malformed snapshotDate (PR #13 regression: ISO regex)", async () => {
    const { ctx, cookie } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/monthly-snapshots", {
      method: "POST",
      cookie,
      body: { ...validSnap, snapshotDate: "May 2026" }
    });
    expect(res.status).toBe(400);
  });

  test("defaults missing numeric fields to 0", async () => {
    const { ctx, cookie } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/monthly-snapshots", {
      method: "POST",
      cookie,
      body: { snapshotDate: "2026-05-31" }
    });
    expect(res.status).toBe(201);
    const list = await (await apiRequest(ctx.api, "/api/v1/monthly-snapshots", { cookie })).json();
    expect(list.data[0].lowRisk).toBe(0);
    expect(list.data[0].liquid).toBe(0);
  });
});

describe("GET /api/v1/monthly-snapshots", () => {
  test("returns rows ordered by snapshot_date DESC", async () => {
    const { ctx, cookie } = await setupAuthed();
    for (const d of ["2026-04-30", "2026-06-30", "2026-05-31"]) {
      await apiRequest(ctx.api, "/api/v1/monthly-snapshots", {
        method: "POST",
        cookie,
        body: { ...validSnap, snapshotDate: d }
      });
    }
    const res = await apiRequest(ctx.api, "/api/v1/monthly-snapshots", { cookie });
    const body = await res.json();
    expect(body.data.map((r: { snapshotDate: string }) => r.snapshotDate)).toEqual([
      "2026-06-30",
      "2026-05-31",
      "2026-04-30"
    ]);
  });

  test("isolates rows across users (IDOR)", async () => {
    const { ctx, cookie } = await setupAuthed();
    await apiRequest(ctx.api, "/api/v1/monthly-snapshots", { method: "POST", cookie, body: validSnap });
    await seedUser(ctx.db, { email: "other@example.com", password: "Password123!" });
    const otherCookie = await loginRequest(ctx.api, "other@example.com", "Password123!");
    const res = await apiRequest(ctx.api, "/api/v1/monthly-snapshots", { cookie: otherCookie });
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

describe("PUT/DELETE /api/v1/monthly-snapshots/:id", () => {
  test("PUT updates row", async () => {
    const { ctx, cookie } = await setupAuthed();
    const created = await apiRequest(ctx.api, "/api/v1/monthly-snapshots", {
      method: "POST",
      cookie,
      body: validSnap
    });
    const { data } = await created.json();
    const res = await apiRequest(ctx.api, `/api/v1/monthly-snapshots/${data.id}`, {
      method: "PUT",
      cookie,
      body: { ...validSnap, lowRisk: 9999 }
    });
    expect(res.status).toBe(200);
  });

  test("PUT returns 404 for unknown id", async () => {
    const { ctx, cookie } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/monthly-snapshots/ghost", {
      method: "PUT",
      cookie,
      body: validSnap
    });
    expect(res.status).toBe(404);
  });

  test("DELETE removes row", async () => {
    const { ctx, cookie } = await setupAuthed();
    const created = await apiRequest(ctx.api, "/api/v1/monthly-snapshots", {
      method: "POST",
      cookie,
      body: validSnap
    });
    const { data } = await created.json();
    const res = await apiRequest(ctx.api, `/api/v1/monthly-snapshots/${data.id}`, {
      method: "DELETE",
      cookie
    });
    expect(res.status).toBe(200);
  });

  test("cannot delete other user's snapshot (IDOR)", async () => {
    const { ctx, cookie } = await setupAuthed();
    const created = await apiRequest(ctx.api, "/api/v1/monthly-snapshots", {
      method: "POST",
      cookie,
      body: validSnap
    });
    const { data } = await created.json();
    await seedUser(ctx.db, { email: "other@example.com", password: "Password123!" });
    const otherCookie = await loginRequest(ctx.api, "other@example.com", "Password123!");
    const res = await apiRequest(ctx.api, `/api/v1/monthly-snapshots/${data.id}`, {
      method: "DELETE",
      cookie: otherCookie
    });
    expect(res.status).toBe(404);
  });
});
