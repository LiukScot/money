import { expect, test } from "@playwright/test";
import { e2eUser, loginUi } from "./helpers.ts";

test.describe("auth flows", () => {
  test("renders money login screen at root", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "money" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("rejects wrong password with visible error", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Email").fill(e2eUser.email);
    await page.getByLabel("Password").fill("WrongPassword!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/invalid credentials/i)).toBeVisible();
  });

  test("successful login lands on dashboard", async ({ page }) => {
    await loginUi(page);
    await expect(page.getByRole("button", { name: "dashboard" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("logout returns to login screen", async ({ page }) => {
    await loginUi(page);
    await page.getByText("Account").click();
    await page.getByRole("button", { name: /log out/i }).click();
    await expect(page.getByRole("heading", { name: "money" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
  });

  test("security headers present on root response", async ({ request }) => {
    const res = await request.get("/api/v1/auth/session");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-security-policy"]).toContain("default-src 'self'");
    expect(res.headers()["referrer-policy"]).toBe("no-referrer");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
    expect(res.headers()["x-frame-options"]).toBe("DENY");
  });
});
