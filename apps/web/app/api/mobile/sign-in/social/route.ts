import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

import { auth } from '@/lib/auth';

export async function POST(req: Request) {
  const body = await req.json();
  const { email, password } = body;

  const result = await auth.api.signInEmail({
    body: {
      email,
      password,
      rememberMe: true,
    },
    headers: await headers(),
    asResponse: true,
  });

  return NextResponse.json(result, { status: 200 });
}
