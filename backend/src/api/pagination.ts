import type { Context } from "hono";

/**
 * Server-side hard cap for unbounded list endpoints. Even with no `?limit`
 * query parameter, we never return more than `DEFAULT_LIMIT` rows in a
 * single response — protects against accidental memory blow-up if a user
 * accumulates thousands of records.
 *
 * Realistic ceiling for the money app: ~12 movements/year × decades is
 * still well under 1000. 1000 default gives years of headroom while
 * making the failure mode (silent truncation) require pathological data.
 */
export const DEFAULT_LIMIT = 1000;
export const MAX_LIMIT = 5000;

export type PageBounds = {
  limit: number;
  offset: number;
};

/**
 * Parse and clamp `?limit` and `?offset` query params. Invalid or missing
 * values fall back to safe defaults. Caller passes the result straight to
 * Drizzle's `.limit()` / `.offset()`.
 */
export function readPageBounds(c: Context): PageBounds {
  const rawLimit = c.req.query("limit");
  const rawOffset = c.req.query("offset");
  const limit = clampInt(rawLimit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = clampInt(rawOffset, 0, 0, Number.MAX_SAFE_INTEGER);
  return { limit, offset };
}

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw == null) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
