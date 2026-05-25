/**
 * In-memory per-IP sliding-window rate limiter.
 *
 * Designed for the single-process single-user money app. Not safe across
 * replicas — a horizontal scale-out would need Redis or similar.
 *
 * The login route uses this in front of `verifyPassword` because argon2id
 * verify is intentionally expensive (~100 ms) and would otherwise be a
 * CPU brute-force vector for unauthenticated callers.
 *
 * Memory bound: the `buckets` Map grows with the count of distinct IP
 * keys seen within `windowMs`. For this app's threat profile (single
 * user, low-traffic, behind reverse proxy) that's bounded by real
 * client variety. A high-cardinality scan attack would inflate it; if
 * the app ever ships publicly, add an eviction sweep on each check or
 * cap the Map (LRU). Tracked as a follow-up to this initial bundle.
 */

type Bucket = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export type RateLimiter = {
  check(key: string): RateLimitResult;
  /** For tests only. */
  _reset(): void;
};

export function createRateLimiter(maxAttempts: number, windowMs: number): RateLimiter {
  const buckets = new Map<string, Bucket>();

  return {
    check(key: string): RateLimitResult {
      const now = Date.now();
      const existing = buckets.get(key);
      if (!existing || existing.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, retryAfterSeconds: 0 };
      }
      if (existing.count >= maxAttempts) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
        };
      }
      existing.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    },
    _reset(): void {
      buckets.clear();
    }
  };
}
