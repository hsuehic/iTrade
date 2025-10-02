// app/api/auth/csrf/route.ts
import { randomBytes } from 'crypto';

import { NextResponse } from 'next/server';

export async function GET() {
  const csrfToken = randomBytes(32).toString('hex');

  // 存入 httpOnly cookie
  const res = NextResponse.json({ csrfToken });
  res.cookies.set({
    name: 'csrfToken',
    value: csrfToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });

  return res;
}
