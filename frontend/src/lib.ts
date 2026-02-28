import { z } from "zod";

export const apiEnvelopeSchema = <T extends z.ZodTypeAny>(schema: T) => z.object({ data: schema });

export async function apiFetch<T>(
  path: string,
  options: RequestInit,
  parser: (raw: unknown) => T
): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
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

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value || 0);
}
