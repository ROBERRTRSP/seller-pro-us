/**
 * In-memory login throttling (per process). For multi-instance production, use Redis or a WAF.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED = 25;

type Bucket = { fails: number; windowStart: number };

const buckets = new Map<string, Bucket>();

function prune(now: number) {
  if (buckets.size < 500) return;
  for (const [k, b] of buckets) {
    if (now - b.windowStart > WINDOW_MS) buckets.delete(k);
  }
}

export function loginRateLimitKey(req: Request, email: string): string {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  return `${ip}:${email.toLowerCase()}`;
}

export function isLoginBlocked(key: string): { blocked: boolean; retryAfterSec: number } {
  const now = Date.now();
  prune(now);
  const b = buckets.get(key);
  if (!b) return { blocked: false, retryAfterSec: 0 };
  if (now - b.windowStart > WINDOW_MS) {
    buckets.delete(key);
    return { blocked: false, retryAfterSec: 0 };
  }
  if (b.fails > MAX_FAILED) {
    const retryAfterSec = Math.max(1, Math.ceil((b.windowStart + WINDOW_MS - now) / 1000));
    return { blocked: true, retryAfterSec };
  }
  return { blocked: false, retryAfterSec: 0 };
}

/** Call when login failed (wrong password or unknown user). */
export function recordLoginFailure(key: string): { blocked: boolean; retryAfterSec: number } {
  const now = Date.now();
  prune(now);
  let b = buckets.get(key);
  if (!b || now - b.windowStart > WINDOW_MS) {
    b = { fails: 1, windowStart: now };
    buckets.set(key, b);
    return { blocked: false, retryAfterSec: 0 };
  }
  b.fails += 1;
  if (b.fails > MAX_FAILED) {
    const retryAfterSec = Math.max(1, Math.ceil((b.windowStart + WINDOW_MS - now) / 1000));
    return { blocked: true, retryAfterSec };
  }
  return { blocked: false, retryAfterSec: 0 };
}

export function clearLoginFailures(key: string) {
  buckets.delete(key);
}
