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

describe("POST /api/v1/monthly-snapshots/quick", () => {
  test("requires auth", async () => {
    const { ctx } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/monthly-snapshots/quick", {
      method: "POST",
      body: { lowRisk: 0, mediumRisk: 0, highRisk: 0, liquid: 100 }
    });
    expect(res.status).toBe(401);
  });

  test("creates snapshot dated today with provided risk totals", async () => {
    const { ctx, cookie } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/monthly-snapshots/quick", {
      method: "POST",
      cookie,
      body: { lowRisk: 100, mediumRisk: 200, highRisk: 50, liquid: 1000 }
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    const today = new Date().toISOString().slice(0, 10);
    expect(body.data.snapshotDate).toBe(today);
    expect(body.data.id).toMatch(/^snap-/);

    const list = await (await apiRequest(ctx.api, "/api/v1/monthly-snapshots", { cookie })).json();
    const todays = list.data.filter((r: { snapshotDate: string }) => r.snapshotDate === today);
    expect(todays).toHaveLength(1);
    expect(todays[0].lowRisk).toBe(100);
    expect(todays[0].mediumRisk).toBe(200);
    expect(todays[0].highRisk).toBe(50);
    expect(todays[0].liquid).toBe(1000);
  });

  test("overwrites existing snapshot for today (legacy parity)", async () => {
    const { ctx, cookie } = await setupAuthed();
    await apiRequest(ctx.api, "/api/v1/monthly-snapshots/quick", {
      method: "POST",
      cookie,
      body: { lowRisk: 1, mediumRisk: 2, highRisk: 3, liquid: 4 }
    });
    await apiRequest(ctx.api, "/api/v1/monthly-snapshots/quick", {
      method: "POST",
      cookie,
      body: { lowRisk: 999, mediumRisk: 0, highRisk: 0, liquid: 0 }
    });
    const today = new Date().toISOString().slice(0, 10);
    const list = await (await apiRequest(ctx.api, "/api/v1/monthly-snapshots", { cookie })).json();
    const todays = list.data.filter((r: { snapshotDate: string }) => r.snapshotDate === today);
    expect(todays).toHaveLength(1);
    expect(todays[0].lowRisk).toBe(999);
  });

  test("does not affect snapshots from other dates", async () => {
    const { ctx, cookie } = await setupAuthed();
    await apiRequest(ctx.api, "/api/v1/monthly-snapshots", {
      method: "POST",
      cookie,
      body: { snapshotDate: "2025-01-15", lowRisk: 11, mediumRisk: 22, highRisk: 33, liquid: 44 }
    });
    await apiRequest(ctx.api, "/api/v1/monthly-snapshots/quick", {
      method: "POST",
      cookie,
      body: { lowRisk: 1, mediumRisk: 1, highRisk: 1, liquid: 1 }
    });
    const list = await (await apiRequest(ctx.api, "/api/v1/monthly-snapshots", { cookie })).json();
    const past = list.data.find((r: { snapshotDate: string }) => r.snapshotDate === "2025-01-15");
    expect(past?.lowRisk).toBe(11);
  });

  test("defaults missing numeric fields to 0", async () => {
    const { ctx, cookie } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/monthly-snapshots/quick", {
      method: "POST",
      cookie,
      body: {}
    });
    expect(res.status).toBe(201);
    const today = new Date().toISOString().slice(0, 10);
    const list = await (await apiRequest(ctx.api, "/api/v1/monthly-snapshots", { cookie })).json();
    const todays = list.data.find((r: { snapshotDate: string }) => r.snapshotDate === today);
    expect(todays.lowRisk).toBe(0);
    expect(todays.liquid).toBe(0);
  });

  test("isolates rows across users", async () => {
    const { ctx, cookie } = await setupAuthed();
    await apiRequest(ctx.api, "/api/v1/monthly-snapshots/quick", {
      method: "POST",
      cookie,
      body: { lowRisk: 100, mediumRisk: 0, highRisk: 0, liquid: 0 }
    });
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
