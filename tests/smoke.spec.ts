import { expect, test } from "@playwright/test";

test("myMoney login smoke", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "myMoney" })).toBeVisible();

  await page.getByLabel("Email").fill("smoke@example.com");
  await page.getByLabel("Password").fill("Password123");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("button", { name: "dashboard" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});
