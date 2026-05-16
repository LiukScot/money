import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

type TestState = {
  authenticated: boolean;
  user: { id: number; email: string; name: string | null };
  transactions: unknown[];
  movements: unknown[];
  snapshots: unknown[];
  styles: Record<string, { colorHex: string | null; riskLevel: string | null }>;
  preferences: { showZeroAssets: boolean; updatedAt: string | null };
};

export const testState: TestState = {
  authenticated: false,
  user: { id: 1, email: "user@example.com", name: "Tester" },
  transactions: [],
  movements: [],
  snapshots: [],
  styles: {},
  preferences: { showZeroAssets: false, updatedAt: null }
};

export function resetTestState(): void {
  testState.authenticated = false;
  testState.transactions = [];
  testState.movements = [];
  testState.snapshots = [];
  testState.styles = {};
  testState.preferences = { showZeroAssets: false, updatedAt: null };
}

export const handlers = [
  http.get("/api/v1/auth/session", () => {
    if (!testState.authenticated) return HttpResponse.json({ data: { authenticated: false } });
    return HttpResponse.json({ data: { authenticated: true, user: testState.user } });
  }),
  http.post("/api/v1/auth/login", async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };
    if (body.password === "WrongPassword!") {
      return HttpResponse.json(
        { error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials" } },
        { status: 401 }
      );
    }
    testState.authenticated = true;
    testState.user = { id: 1, email: body.email, name: "Tester" };
    return HttpResponse.json({ data: { email: body.email, name: "Tester" } });
  }),
  http.post("/api/v1/auth/logout", () => {
    testState.authenticated = false;
    return HttpResponse.json({ data: { ok: true } });
  }),
  http.get("/api/v1/transactions", () => HttpResponse.json({ data: testState.transactions })),
  http.post("/api/v1/transactions", () => HttpResponse.json({ data: { id: "tx-stub" } }, { status: 201 })),
  http.get("/api/v1/monthly-movements", () => HttpResponse.json({ data: testState.movements })),
  http.get("/api/v1/monthly-snapshots", () => HttpResponse.json({ data: testState.snapshots })),
  http.get("/api/v1/assets/styles", () => HttpResponse.json({ data: testState.styles })),
  http.get("/api/v1/preferences", () => HttpResponse.json({ data: testState.preferences }))
];

export const server = setupServer(...handlers);
