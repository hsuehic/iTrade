/**
 * MX record cache entry.
 * Positive results are cached for 1 hour; negatives for 5 minutes
 * (so a newly configured domain recovers quickly).
 */
interface MxCacheEntry {
  hasMx: boolean;
  expiresAt: number;
}

const MX_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour for positive
const MX_CACHE_NEGATIVE_TTL_MS = 5 * 60 * 1000; // 5 minutes for negative

const mxCache = new Map<string, MxCacheEntry>();

/**
 * Check whether the domain part of an email address has MX records.
 * Results are cached to avoid repeated DNS lookups for the same domain.
 *
 * Returns true if MX records exist, false otherwise (including DNS errors).
 */
export async function hasMxRecord(email: string): Promise<boolean> {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;

  const cached = mxCache.get(domain);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.hasMx;
  }

  try {
    const { promises: dns } = await import('dns');
    const records = await dns.resolveMx(domain);
    const hasMx = records.length > 0;

    mxCache.set(domain, {
      hasMx,
      expiresAt: now + (hasMx ? MX_CACHE_TTL_MS : MX_CACHE_NEGATIVE_TTL_MS),
    });

    if (!hasMx) {
      console.warn(`[MAILER] No MX records for domain: ${domain}`);
    }

    return hasMx;
  } catch (error) {
    // DNS resolution failed — cache as negative to avoid retry storm
    console.warn(`[MAILER] DNS lookup failed for ${domain}:`, error);
    mxCache.set(domain, {
      hasMx: false,
      expiresAt: now + MX_CACHE_NEGATIVE_TTL_MS,
    });
    return false;
  }
}
