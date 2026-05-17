import { expect, test } from "@playwright/test";
import { loginUi, purgeUserData, seedTransaction } from "./helpers.ts";

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
