import { NextRequest, NextResponse } from 'next/server';

import { defaultLocale, isLocale } from './i18n/routing';
import { withAuth } from './middlewares/auth';
import { withPathHeader } from './middlewares/path-header';

const LOCALE_COOKIE = 'NEXT_LOCALE';
const LOCALE_HEADER = 'x-itrade-locale';

const STATIC_FILE_REGEX =
  /\.(js|css|json|html|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|otf|map)$/i;

const resolveLocale = (request: NextRequest) => {
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  return isLocale(cookieLocale) ? cookieLocale : defaultLocale;
};

const applyLocale = (request: NextRequest, locale: string) => {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LOCALE_HEADER, locale);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.cookies.set(LOCALE_COOKIE, locale, { path: '/' });
  return response;
};

const chain = (
  ...middlewares: Array<(req: NextRequest, res: NextResponse) => NextResponse>
) => {
  return (req: NextRequest) => {
    const pathname = req.nextUrl.pathname;

    // Skip middleware for:
    // - assetlinks
    // - API routes
    // - _next
    // - static files matching regex
    // - SEO and verification files (robots.txt, sitemap files, app-ads.txt)
    if (
      pathname.startsWith('/.well-known/') ||
      pathname.startsWith('/api/') ||
      pathname.startsWith('/_next/') ||
      pathname === '/robots.txt' ||
      pathname === '/app-ads.txt' ||
      pathname === '/sitemap.xml' ||
      pathname === '/sitemap.xml.gz' ||
      pathname === '/sitemap.txt' ||
      STATIC_FILE_REGEX.test(pathname)
    ) {
      return NextResponse.next();
    }

    const locale = resolveLocale(req);
    const response = applyLocale(req, locale);

    return middlewares.reduce((res, middleware) => middleware(req, res), response);
  };
};

export const middleware = chain(withAuth, withPathHeader);

export const config = {
  matcher: [
    '/:path*', // match all paths
  ],
};
