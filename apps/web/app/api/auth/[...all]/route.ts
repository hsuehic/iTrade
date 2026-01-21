import { toNextJsHandler } from 'better-auth/next-js';

import { createAuth } from '@/lib/auth';

const getRequestBaseURL = (request: Request) => {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost ?? request.headers.get('host');

  if (!host) {
    return undefined;
  }

  const protocol =
    forwardedProto?.split(',')[0] ?? (host.startsWith('localhost') ? 'http' : 'https');
  const hostname = host.split(',')[0];

  return `${protocol}://${hostname}`;
};

export async function GET(request: Request) {
  const auth = createAuth(getRequestBaseURL(request));
  return toNextJsHandler(auth).GET(request);
}

export async function POST(request: Request) {
  const auth = createAuth(getRequestBaseURL(request));
  return toNextJsHandler(auth).POST(request);
}
