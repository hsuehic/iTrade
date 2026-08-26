import { toNextJsHandler } from 'better-auth/next-js';
import { NextResponse } from 'next/server';

import { getAuthFromRequest, getClientIp } from '@/lib/auth';
import { checkAuthRateLimit } from '@/lib/auth-rate-limit';

/**
 * Endpoints that trigger email sending and need rate limiting.
 * Exact match only — no startsWith to prevent over-matching.
 */
const RATE_LIMITED_PATHS = new Set([
  '/forget-password',
  '/request-password-reset',
  '/send-verification-email',
  '/sign-up/email',
]);

/** Mask email for PII-safe logging: ab***@example.com */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const maskedLocal = local.length > 2 ? local.slice(0, 2) + '***' : '***';
  return `${maskedLocal}@${domain}`;
}

/** Sanitize control characters from string for safe logging. */
function sanitizeForLog(s: string): string {
  return s.replace(/[\r\n\t]/g, '').slice(0, 200);
}

/**
 * Extract the auth endpoint path from the request URL.
 * e.g. /api/auth/sign-up/email -> /sign-up/email
 */
function getAuthPath(url: string): string {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/^\/api\/auth(.+)$/);
    return match ? match[1] : '';
  } catch {
    return '';
  }
}

export async function GET(request: Request) {
  const auth = getAuthFromRequest(request);
  return toNextJsHandler(auth).GET(request);
}

export async function POST(request: Request) {
  const authPath = getAuthPath(request.url);

  // Apply rate limiting only to email-sending endpoints (exact match)
  if (RATE_LIMITED_PATHS.has(authPath)) {
    // Clone the request so we can read the body without consuming the original stream.
    // This preserves the original content-type and body for the downstream handler.
    const cloned = request.clone();
    let email = '';

    try {
      const body = await cloned.json();
      email = typeof body?.email === 'string' ? body.email : '';
    } catch {
      // Body is not JSON — no email to extract
    }

    // Always apply IP-based rate limiting, even without email.
    // This prevents attackers from bypassing rate limits by omitting the email field.
    const ip = getClientIp(request.headers) ?? 'unknown';
    const rl = checkAuthRateLimit(ip, email || '__no_email__');

    if (!rl.allowed) {
      const maskedEmail = email ? maskEmail(email) : '(none)';
      console.warn(
        `[AUTH RATE LIMIT] Blocked ${sanitizeForLog(authPath)} from IP=${sanitizeForLog(ip)} email=${maskedEmail} blockedBy=${rl.blockedBy}`,
      );
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 },
      );
    }

    // Forward the original (unconsumed) request to Better Auth
    const auth = getAuthFromRequest(request);
    return toNextJsHandler(auth).POST(request);
  }

  const auth = getAuthFromRequest(request);
  return toNextJsHandler(auth).POST(request);
}
