import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export async function post(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { newPassword, currentPassword } = body;
    if (!newPassword || !currentPassword) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }
    const data = await auth.api.changePassword({
      body: {
        newPassword,
        currentPassword,
        revokeOtherSessions: true,
      },
      headers: await headers(),
    });

    return Response.json({ success: true, ...data });
  } catch (error) {
    console.error(error);
    return Response.json({
      success: false,
      message: (error as { message: string }).message,
    });
  }
}
