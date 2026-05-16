import { describe, expect, test } from "bun:test";
import { apiRequest, loginRequest, seedUser, setupAuthed } from "./test-helpers.ts";

const validTx = {
  txDate: "2026-05-16",
  asset: "ETF-A",
  tipo: "nuovo vincolo",
  buyValue: 1000,
  pnl: 50,
  note: "first"
};

describe("transactions auth", () => {
  test("GET /api/v1/transactions requires auth", async () => {
    const { ctx, cookie } = await setupAuthed();
    const ok = await apiRequest(ctx.api, "/api/v1/transactions", { cookie });
    expect(ok.status).toBe(200);
    const noAuth = await apiRequest(ctx.api, "/api/v1/transactions");
    expect(noAuth.status).toBe(401);
  });

  test("POST /api/v1/transactions requires auth", async () => {
    const { ctx } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/transactions", { method: "POST", body: validTx });
    expect(res.status).toBe(401);
  });

  test("PUT /api/v1/transactions/:id requires auth", async () => {
    const { ctx } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/transactions/tx-1", { method: "PUT", body: validTx });
    expect(res.status).toBe(401);
  });

  test("DELETE /api/v1/transactions/:id requires auth", async () => {
    const { ctx } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/transactions/tx-1", { method: "DELETE" });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/transactions", () => {
  test("creates transaction with valid body and returns id 201", async () => {
    const { ctx, cookie } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/transactions", {
      method: "POST",
      cookie,
      body: validTx
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toMatch(/^tx-[0-9a-f-]+$/);
  });

  test("rejects empty txDate with 400", async () => {
    const { ctx, cookie } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/transactions", {
      method: "POST",
      cookie,
      body: { ...validTx, txDate: "" }
    });
    expect(res.status).toBe(400);
  });

  test("rejects malformed date (PR #13 regression: ISO regex)", async () => {
    const { ctx, cookie } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/transactions", {
      method: "POST",
      cookie,
      body: { ...validTx, txDate: "16/05/2026" }
    });
    expect(res.status).toBe(400);
  });

  test("rejects junk date string (PR #13 regression: ISO regex)", async () => {
    const { ctx, cookie } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/transactions", {
      method: "POST",
      cookie,
      body: { ...validTx, txDate: "not-a-date" }
    });
    expect(res.status).toBe(400);
  });

  test("rejects empty asset", async () => {
    const { ctx, cookie } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/transactions", {
      method: "POST",
      cookie,
      body: { ...validTx, asset: "" }
    });
    expect(res.status).toBe(400);
  });

  test("rejects empty tipo", async () => {
    const { ctx, cookie } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/transactions", {
      method: "POST",
      cookie,
      body: { ...validTx, tipo: "" }
    });
    expect(res.status).toBe(400);
  });

  test("derives type from tipo+pnl when derivedType missing", async () => {
    const { ctx, cookie } = await setupAuthed();
    await apiRequest(ctx.api, "/api/v1/transactions", {
      method: "POST",
      cookie,
      body: { ...validTx, tipo: "cedola", buyValue: 0, pnl: 25 }
    });
    const list = await apiRequest(ctx.api, "/api/v1/transactions", { cookie });
    const body = await list.json();
    expect(body.data[0].derivedType).toBe("return");
  });

  test("computes currentValue=buyValue+pnl when currentValue missing", async () => {
    const { ctx, cookie } = await setupAuthed();
    await apiRequest(ctx.api, "/api/v1/transactions", {
      method: "POST",
      cookie,
      body: { ...validTx, buyValue: 1000, pnl: 50 }
    });
    const list = await apiRequest(ctx.api, "/api/v1/transactions", { cookie });
    const body = await list.json();
    expect(body.data[0].currentValue).toBe(1050);
  });
});

