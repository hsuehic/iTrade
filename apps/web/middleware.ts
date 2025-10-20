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
  matcher: ['/:path+'], // Specify the routes the middleware applies to
};
