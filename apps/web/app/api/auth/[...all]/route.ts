import { toNextJsHandler } from 'better-auth/next-js';
import { NextResponse } from 'next/server';

import { getAuthFromRequest, getClientIp } from '@/lib/auth';
import { checkAuthRateLimit } from '@/lib/auth-rate-limit';

/**
 * Endpoints that trigger email sending and need rate limiting.
 * We match on the path after /api/auth/.
 */
const RATE_LIMITED_PATHS = [
  '/forget-password',
  '/request-password-reset',
  '/send-verification-email',
  '/sign-up/email',
];

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

/**
 * Check whether the request body contains an email field.
 * Reads and re-creates the request body (streams can only be consumed once).
 */
async function extractEmail(req: Request): Promise<{
  email: string;
  reconstructReq: () => Request;
}> {
  try {
    const body = await req.json();
    const email = typeof body?.email === 'string' ? body.email : '';
    return {
      email,
      reconstructReq: () =>
        new Request(req.url, {
          method: req.method,
          headers: req.headers,
          body: JSON.stringify(body),
        }),
    };
  } catch {
    // Body is not JSON — cannot extract email, just forward to handler
    return { email: '', reconstructReq: () => req };
  }
}

export async function GET(request: Request) {
  const auth = getAuthFromRequest(request);
  return toNextJsHandler(auth).GET(request);
}

export async function POST(request: Request) {
  const authPath = getAuthPath(request.url);

  // Apply rate limiting only to email-sending endpoints
  if (RATE_LIMITED_PATHS.some((p) => authPath === p || authPath.startsWith(p))) {
    const { email, reconstructReq } = await extractEmail(request);

    if (email) {
      const ip = getClientIp(request.headers) ?? 'unknown';
      const rl = checkAuthRateLimit(ip, email);

      if (!rl.allowed) {
        console.warn(
          `[AUTH RATE LIMIT] Blocked ${authPath} from IP=${ip} email=${email} blockedBy=${rl.blockedBy}`,
        );
        return NextResponse.json(
          { error: 'Too many requests. Please try again later.' },
          { status: 429 },
        );
      }
    }

    // Reconstruct the request since we consumed the body
    const newReq = reconstructReq();
    const authForRateLimited = getAuthFromRequest(newReq);
    return toNextJsHandler(authForRateLimited).POST(newReq);
  }

  const auth = getAuthFromRequest(request);
  return toNextJsHandler(auth).POST(request);
}
