import { getSession, getAuthFromRequest } from '@/lib/auth';

export async function DELETE(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const auth = getAuthFromRequest(req);
    await auth.api.deleteUser({
      headers: req.headers,
      body: {},
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error(error);
    return Response.json({
      success: false,
      message: (error as { message: string }).message,
    });
  }
}
