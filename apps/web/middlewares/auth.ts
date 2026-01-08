import { NextRequest, NextResponse } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

export function withAuth(request: NextRequest, res: NextResponse) {
  const sessionCookie = getSessionCookie(request);
  const pathname = request.nextUrl.pathname;
  const skipPathsPattern =
    /(^\/api\/)|(^\/.well-known\/)|(^\/auth)|(^\/callbacks)|(^\/_next)|(^\/robots\.txt$)|(^\/app-ads\.txt$)|(^\/sitemap\.(xml|xml\.gz|txt)$)|((\.js|\.css|\.png|\.json|\.jpg|\.jpeg|\.svg|\.gif|\.woff|\.woff2|\.ttf|\.eot|\.otf|\.map|\.html)$)/;

  // Allow landing page for both authenticated and unauthenticated users
  const isLandingPage = pathname === '/' || pathname === '/landing';

  if (skipPathsPattern.test(pathname)) {
    return res;
  }

  // THIS IS NOT SECURE!
  // This is the recommended approach to optimistically redirect users
  // We recommend handling auth checks in each page/route
  if (!sessionCookie && !isLandingPage) {
    console.log('redirect:', pathname);
    // Preserve the original destination URL as a callback parameter
    const signInUrl = new URL('/auth/sign-in', request.url);
    signInUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(signInUrl);
  }
  return res;
}
