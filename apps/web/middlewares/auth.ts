import { NextRequest, NextResponse } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

export function withAuth(request: NextRequest, res: NextResponse) {
  const sessionCookie = getSessionCookie(request);
  const pathname = request.nextUrl.pathname;
  const skipPathsPattern =
    /(^\/api\/)|(^\/auth)|(^\/_next)|((\.js|\.css|\.png|\.jpg|\.jpeg|\.svg|\.gif|\.woff|\.woff2|\.ttf|\.eot|\.otf|\.map|\.html)$)/;
  if (skipPathsPattern.test(pathname)) {
    return res;
  }
  // THIS IS NOT SECURE!
  // This is the recommended approach to optimistically redirect users
  // We recommend handling auth checks in each page/route
  if (!sessionCookie) {
    console.log('redirect:', pathname);
    return NextResponse.redirect(new URL('/auth/sign-in', request.url));
  }
  return res;
}
