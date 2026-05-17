import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

type SnapshotRow = {
  id: string;
  snapshotDate: string;
  lowRisk: number;
  mediumRisk: number;
  highRisk: number;
  liquid: number;
};

type TestState = {
  authenticated: boolean;
  user: { id: number; email: string; name: string | null };
  transactions: unknown[];
  movements: unknown[];
  snapshots: SnapshotRow[];
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
  http.post("/api/v1/monthly-snapshots/quick", async ({ request }) => {
    const body = (await request.json()) as {
      lowRisk?: number;
      mediumRisk?: number;
      highRisk?: number;
      liquid?: number;
    };
    const today = new Date().toISOString().slice(0, 10);
    const next = testState.snapshots.filter((s) => s.snapshotDate !== today);
    const id = `snap-${Math.random().toString(36).slice(2)}`;
    next.push({
      id,
      snapshotDate: today,
      lowRisk: Number(body.lowRisk ?? 0),
      mediumRisk: Number(body.mediumRisk ?? 0),
      highRisk: Number(body.highRisk ?? 0),
      liquid: Number(body.liquid ?? 0)
    });
    testState.snapshots = next;
    return HttpResponse.json({ data: { id, snapshotDate: today } }, { status: 201 });
  }),
  http.get("/api/v1/assets/styles", () => HttpResponse.json({ data: testState.styles })),
  http.put("/api/v1/assets/styles", async ({ request }) => {
    const body = (await request.json()) as { styles: TestState["styles"] };
    testState.styles = body.styles ?? {};
    return HttpResponse.json({ data: { ok: true } });
  }),
  http.get("/api/v1/preferences", () => HttpResponse.json({ data: testState.preferences })),
  http.put("/api/v1/preferences", async ({ request }) => {
    const body = (await request.json()) as { showZeroAssets: boolean };
    testState.preferences = { showZeroAssets: Boolean(body.showZeroAssets), updatedAt: null };
    return HttpResponse.json({ data: { ok: true } });
  })
];

export const server = setupServer(...handlers);
