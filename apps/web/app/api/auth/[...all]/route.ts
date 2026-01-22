import { toNextJsHandler } from 'better-auth/next-js';

import { getAuthFromRequest } from '@/lib/auth';

export async function GET(request: Request) {
  const auth = getAuthFromRequest(request);
  return toNextJsHandler(auth).GET(request);
}

export async function POST(request: Request) {
  const auth = getAuthFromRequest(request);
  return toNextJsHandler(auth).POST(request);
}
