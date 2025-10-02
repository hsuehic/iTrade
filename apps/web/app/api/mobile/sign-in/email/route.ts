import { headers } from 'next/headers';

import { auth } from '@/lib/auth';

export async function POST(req: Request) {
  const body = await req.json();

  const response = await auth.api.signInEmail({
    body,
    headers: await headers(),
    asResponse: true,
  });

  return response;
}
