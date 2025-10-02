import { headers } from 'next/headers';

import { auth } from '@/lib/auth';

export async function POST(req: Request) {
  const body = await req.json();
  const { provider, idToken } = body;

  const result = await auth.api.signInSocial({
    body: {
      provider,
      idToken: {
        token: idToken,
      },
    },
    headers: await headers(),
    asResponse: true,
  });

  return result;
}
