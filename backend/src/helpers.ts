import type { z } from "zod";

export function setSecurityHeaders(h: Headers): void {
  h.set("x-content-type-options", "nosniff");
  h.set("x-frame-options", "DENY");
  h.set("referrer-policy", "no-referrer");
  h.set(
    "content-security-policy",
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
}

export function makeError(
  code: string,
  message: string,
  status = 400,
  fields?: Record<string, string>,
  headers?: Headers
): Response {
  const h = headers ? new Headers(headers) : new Headers();
  h.set("content-type", "application/json");
  setSecurityHeaders(h);
  return new Response(JSON.stringify({ error: { code, message, fields } }), { status, headers: h });
}

export function makeData(data: unknown, status = 200, headers?: Headers): Response {
  const h = headers ? new Headers(headers) : new Headers();
  h.set("content-type", "application/json");
  setSecurityHeaders(h);
  return new Response(JSON.stringify({ data }), { status, headers: h });
}

export async function parseJson<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  const raw = await req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw makeError("VALIDATION_ERROR", "Invalid request body", 400);
  }
  return parsed.data;
}

export function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function inferType(tipo: string, buyValue: number, pnl: number): string {
  if (tipo === "nuovo vincolo") return buyValue >= 0 ? "buy" : "sell";
  if (tipo === "cedola" || tipo === "interessi" || tipo === "cashback") return pnl >= 0 ? "return" : "fee";
  if (tipo === "Variazione Valore") return pnl >= 0 ? "value-up" : "value-down";
  if (buyValue >= 0 && pnl >= 0) return "buy";
  if (buyValue >= 0 && pnl < 0) return "buy-loss";
  if (buyValue < 0 && pnl >= 0) return "sell";
  return "sell-loss";
}

type TxRow = {
  id: string;
  tx_date: string;
  asset: string;
  tipo: string;
  derived_type: string;
  buy_value: number;
  pnl: number;
  current_value: number;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type MmRow = {
  id: string;
  name: string;
  direction: string;
  amount: number;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type SnapRow = {
  id: string;
  snapshot_date: string;
  low_risk: number;
  medium_risk: number;
  high_risk: number;
  liquid: number;
  created_at: string;
  updated_at: string;
};

export function normalizeTx(row: TxRow) {
  return {
    id: row.id,
    txDate: row.tx_date,
    asset: row.asset,
    tipo: row.tipo,
    derivedType: row.derived_type,
    buyValue: Number(row.buy_value),
    pnl: Number(row.pnl),
    currentValue: Number(row.current_value),
    note: row.note ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function normalizeMm(row: MmRow) {
  return {
    id: row.id,
    name: row.name,
    direction: row.direction,
    amount: Number(row.amount),
    note: row.note ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function normalizeSnap(row: SnapRow) {
  return {
    id: row.id,
    snapshotDate: row.snapshot_date,
    lowRisk: Number(row.low_risk),
    mediumRisk: Number(row.medium_risk),
    highRisk: Number(row.high_risk),
    liquid: Number(row.liquid),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
