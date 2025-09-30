import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { allowedOrigins } from './constant';

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin') ?? '';
  const isAllowed = allowedOrigins.includes(origin);

  if (request.method === 'OPTIONS') {
    const preflight = new NextResponse(null, { status: 204 });
    if (isAllowed) {
      preflight.headers.set('Access-Control-Allow-Origin', origin);
    }
    preflight.headers.set(
      'Access-Control-Allow-Methods',
      'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    );
    preflight.headers.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization'
    );
    preflight.headers.set('Access-Control-Max-Age', '86400');
    return preflight;
  }

  const response = NextResponse.next();
  if (isAllowed) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Vary', 'Origin');
  }
  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