describe("GET /api/v1/transactions", () => {
  test("returns [] when no transactions", async () => {
    const { ctx, cookie } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/transactions", { cookie });
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  test("returns rows ordered by tx_date DESC", async () => {
    const { ctx, cookie } = await setupAuthed();
    for (const date of ["2026-04-01", "2026-06-01", "2026-05-01"]) {
      await apiRequest(ctx.api, "/api/v1/transactions", {
        method: "POST",
        cookie,
        body: { ...validTx, txDate: date }
      });
    }
    const res = await apiRequest(ctx.api, "/api/v1/transactions", { cookie });
    const body = await res.json();
    expect(body.data.map((r: { txDate: string }) => r.txDate)).toEqual([
      "2026-06-01",
      "2026-05-01",
      "2026-04-01"
    ]);
  });

  test("isolates transactions across users (IDOR check)", async () => {
    const { ctx, cookie } = await setupAuthed();
    await apiRequest(ctx.api, "/api/v1/transactions", { method: "POST", cookie, body: validTx });

    await seedUser(ctx.db, { email: "other@example.com", password: "Password123!" });
    const otherCookie = await loginRequest(ctx.api, "other@example.com", "Password123!");
    const res = await apiRequest(ctx.api, "/api/v1/transactions", { cookie: otherCookie });
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

describe("PUT /api/v1/transactions/:id", () => {
  test("updates and returns ok", async () => {
    const { ctx, cookie } = await setupAuthed();
    const created = await apiRequest(ctx.api, "/api/v1/transactions", {
      method: "POST",
      cookie,
      body: validTx
    });
    const { data } = await created.json();
    const res = await apiRequest(ctx.api, `/api/v1/transactions/${data.id}`, {
      method: "PUT",
      cookie,
      body: { ...validTx, asset: "ETF-B" }
    });
    expect(res.status).toBe(200);
    const list = await (await apiRequest(ctx.api, "/api/v1/transactions", { cookie })).json();
    expect(list.data[0].asset).toBe("ETF-B");
  });

  test("returns 404 for non-existent id", async () => {
    const { ctx, cookie } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/transactions/tx-ghost", {
      method: "PUT",
      cookie,
      body: validTx
    });
    expect(res.status).toBe(404);
  });

  test("cannot update another user's transaction (IDOR)", async () => {
    const { ctx, cookie } = await setupAuthed();
    const created = await apiRequest(ctx.api, "/api/v1/transactions", {
      method: "POST",
      cookie,
      body: validTx
    });
    const { data } = await created.json();
    await seedUser(ctx.db, { email: "other@example.com", password: "Password123!" });
    const otherCookie = await loginRequest(ctx.api, "other@example.com", "Password123!");
    const res = await apiRequest(ctx.api, `/api/v1/transactions/${data.id}`, {
      method: "PUT",
      cookie: otherCookie,
      body: { ...validTx, asset: "hacker" }
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/v1/transactions/:id", () => {
  test("deletes and returns ok", async () => {
    const { ctx, cookie } = await setupAuthed();
    const created = await apiRequest(ctx.api, "/api/v1/transactions", {
      method: "POST",
      cookie,
      body: validTx
    });
    const { data } = await created.json();
    const res = await apiRequest(ctx.api, `/api/v1/transactions/${data.id}`, {
      method: "DELETE",
      cookie
    });
    expect(res.status).toBe(200);
    const list = await (await apiRequest(ctx.api, "/api/v1/transactions", { cookie })).json();
    expect(list.data).toEqual([]);
  });

  test("returns 404 for non-existent id", async () => {
    const { ctx, cookie } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/transactions/tx-ghost", {
      method: "DELETE",
      cookie
    });
    expect(res.status).toBe(404);
  });

  test("cannot delete another user's transaction (IDOR)", async () => {
    const { ctx, cookie } = await setupAuthed();
    const created = await apiRequest(ctx.api, "/api/v1/transactions", {
      method: "POST",
      cookie,
      body: validTx
    });
    const { data } = await created.json();
    await seedUser(ctx.db, { email: "other@example.com", password: "Password123!" });
    const otherCookie = await loginRequest(ctx.api, "other@example.com", "Password123!");
    const res = await apiRequest(ctx.api, `/api/v1/transactions/${data.id}`, {
      method: "DELETE",
      cookie: otherCookie
    });
    expect(res.status).toBe(404);
  });
});
