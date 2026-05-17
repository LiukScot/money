import { expect, test } from "@playwright/test";
import { loginApi, loginUi, purgeUserData, seedTransaction } from "./helpers.ts";

test.describe("restored dashboard (issue #39)", () => {
  test.beforeEach(async ({ request }) => {
    await purgeUserData(request);
  });

  test("KPI cards include last transaction date after seeding a tx", async ({ page, request }) => {
    await seedTransaction(request, { asset: "ETF-A", buyValue: 1000, pnl: 25, txDate: "2026-05-10" });
    await loginUi(page);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByTestId("kpi-last-tx-date")).toHaveText("2026-05-10");
  });

  test("asset blocks expose color picker and risk pill", async ({ page, request }) => {
    await seedTransaction(request, { asset: "ETF-RB", buyValue: 1000, pnl: 50 });
    await loginUi(page);
    const block = page.getByTestId("asset-block-ETF-RB");
    await expect(block).toBeVisible();
    await expect(block.getByLabel("Color for ETF-RB")).toBeVisible();
    const pill = block.getByRole("button", { name: /Risk level for ETF-RB/ });
    await expect(pill).toContainText("risk: —");
    await pill.click();
    await expect(pill).toContainText("risk: low");
  });

  test("quick liquidity creates today's snapshot and overwrites on resubmit", async ({
    page,
    request
  }) => {
    await seedTransaction(request, { asset: "ETF-A", buyValue: 1000, pnl: 0 });
    await loginUi(page);

    await page.getByTestId("quick-liquidity-input").fill("250");
    await page.getByTestId("quick-liquidity-submit").click();
    await expect(page.getByTestId("quick-liquidity-success")).toBeVisible();

    await loginApi(request);
    const list1 = await request.get("/api/v1/monthly-snapshots");
    const today = new Date().toISOString().slice(0, 10);
    const data1 = (await list1.json()).data as Array<{ snapshotDate: string; liquid: number }>;
    const todays1 = data1.filter((s) => s.snapshotDate === today);
    expect(todays1).toHaveLength(1);
    expect(todays1[0]?.liquid).toBe(250);

    await page.getByTestId("quick-liquidity-input").fill("999");
    await page.getByTestId("quick-liquidity-submit").click();
    await expect(page.getByTestId("quick-liquidity-success")).toBeVisible();

    const list2 = await request.get("/api/v1/monthly-snapshots");
    const data2 = (await list2.json()).data as Array<{ snapshotDate: string; liquid: number }>;
    const todays2 = data2.filter((s) => s.snapshotDate === today);
    expect(todays2).toHaveLength(1);
    expect(todays2[0]?.liquid).toBe(999);
  });

  test("monthly review range filter switches summary count", async ({ page, request }) => {
    await loginApi(request);
    for (const date of ["2020-01-01", "2024-06-01", "2026-05-01"]) {
      const res = await request.post("/api/v1/monthly-snapshots", {
        data: { snapshotDate: date, lowRisk: 100, mediumRisk: 100, highRisk: 100, liquid: 100 }
      });
      expect(res.ok()).toBeTruthy();
    }
    await loginUi(page);
    const summary = page.getByTestId("monthly-review-summary");
    await page.getByRole("button", { name: /3 months/ }).click();
    await expect(summary).toContainText(/0 snapshot/);
    await page.getByRole("button", { name: /3 years/ }).click();
    await expect(summary).toContainText(/1 snapshot/);
    await page.getByRole("button", { name: /since beginning/i }).click();
    await expect(summary).toContainText(/3 snapshots/);
  });

  test("show zero-value toggle persists across reload", async ({ page, request }) => {
    await seedTransaction(request, { asset: "ETF-A", buyValue: 0, pnl: 0 });
    await loginUi(page);
    await expect(page.getByTestId("asset-blocks-empty")).toBeVisible();
    await page.getByLabel("Show zero-value assets").check();
    await expect(page.getByTestId("asset-block-ETF-A")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("asset-block-ETF-A")).toBeVisible();
  });
});
