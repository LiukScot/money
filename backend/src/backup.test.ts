import { describe, expect, test } from "bun:test";
import { apiRequest, loginRequest, seedUser, setupAuthed } from "./test-helpers.ts";

const baseTx = {
  txDate: "2026-05-16",
  asset: "ETF-A",
  tipo: "nuovo vincolo",
  buyValue: 1000,
  pnl: 50,
  note: ""
};

async function seedUserData(ctx: Awaited<ReturnType<typeof setupAuthed>>["ctx"], cookie: string) {
  await apiRequest(ctx.api, "/api/v1/transactions", { method: "POST", cookie, body: baseTx });
  await apiRequest(ctx.api, "/api/v1/monthly-movements", {
    method: "POST",
    cookie,
    body: { name: "Salary", direction: "income", amount: 3000, note: "" }
  });
  await apiRequest(ctx.api, "/api/v1/monthly-snapshots", {
    method: "POST",
    cookie,
    body: { snapshotDate: "2026-05-31", lowRisk: 1, mediumRisk: 2, highRisk: 3, liquid: 4 }
  });
  await apiRequest(ctx.api, "/api/v1/assets/styles", {
    method: "PUT",
    cookie,
    body: { styles: { "ETF-A": { colorHex: "#000000", riskLevel: "low" } } }
  });
  await apiRequest(ctx.api, "/api/v1/preferences", {
    method: "PUT",
    cookie,
    body: { showZeroAssets: true }
  });
}

describe("/api/v1/backup/json", () => {
  test("GET requires auth", async () => {
    const { ctx } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/backup/json", { cookie: "" });
    expect(res.status).toBe(401);
  });

  test("GET returns full export shape", async () => {
    const { ctx, cookie } = await setupAuthed();
    await seedUserData(ctx, cookie);
    const res = await apiRequest(ctx.api, "/api/v1/backup/json", { cookie });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.transactions).toHaveLength(1);
    expect(body.data.monthlyMovements).toHaveLength(1);
    expect(body.data.monthlySnapshots).toHaveLength(1);
    expect(body.data.assetColors["ETF-A"]).toBe("#000000");
    expect(body.data.assetRisks["ETF-A"]).toBe("low");
    expect(body.data.preferences.showZeroAssets).toBe(true);
  });

  test("isolates export per user (IDOR)", async () => {
    const { ctx, cookie } = await setupAuthed();
    await seedUserData(ctx, cookie);
    await seedUser(ctx.db, { email: "other@example.com", password: "Password123!" });
    const otherCookie = await loginRequest(ctx.api, "other@example.com", "Password123!");
    const res = await apiRequest(ctx.api, "/api/v1/backup/json", { cookie: otherCookie });
    const body = await res.json();
    expect(body.data.transactions).toEqual([]);
    expect(body.data.monthlyMovements).toEqual([]);
  });
});

describe("/api/v1/backup/json/import", () => {
  test("POST requires auth", async () => {
    const { ctx } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/backup/json/import", { method: "POST", body: {} });
    expect(res.status).toBe(401);
  });

  test("round-trip: export → import overwrites user data", async () => {
    const { ctx, cookie } = await setupAuthed();
    await seedUserData(ctx, cookie);
    const exp = await (await apiRequest(ctx.api, "/api/v1/backup/json", { cookie })).json();

    await apiRequest(ctx.api, "/api/v1/transactions", { method: "POST", cookie, body: baseTx });
    const importRes = await apiRequest(ctx.api, "/api/v1/backup/json/import", {
      method: "POST",
      cookie,
      body: exp.data
    });
    expect(importRes.status).toBe(200);
    const list = await (await apiRequest(ctx.api, "/api/v1/transactions", { cookie })).json();
    expect(list.data).toHaveLength(1);
  });

  test("import does not touch other user's data (IDOR)", async () => {
    const { ctx, cookie } = await setupAuthed();
    await seedUserData(ctx, cookie);

    await seedUser(ctx.db, { email: "other@example.com", password: "Password123!" });
    const otherCookie = await loginRequest(ctx.api, "other@example.com", "Password123!");
    await apiRequest(ctx.api, "/api/v1/backup/json/import", {
      method: "POST",
      cookie: otherCookie,
      body: { transactions: [], monthlyMovements: [], monthlySnapshots: [] }
    });

    const list = await (await apiRequest(ctx.api, "/api/v1/transactions", { cookie })).json();
    expect(list.data).toHaveLength(1);
  });
});

