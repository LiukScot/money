import { expect, test } from "@playwright/test";
import { loginUi, purgeUserData, seedTransaction } from "./helpers.ts";

test.describe("backup import/export journey", () => {
  test.beforeEach(async ({ request }) => {
    await purgeUserData(request);
  });

  test("XLSX export → API round-trip via import yields same rows", async ({ request }) => {
    await seedTransaction(request, { asset: "ETF-RT", buyValue: 777 });

    const exportRes = await request.get("/api/v1/backup/xlsx");
    expect(exportRes.status()).toBe(200);
    expect(exportRes.headers()["content-type"]).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    const buf = Buffer.from(await exportRes.body());
    expect(buf.length).toBeGreaterThan(0);

    await request.post("/api/v1/data/purge");
    const before = await request.get("/api/v1/transactions");
    expect((await before.json()).data).toEqual([]);

    const importRes = await request.post("/api/v1/backup/xlsx/import", {
      data: { base64: buf.toString("base64") }
    });
    expect(importRes.status()).toBe(200);
    const body = await importRes.json();
    expect(body.data.imported.transactions).toBe(1);

    const after = await request.get("/api/v1/transactions");
    const list = await after.json();
    expect(list.data).toHaveLength(1);
    expect(list.data[0].asset).toBe("ETF-RT");
    expect(list.data[0].buyValue).toBe(777);
  });

  test("JSON export download exposes user data shape", async ({ page, request }) => {
    await seedTransaction(request, { asset: "ETF-JSON" });
    await loginUi(page);
    await page.getByRole("link", { name: "settings" }).click();
    await expect(page.getByRole("heading", { name: "Backup" })).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export JSON" }).click()
    ]);
    const stream = await download.createReadStream();
    let text = "";
    for await (const chunk of stream) text += chunk;
    const parsed = JSON.parse(text);
    expect(parsed.transactions).toHaveLength(1);
    expect(parsed.transactions[0].asset).toBe("ETF-JSON");
  });
});
