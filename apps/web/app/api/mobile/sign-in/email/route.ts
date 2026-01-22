import { cookies, headers } from 'next/headers';

import { getAuthFromRequest } from '@/lib/auth';

export async function POST(req: Request) {
  const body = await req.json();
  const headersList = await headers();
  const cookiesList = await cookies();
  // 从 header 获取 CSRF token
  const csrfHeader = headersList.get('x-csrf-token');
  const csrfCookie = cookiesList.get('csrfToken')?.value;

  if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
    return new Response(JSON.stringify({ error: 'Invalid CSRF token' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  // onl
  cookiesList.delete('csrfToken');

  const auth = getAuthFromRequest(req);
  const response = await auth.api.signInEmail({
    body,
    headers: headersList,
    asResponse: true,
  });

  return response;
}
