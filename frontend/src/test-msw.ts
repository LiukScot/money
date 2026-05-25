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
  transactions: Array<{ id: string } & Record<string, unknown>>;
  movements: Array<{ id: string } & Record<string, unknown>>;
  snapshots: SnapshotRow[];
  styles: Record<string, { colorHex: string | null; riskLevel: string | null }>;
  preferences: { showZeroAssets: boolean; updatedAt: string | null };
};

const putStylesBody = z.object({ styles: stylesMapSchema });
const putPrefsBody = z.object({ showZeroAssets: z.boolean() });
const loginBody = z.object({ email: z.string(), password: z.string() });
const changePasswordBody = z.object({
  currentPassword: z.string(),
  newPassword: z.string()
});

export const testState: TestState = {
  authenticated: false,
  user: { id: 1, email: "user@example.com", name: "Tester" },
  transactions: [],
  movements: [],
  snapshots: [],
  styles: {},
  preferences: { showZeroAssets: false, updatedAt: null }
};

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-msw-${idCounter}`;
}

export function resetTestState(): void {
  testState.authenticated = false;
  testState.user = { id: 1, email: "user@example.com", name: "Tester" };
  testState.transactions = [];
  testState.movements = [];
  testState.snapshots = [];
  testState.styles = {};
  testState.preferences = { showZeroAssets: false, updatedAt: null };
  idCounter = 0;
}

function jsonValidationError() {
  return HttpResponse.json(
    { error: { code: "VALIDATION_ERROR", message: "Invalid body" } },
    { status: 400 }
  );
}

function jsonNotFound(name: string) {
  return HttpResponse.json(
    { error: { code: "NOT_FOUND", message: `${name} not found` } },
    { status: 404 }
  );
}

export const handlers = [
  // ─── auth ───────────────────────────────────────────────────────────
  http.get("/api/v1/auth/session", () => {
    if (!testState.authenticated) return HttpResponse.json({ data: { authenticated: false } });
    return HttpResponse.json({ data: { authenticated: true, user: testState.user } });
  }),
  http.post("/api/v1/auth/login", async ({ request }) => {
    const parsed = loginBody.safeParse(await request.json());
    if (!parsed.success) return jsonValidationError();
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
  // Backend `/auth/register` always returns 403 SIGNUP_DISABLED. Mirror
  // that contract so frontend tests assert the same failure shape as prod.
  http.post("/api/v1/auth/register", () =>
    HttpResponse.json(
      { error: { code: "SIGNUP_DISABLED", message: "Signup is disabled" } },
      { status: 403 }
    )
  ),
  http.post("/api/v1/auth/change-password", async ({ request }) => {
    const parsed = changePasswordBody.safeParse(await request.json());
    if (!parsed.success) return jsonValidationError();
    if (parsed.data.currentPassword === "WrongPassword!") {
      return HttpResponse.json(
        { error: { code: "INVALID_CREDENTIALS", message: "Current password mismatch" } },
        { status: 401 }
      );
    }
    return HttpResponse.json({ data: { ok: true } });
  }),

  // ─── transactions ──────────────────────────────────────────────────
  http.get("/api/v1/transactions", () => HttpResponse.json({ data: testState.transactions })),
  http.post("/api/v1/transactions", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const id = nextId("tx");
    testState.transactions.push({ ...body, id });
    return HttpResponse.json({ data: { id } }, { status: 201 });
  }),
  http.put("/api/v1/transactions/:id", async ({ params, request }) => {
    const id = params.id as string;
    const idx = testState.transactions.findIndex((t) => t.id === id);
    if (idx === -1) return jsonNotFound("Transaction");
    const body = (await request.json()) as Record<string, unknown>;
    testState.transactions[idx] = { ...testState.transactions[idx], ...body, id };
    return HttpResponse.json({ data: { ok: true } });
  }),
  http.delete("/api/v1/transactions/:id", ({ params }) => {
    const id = params.id as string;
    const idx = testState.transactions.findIndex((t) => t.id === id);
    if (idx === -1) return jsonNotFound("Transaction");
    testState.transactions.splice(idx, 1);
    return HttpResponse.json({ data: { ok: true } });
  }),

  // ─── monthly-movements ─────────────────────────────────────────────
  http.get("/api/v1/monthly-movements", () => HttpResponse.json({ data: testState.movements })),
  http.post("/api/v1/monthly-movements", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const id = nextId("mm");
    testState.movements.push({ ...body, id });
    return HttpResponse.json({ data: { id } }, { status: 201 });
  }),
  http.put("/api/v1/monthly-movements/:id", async ({ params, request }) => {
    const id = params.id as string;
    const idx = testState.movements.findIndex((m) => m.id === id);
    if (idx === -1) return jsonNotFound("Movement");
    const body = (await request.json()) as Record<string, unknown>;
    testState.movements[idx] = { ...testState.movements[idx], ...body, id };
    return HttpResponse.json({ data: { ok: true } });
  }),
  http.delete("/api/v1/monthly-movements/:id", ({ params }) => {
    const id = params.id as string;
    const idx = testState.movements.findIndex((m) => m.id === id);
    if (idx === -1) return jsonNotFound("Movement");
    testState.movements.splice(idx, 1);
    return HttpResponse.json({ data: { ok: true } });
  }),

  // ─── monthly-snapshots ─────────────────────────────────────────────
  http.get("/api/v1/monthly-snapshots", () => HttpResponse.json({ data: testState.snapshots })),
  http.post("/api/v1/monthly-snapshots", async ({ request }) => {
    const body = (await request.json()) as Partial<SnapshotRow>;
    const id = nextId("snap");
    testState.snapshots.push({
      id,
      snapshotDate: body.snapshotDate ?? "",
      lowRisk: body.lowRisk ?? 0,
      mediumRisk: body.mediumRisk ?? 0,
      highRisk: body.highRisk ?? 0,
      liquid: body.liquid ?? 0
    });
    return HttpResponse.json({ data: { id } }, { status: 201 });
  }),
  http.put("/api/v1/monthly-snapshots/:id", async ({ params, request }) => {
    const id = params.id as string;
    const idx = testState.snapshots.findIndex((s) => s.id === id);
    if (idx === -1) return jsonNotFound("Snapshot");
    const body = (await request.json()) as Partial<SnapshotRow>;
    testState.snapshots[idx] = { ...testState.snapshots[idx], ...body, id };
    return HttpResponse.json({ data: { ok: true } });
  }),
  http.delete("/api/v1/monthly-snapshots/:id", ({ params }) => {
    const id = params.id as string;
    const idx = testState.snapshots.findIndex((s) => s.id === id);
    if (idx === -1) return jsonNotFound("Snapshot");
    testState.snapshots.splice(idx, 1);
    return HttpResponse.json({ data: { ok: true } });
  }),

  // ─── styles + preferences ──────────────────────────────────────────
  http.get("/api/v1/assets/styles", () => HttpResponse.json({ data: testState.styles })),
  http.put("/api/v1/assets/styles", async ({ request }) => {
    const parsed = putStylesBody.safeParse(await request.json());
    if (!parsed.success) return jsonValidationError();
    testState.styles = parsed.data.styles;
    return HttpResponse.json({ data: { ok: true } });
  }),
  http.get("/api/v1/preferences", () => HttpResponse.json({ data: testState.preferences })),
  http.put("/api/v1/preferences", async ({ request }) => {
    const parsed = putPrefsBody.safeParse(await request.json());
    if (!parsed.success) return jsonValidationError();
    testState.preferences = { showZeroAssets: parsed.data.showZeroAssets, updatedAt: null };
    return HttpResponse.json({ data: { ok: true } });
  }),

  // ─── data purge ────────────────────────────────────────────────────
  http.post("/api/v1/data/purge", () => {
    testState.transactions = [];
    testState.movements = [];
    testState.snapshots = [];
    testState.styles = {};
    testState.preferences = { showZeroAssets: false, updatedAt: null };
    return HttpResponse.json({ data: { ok: true } });
  })
];

export const server = setupServer(...handlers);
