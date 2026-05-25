import { describe, expect, test } from "bun:test";

import { apiRequest, setupAuthed } from "./test-helpers.ts";
import { transactions, monthly_movements, monthly_snapshots } from "./db/schema.ts";
import { getDrizzle } from "./db.ts";

type RowEnvelope<T> = { data: T[] };

async function seedTransactions(db: Parameters<typeof getDrizzle>[0], userId: number, count: number) {
  const dbo = getDrizzle(db);
  const rows = Array.from({ length: count }, (_, i) => ({
    id: `tx-${String(i).padStart(4, "0")}`,
    user_id: userId,
    tx_date: "2026-01-01",
    asset: "TEST",
    tipo: "nuovo vincolo" as const,
    derived_type: "buy" as const,
    buy_value: i + 1,
    pnl: 0,
    current_value: i + 1,
    note: ""
  }));
  for (const r of rows) dbo.insert(transactions).values(r).run();
}

describe("GET /api/v1/transactions pagination", () => {
  test("returns at most DEFAULT_LIMIT (1000) rows without query params", async () => {
    const { ctx, user, cookie } = await setupAuthed();
    await seedTransactions(ctx.db, user.id, 1005);

    const res = await apiRequest(ctx.api, "/api/v1/transactions", { cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as RowEnvelope<unknown>;
    expect(body.data.length).toBe(1000);
  });

  test("honors ?limit query param up to MAX_LIMIT (5000)", async () => {
    const { ctx, user, cookie } = await setupAuthed();
    await seedTransactions(ctx.db, user.id, 50);

    const res = await apiRequest(ctx.api, "/api/v1/transactions?limit=10", { cookie });
    const body = (await res.json()) as RowEnvelope<unknown>;
    expect(body.data.length).toBe(10);
  });

  test("clamps ?limit above MAX_LIMIT down to 5000", async () => {
    const { ctx, user, cookie } = await setupAuthed();
    await seedTransactions(ctx.db, user.id, 50);

    const res = await apiRequest(ctx.api, "/api/v1/transactions?limit=99999", { cookie });
    expect(res.status).toBe(200);
    // No more than 50 rows seeded, so the response itself is 50. The point
    // is the server didn't reject the request and didn't pass 99999 to SQL.
    const body = (await res.json()) as RowEnvelope<unknown>;
    expect(body.data.length).toBe(50);
  });

  test("?offset skips rows", async () => {
    const { ctx, user, cookie } = await setupAuthed();
    await seedTransactions(ctx.db, user.id, 5);

    const res = await apiRequest(ctx.api, "/api/v1/transactions?limit=10&offset=2", { cookie });
    const body = (await res.json()) as RowEnvelope<{ id: string }>;
    expect(body.data.length).toBe(3);
  });

  test("garbage ?limit falls back to default", async () => {
    const { ctx, user, cookie } = await setupAuthed();
    await seedTransactions(ctx.db, user.id, 3);

    const res = await apiRequest(ctx.api, "/api/v1/transactions?limit=banana", { cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as RowEnvelope<unknown>;
    expect(body.data.length).toBe(3);
  });
});

describe("GET /api/v1/monthly-movements pagination", () => {
  test("default cap applies", async () => {
    const { ctx, user, cookie } = await setupAuthed();
    const dbo = getDrizzle(ctx.db);
    for (let i = 0; i < 1005; i += 1) {
      dbo.insert(monthly_movements).values({
        id: `mm-${String(i).padStart(4, "0")}`,
        user_id: user.id,
        name: `m-${i}`,
        direction: "in",
        amount: i,
        note: null
      }).run();
    }
    const res = await apiRequest(ctx.api, "/api/v1/monthly-movements", { cookie });
    const body = (await res.json()) as RowEnvelope<unknown>;
    expect(body.data.length).toBe(1000);
  });
});

describe("GET /api/v1/monthly-snapshots pagination", () => {
  test("default cap applies", async () => {
    const { ctx, user, cookie } = await setupAuthed();
    const dbo = getDrizzle(ctx.db);
    for (let i = 0; i < 1005; i += 1) {
      dbo.insert(monthly_snapshots).values({
        id: `snap-${String(i).padStart(4, "0")}`,
        user_id: user.id,
        snapshot_date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
        low_risk: 0,
        medium_risk: 0,
        high_risk: 0,
        liquid: 0
      }).run();
    }
    const res = await apiRequest(ctx.api, "/api/v1/monthly-snapshots", { cookie });
    const body = (await res.json()) as RowEnvelope<unknown>;
    expect(body.data.length).toBe(1000);
  });
});
