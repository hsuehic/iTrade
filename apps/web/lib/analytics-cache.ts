/**
 * Short-lived in-memory cache for read-heavy analytics API routes.
 * Reduces DB load when the dashboard polls multiple endpoints concurrently.
 */
const cache = new Map<string, { data: unknown; expiresAt: number }>();

const DEFAULT_TTL_MS = 15_000;

export function getAnalyticsCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setAnalyticsCached(
  key: string,
  data: unknown,
  ttlMs: number = DEFAULT_TTL_MS,
): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });

  // Prevent unbounded growth under many users
  if (cache.size > 500) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now > v.expiresAt) cache.delete(k);
    }
    // Hard cap: if still over limit after expiry cleanup, evict oldest (FIFO)
    const overage = cache.size - 400;
    if (overage > 0) {
      const keysToDelete = Array.from(cache.keys()).slice(0, overage);
      for (const k of keysToDelete) cache.delete(k);
    }
  }
}

export function analyticsCacheKey(
  route: string,
  userId: string,
  params?: Record<string, string | undefined>,
): string {
  const paramStr = params
    ? Object.entries(params)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v ?? ''}`)
        .join('&')
    : '';
  return `${route}:${userId}:${paramStr}`;
}
