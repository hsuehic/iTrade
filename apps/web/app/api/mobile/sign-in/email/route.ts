import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

import { auth } from '@/lib/auth';

export async function POST(req: Request) {
  const body = await req.json();
  const { idToken, provider } = body;

  const result = await auth.api.signInSocial({
    body: {
      provider,
      idToken,
    },
    headers: await headers(),
    asResponse: true,
  });

  return NextResponse.json(result, { status: 200 });
}
