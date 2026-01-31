import { NextRequest, NextResponse } from 'next/server';

export const withPathHeader = (request: NextRequest, res: NextResponse) => {
  res.headers.set('x-current-pathname', request.nextUrl.pathname);
  return res;
};
