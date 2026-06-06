import { z } from "zod";

export const apiEnvelopeSchema = <T extends z.ZodTypeAny>(schema: T) => z.object({ data: schema });

export const okSchema = apiEnvelopeSchema(z.object({ ok: z.boolean() }));

export async function apiFetch<T>(
  path: string,
  options: RequestInit,
  parser: (raw: unknown) => T
): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { "content-type": "application/json" } : {}),
      ...(options.headers ?? {})
    },
    ...options
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(json?.error?.message || `HTTP ${res.status}`);
  }
  return parser(json);
}

const EUR = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

export function formatCurrency(value: number) {
  return EUR.format(value || 0);
}

const SHORT_DATE = new Intl.DateTimeFormat("it-IT", { year: "numeric", month: "2-digit", day: "2-digit" });

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  return SHORT_DATE.format(new Date(ms));
}
