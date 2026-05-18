/**
 * In-memory per-IP rate limiter for the public help-chat endpoint.
 *
 * Token-bucket style: each IP gets `LIMIT` requests per `WINDOW_MS`. The map
 * is kept in module scope so it survives within a single Node process, which
 * is enough for our deployment (one Next.js container per pod). If we scale
 * horizontally we will need to move this to Redis.
 *
 * Older entries are pruned lazily on each check, so the map cannot grow
 * unbounded in normal operation.
 */
const LIMIT = 10;
const WINDOW_MS = 60_000;

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

/** True if the request is allowed; false if the IP has exceeded the limit. */
export function checkRateLimit(ip: string): {
  allowed: boolean;
  remaining: number;
  resetMs: number;
} {
  const now = Date.now();
  const bucket = buckets.get(ip);

  // Prune expired buckets opportunistically (every ~100th call).
  if (Math.random() < 0.01) {
    for (const [key, b] of buckets) {
      if (now - b.windowStart > WINDOW_MS) buckets.delete(key);
    }
  }

  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    buckets.set(ip, { count: 1, windowStart: now });
    return { allowed: true, remaining: LIMIT - 1, resetMs: WINDOW_MS };
  }

  if (bucket.count >= LIMIT) {
    return {
      allowed: false,
      remaining: 0,
      resetMs: WINDOW_MS - (now - bucket.windowStart),
    };
  }

  bucket.count += 1;
  return {
    allowed: true,
    remaining: LIMIT - bucket.count,
    resetMs: WINDOW_MS - (now - bucket.windowStart),
  };
}

/** Best-effort extraction of the originating client IP from request headers. */
export function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}
