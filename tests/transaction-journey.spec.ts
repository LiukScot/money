import { expect, test } from "@playwright/test";
import { loginUi, purgeUserData } from "./helpers.ts";

test.describe("transaction journey", () => {
  test.beforeEach(async ({ request }) => {
    await purgeUserData(request);
  });

  test("add a transaction → dashboard reflects new totals", async ({ page }) => {
    await loginUi(page);

    await page.getByRole("link", { name: "transactions" }).click();
    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();

    await page.getByLabel("Date").fill("2026-05-16");
    await page.getByLabel("Asset").fill("ETF-A");
    await page.getByLabel("Tipo").click();
    await page.getByRole("option", { name: "nuovo vincolo" }).click();
    await page.getByLabel("Buy value").fill("1000");
    await page.getByRole("button", { name: "Add" }).click();

    await expect(page.getByRole("cell", { name: "ETF-A" })).toBeVisible();

    await page.getByRole("link", { name: "dashboard" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    const txCard = page.getByRole("heading", { name: "Transactions" }).locator("..");
    await expect(txCard).toContainText("1");
  });

  test("delete a transaction → row disappears", async ({ page }) => {
    await loginUi(page);
    await page.getByRole("link", { name: "transactions" }).click();
    await page.getByLabel("Date").fill("2026-05-16");
    await page.getByLabel("Asset").fill("ETF-DEL");
    await page.getByLabel("Tipo").click();
    await page.getByRole("option", { name: "nuovo vincolo" }).click();
    await page.getByLabel("Buy value").fill("500");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByRole("cell", { name: "ETF-DEL" })).toBeVisible();

    await page
      .getByRole("row")
      .filter({ hasText: "ETF-DEL" })
      .getByRole("button", { name: "Delete" })
      .click();

    await expect(page.getByRole("cell", { name: "ETF-DEL" })).toHaveCount(0);
  });
});