describe("/api/v1/backup/xlsx", () => {
  test("GET requires auth", async () => {
    const { ctx } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/backup/xlsx", { cookie: "" });
    expect(res.status).toBe(401);
  });

  test("GET returns xlsx content-type and bytes", async () => {
    const { ctx, cookie } = await setupAuthed();
    await seedUserData(ctx, cookie);
    const res = await apiRequest(ctx.api, "/api/v1/backup/xlsx", { cookie });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });
});

describe("/api/v1/backup/xlsx/import", () => {
  test("POST requires auth", async () => {
    const { ctx } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/backup/xlsx/import", { method: "POST", body: {} });
    expect(res.status).toBe(401);
  });

  test("POST rejects request with no file (no multipart, no base64)", async () => {
    const { ctx, cookie } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/backup/xlsx/import", {
      method: "POST",
      cookie,
      body: {}
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("MISSING_FILE");
  });

  test("POST round-trip: xlsx export then xlsx import preserves user data", async () => {
    const { ctx, cookie } = await setupAuthed();
    await seedUserData(ctx, cookie);
    const exp = await apiRequest(ctx.api, "/api/v1/backup/xlsx", { cookie });
    const buf = Buffer.from(await exp.arrayBuffer());
    const base64 = buf.toString("base64");

    await apiRequest(ctx.api, "/api/v1/data/purge", { method: "POST", cookie });
    const empty = await (await apiRequest(ctx.api, "/api/v1/transactions", { cookie })).json();
    expect(empty.data).toEqual([]);

    const importRes = await apiRequest(ctx.api, "/api/v1/backup/xlsx/import", {
      method: "POST",
      cookie,
      body: { base64 }
    });
    expect(importRes.status).toBe(200);
    const importBody = await importRes.json();
    expect(importBody.data.imported.transactions).toBe(1);

    const list = await (await apiRequest(ctx.api, "/api/v1/transactions", { cookie })).json();
    expect(list.data).toHaveLength(1);
    expect(list.data[0].asset).toBe("ETF-A");
  });
});

describe("/api/v1/backup/xlsx/import — input validation", () => {
  test("rejects base64 string exceeding size limit (FILE_TOO_LARGE)", async () => {
    const { ctx, cookie } = await setupAuthed();
    // 10 MB * 4/3 + 5 bytes exceeds the base64 ceiling.
    const oversized = "A".repeat(Math.ceil(10 * 1024 * 1024 * 4 / 3) + 5);
    const res = await apiRequest(ctx.api, "/api/v1/backup/xlsx/import", {
      method: "POST",
      cookie,
      body: { base64: oversized }
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("FILE_TOO_LARGE");
  });

  test("rejects base64 of non-XLSX bytes (INVALID_FILE)", async () => {
    const { ctx, cookie } = await setupAuthed();
    const garbage = Buffer.from("not an xlsx file").toString("base64");
    const res = await apiRequest(ctx.api, "/api/v1/backup/xlsx/import", {
      method: "POST",
      cookie,
      body: { base64: garbage }
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_FILE");
  });

  test("rejects multipart file shorter than 4 bytes (INVALID_FILE)", async () => {
    const { ctx, cookie } = await setupAuthed();
    const tinyFile = new File([new Uint8Array([0x50, 0x4b])], "test.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const form = new FormData();
    form.append("file", tinyFile);
    const res = await ctx.api.fetch(
      new Request("http://test/api/v1/backup/xlsx/import", {
        method: "POST",
        headers: { cookie },
        body: form
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_FILE");
  });
});

describe("/api/v1/data/purge", () => {
  test("POST requires auth", async () => {
    const { ctx } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/data/purge", { method: "POST" });
    expect(res.status).toBe(401);
  });

  test("POST wipes only the caller's data (IDOR)", async () => {
    const { ctx, cookie } = await setupAuthed();
    await seedUserData(ctx, cookie);
    await seedUser(ctx.db, { email: "other@example.com", password: "Password123!" });
    const otherCookie = await loginRequest(ctx.api, "other@example.com", "Password123!");
    await apiRequest(ctx.api, "/api/v1/transactions", {
      method: "POST",
      cookie: otherCookie,
      body: baseTx
    });

    await apiRequest(ctx.api, "/api/v1/data/purge", { method: "POST", cookie });

    const mine = await (await apiRequest(ctx.api, "/api/v1/transactions", { cookie })).json();
    expect(mine.data).toEqual([]);
    const theirs = await (
      await apiRequest(ctx.api, "/api/v1/transactions", { cookie: otherCookie })
    ).json();
    expect(theirs.data).toHaveLength(1);
  });
});
