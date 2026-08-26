/**
 * In-memory rate limiter for auth endpoints (password reset, email verification, etc.).
 *
 * Prevents abuse of email-sending endpoints by limiting requests per IP and per email.
 * - Per IP: max 5 requests per 15 minutes
 * - Per email: max 3 requests per 15 minutes
 *
 * Map is kept in module scope (single Node process per pod).
 * Move to Redis if we scale horizontally.
 */

const IP_LIMIT = 5;
const EMAIL_LIMIT = 3;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

interface Bucket {
  count: number;
  windowStart: number;
}

const ipBuckets = new Map<string, Bucket>();
const emailBuckets = new Map<string, Bucket>();

/** Prune expired buckets opportunistically. */
function pruneExpired(map: Map<string, Bucket>) {
  const now = Date.now();
  for (const [key, b] of map) {
    if (now - b.windowStart > WINDOW_MS) map.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  /** Which limiter blocked the request, if any. */
  blockedBy?: 'ip' | 'email';
  remaining: number;
  resetMs: number;
}

/**
 * Check rate limits for an auth email-sending request.
 * Both IP and email limits must pass.
 */
export function checkAuthRateLimit(ip: string, email: string): RateLimitResult {
  const now = Date.now();

  // Prune expired buckets (~1% of calls)
  if (Math.random() < 0.01) {
    pruneExpired(ipBuckets);
    pruneExpired(emailBuckets);
  }

  // --- IP limit ---
  const ipBucket = ipBuckets.get(ip);
  if (!ipBucket || now - ipBucket.windowStart > WINDOW_MS) {
    ipBuckets.set(ip, { count: 1, windowStart: now });
  } else {
    if (ipBucket.count >= IP_LIMIT) {
      return {
        allowed: false,
        blockedBy: 'ip',
        remaining: 0,
        resetMs: WINDOW_MS - (now - ipBucket.windowStart),
      };
    }
    ipBucket.count++;
  }

  // --- Email limit ---
  const emailKey = email.toLowerCase();
  const emailBucket = emailBuckets.get(emailKey);
  if (!emailBucket || now - emailBucket.windowStart > WINDOW_MS) {
    emailBuckets.set(emailKey, { count: 1, windowStart: now });
  } else {
    if (emailBucket.count >= EMAIL_LIMIT) {
      return {
        allowed: false,
        blockedBy: 'email',
        remaining: 0,
        resetMs: WINDOW_MS - (now - emailBucket.windowStart),
      };
    }
    emailBucket.count++;
  }

  const ipRemaining = IP_LIMIT - (ipBuckets.get(ip)?.count ?? 0);
  const emailRemaining = EMAIL_LIMIT - (emailBuckets.get(emailKey)?.count ?? 0);

  return {
    allowed: true,
    remaining: Math.min(ipRemaining, emailRemaining),
    resetMs: WINDOW_MS,
  };
}
