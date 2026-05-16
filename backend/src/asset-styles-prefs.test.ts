import { describe, expect, test } from "bun:test";
import { apiRequest, loginRequest, seedUser, setupAuthed } from "./test-helpers.ts";

describe("/api/v1/assets/styles", () => {
  test("GET requires auth", async () => {
    const { ctx } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/assets/styles", { cookie: "" });
    expect(res.status).toBe(401);
  });

  test("GET returns empty object when none set", async () => {
    const { ctx, cookie } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/assets/styles", { cookie });
    const body = await res.json();
    expect(body.data).toEqual({});
  });

  test("PUT replaces full style set", async () => {
    const { ctx, cookie } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/assets/styles", {
      method: "PUT",
      cookie,
      body: {
        styles: {
          "ETF-A": { colorHex: "#aabbcc", riskLevel: "low" },
          "ETF-B": { colorHex: null, riskLevel: "high" }
        }
      }
    });
    expect(res.status).toBe(200);
    const get = await apiRequest(ctx.api, "/api/v1/assets/styles", { cookie });
    const body = await get.json();
    expect(body.data["ETF-A"].colorHex).toBe("#aabbcc");
    expect(body.data["ETF-B"].riskLevel).toBe("high");
  });

  test("PUT trims empty asset keys", async () => {
    const { ctx, cookie } = await setupAuthed();
    await apiRequest(ctx.api, "/api/v1/assets/styles", {
      method: "PUT",
      cookie,
      body: { styles: { "   ": { colorHex: "#000000", riskLevel: "low" } } }
    });
    const get = await apiRequest(ctx.api, "/api/v1/assets/styles", { cookie });
    const body = await get.json();
    expect(Object.keys(body.data)).toEqual([]);
  });

  test("PUT replaces previous styles (delete-then-insert semantics)", async () => {
    const { ctx, cookie } = await setupAuthed();
    await apiRequest(ctx.api, "/api/v1/assets/styles", {
      method: "PUT",
      cookie,
      body: { styles: { "ETF-A": { colorHex: "#000000", riskLevel: "low" } } }
    });
    await apiRequest(ctx.api, "/api/v1/assets/styles", {
      method: "PUT",
      cookie,
      body: { styles: { "ETF-B": { colorHex: "#ffffff", riskLevel: "high" } } }
    });
    const get = await apiRequest(ctx.api, "/api/v1/assets/styles", { cookie });
    const body = await get.json();
    expect(Object.keys(body.data)).toEqual(["ETF-B"]);
  });

  test("isolates styles across users (IDOR)", async () => {
    const { ctx, cookie } = await setupAuthed();
    await apiRequest(ctx.api, "/api/v1/assets/styles", {
      method: "PUT",
      cookie,
      body: { styles: { "ETF-A": { colorHex: "#000000", riskLevel: "low" } } }
    });
    await seedUser(ctx.db, { email: "other@example.com", password: "Password123!" });
    const otherCookie = await loginRequest(ctx.api, "other@example.com", "Password123!");
    const res = await apiRequest(ctx.api, "/api/v1/assets/styles", { cookie: otherCookie });
    const body = await res.json();
    expect(body.data).toEqual({});
  });
});

describe("/api/v1/preferences", () => {
  test("GET requires auth", async () => {
    const { ctx } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/preferences", { cookie: "" });
    expect(res.status).toBe(401);
  });

  test("GET returns default showZeroAssets=false when unset", async () => {
    const { ctx, cookie } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/preferences", { cookie });
    const body = await res.json();
    expect(body.data.showZeroAssets).toBe(false);
  });

  test("PUT then GET upserts and returns true", async () => {
    const { ctx, cookie } = await setupAuthed();
    await apiRequest(ctx.api, "/api/v1/preferences", {
      method: "PUT",
      cookie,
      body: { showZeroAssets: true }
    });
    const res = await apiRequest(ctx.api, "/api/v1/preferences", { cookie });
    const body = await res.json();
    expect(body.data.showZeroAssets).toBe(true);
  });

  test("PUT rejects invalid body (not boolean)", async () => {
    const { ctx, cookie } = await setupAuthed();
    const res = await apiRequest(ctx.api, "/api/v1/preferences", {
      method: "PUT",
      cookie,
      body: { showZeroAssets: "yes" }
    });
    expect(res.status).toBe(400);
  });

  test("isolates prefs across users (IDOR)", async () => {
    const { ctx, cookie } = await setupAuthed();
    await apiRequest(ctx.api, "/api/v1/preferences", {
      method: "PUT",
      cookie,
      body: { showZeroAssets: true }
    });
    await seedUser(ctx.db, { email: "other@example.com", password: "Password123!" });
    const otherCookie = await loginRequest(ctx.api, "other@example.com", "Password123!");
    const res = await apiRequest(ctx.api, "/api/v1/preferences", { cookie: otherCookie });
    const body = await res.json();
    expect(body.data.showZeroAssets).toBe(false);
  });
});
