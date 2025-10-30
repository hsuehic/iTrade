import { NextRequest, NextResponse } from 'next/server';

import { withAuth } from './middlewares/auth';
import { withPathHeader } from './middlewares/path-header';

const chain = (
  ...middlewares: Array<(req: NextRequest, res: NextResponse) => NextResponse>
) => {
  return (req: NextRequest) => {
    return middlewares.reduce(
      (res, middleware) => middleware(req, res),
      NextResponse.next(),
    );
  };
};

export const middleware = chain(withAuth, withPathHeader);

export const config = {
  matcher: [
    // Apply middleware to all paths except:
    // - .well-known (assetlinks.json)
    // - API routes
    // - _next static files
    // - auth routes
    // - static assets: .js, .css, .json, .html, images, fonts, etc.
    '/((?!\\.well-known/|api/|_next/|auth/|.*\\.(js|css|json|html|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|otf|map)$).*)',
  ],
};
