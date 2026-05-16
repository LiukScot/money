import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const e2eUser = {
  email: process.env.E2E_EMAIL || "smoke@example.com",
  password: process.env.E2E_PASSWORD || "Password123"
};

export function uniqueText(prefix: string): string {
  return `${prefix} ${Date.now()} ${Math.random().toString(36).slice(2, 8)}`;
}

export async function loginUi(page: Page, password = e2eUser.password): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/");
  await page.getByLabel("Email").fill(e2eUser.email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

export async function loginApi(
  request: APIRequestContext,
  password = e2eUser.password
): Promise<void> {
  const response = await request.post("/api/v1/auth/login", {
    data: { email: e2eUser.email, password }
  });
  if (!response.ok()) {
    const body = await response.text();
    expect(
      response.ok(),
      `expected API login to succeed for ${e2eUser.email}; status=${response.status()} body=${body}`
    ).toBeTruthy();
  }
}

export async function purgeUserData(
  request: APIRequestContext,
  password = e2eUser.password
): Promise<void> {
  await loginApi(request, password);
  const response = await request.post("/api/v1/data/purge");
  expect(response.ok(), "expected purge to succeed").toBeTruthy();
}

export async function seedTransaction(
  request: APIRequestContext,
  overrides: Partial<{
    txDate: string;
    asset: string;
    tipo: string;
    buyValue: number;
    pnl: number;
    note: string;
  }> = {},
  password = e2eUser.password
): Promise<{ id: string }> {
  await loginApi(request, password);
  const response = await request.post("/api/v1/transactions", {
    data: {
      txDate: "2026-05-16",
      asset: "ETF-A",
      tipo: "nuovo vincolo",
      buyValue: 1000,
      pnl: 50,
      note: uniqueText("e2e-tx"),
      ...overrides
    }
  });
  expect(response.ok(), `expected tx seed to succeed; ${response.status()}`).toBeTruthy();
  return response.json().then((b) => b.data);
}
