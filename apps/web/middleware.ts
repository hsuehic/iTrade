import { NextRequest, NextResponse } from 'next/server';

import { withAuth } from './middlewares/auth';
import { withPathHeader } from './middlewares/path-header';

const STATIC_FILE_REGEX =
  /\.(js|css|json|html|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|otf|map)$/i;

const chain = (
  ...middlewares: Array<(req: NextRequest, res: NextResponse) => NextResponse>
) => {
  return (req: NextRequest) => {
    const pathname = req.nextUrl.pathname;

    // Skip middleware for:
    // - assetlinks
    // - API routes
    // - _next
    // - auth
    // - static files matching regex
    // - SEO and verification files (robots.txt, sitemap files, app-ads.txt)
    if (
      pathname.startsWith('/.well-known/') ||
      pathname.startsWith('/api/') ||
      pathname.startsWith('/_next/') ||
      pathname.startsWith('/auth/') ||
      pathname === '/robots.txt' ||
      pathname === '/app-ads.txt' ||
      pathname === '/sitemap.xml' ||
      pathname === '/sitemap.xml.gz' ||
      pathname === '/sitemap.txt' ||
      STATIC_FILE_REGEX.test(pathname)
    ) {
      return NextResponse.next();
    }

    return middlewares.reduce(
      (res, middleware) => middleware(req, res),
      NextResponse.next(),
    );
  };
};

export const middleware = chain(withAuth, withPathHeader);

export const config = {
  matcher: [
    '/:path*', // match all paths
  ],
};
