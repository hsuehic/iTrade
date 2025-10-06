import { NextRequest, NextResponse } from 'next/server';

export const withPathHeader = (request: NextRequest, res: NextResponse) => {
  const path = request.nextUrl.pathname;
  res.headers.set('x-current-pathname', path);
  return res;
};
