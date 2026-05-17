import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { z } from "zod";
import { stylesMapSchema } from "./types";

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

const putStylesBody = z.object({ styles: stylesMapSchema });
const putPrefsBody = z.object({ showZeroAssets: z.boolean() });
const loginBody = z.object({ email: z.string(), password: z.string() });

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
    const parsed = loginBody.safeParse(await request.json());
    if (!parsed.success) {
      return HttpResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid body" } },
        { status: 400 }
      );
    }
    if (parsed.data.password === "WrongPassword!") {
      return HttpResponse.json(
        { error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials" } },
        { status: 401 }
      );
    }
    testState.authenticated = true;
    testState.user = { id: 1, email: parsed.data.email, name: "Tester" };
    return HttpResponse.json({ data: { email: parsed.data.email, name: "Tester" } });
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
  http.put("/api/v1/assets/styles", async ({ request }) => {
    const parsed = putStylesBody.safeParse(await request.json());
    if (!parsed.success) {
      return HttpResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid styles payload" } },
        { status: 400 }
      );
    }
    testState.styles = parsed.data.styles;
    return HttpResponse.json({ data: { ok: true } });
  }),
  http.get("/api/v1/preferences", () => HttpResponse.json({ data: testState.preferences })),
  http.put("/api/v1/preferences", async ({ request }) => {
    const parsed = putPrefsBody.safeParse(await request.json());
    if (!parsed.success) {
      return HttpResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid preferences payload" } },
        { status: 400 }
      );
    }
    testState.preferences = { showZeroAssets: parsed.data.showZeroAssets, updatedAt: null };
    return HttpResponse.json({ data: { ok: true } });
  })
];

export const server = setupServer(...handlers);
