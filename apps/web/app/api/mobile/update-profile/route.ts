import { auth } from '@/lib/auth';

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { name, image } = body;

    if (!name) {
      return Response.json({ error: 'Name is required' }, { status: 400 });
    }

    // Update user profile using better-auth
    // Note: Email changes are not allowed for security reasons
    const data = await auth.api.updateUser({
      body: {
        name,
        ...(image && { image }),
      },
      headers: req.headers,
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
