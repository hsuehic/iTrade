import { auth } from '@/lib/auth';

export async function DELETE(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  await auth.api.deleteUser({
    body: {
      token: session.session.token,
    },
    headers: req.headers,
  });
  await auth.api.revokeSession({
    body: {
      token: session.session.token,
    },
    headers: req.headers,
  });

  return Response.json({ success: true });
}
