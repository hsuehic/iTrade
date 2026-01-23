import { getSession, getAuthFromRequest } from '@/lib/auth';

export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name, image } = body;

    if (!name || !name.trim()) {
      return Response.json({ error: 'Name is required' }, { status: 400 });
    }

    const trimmedName = name.trim();

    if (trimmedName.length < 2) {
      return Response.json(
        { error: 'Name must be at least 2 characters' },
        { status: 400 },
      );
    }

    if (trimmedName.length > 50) {
      return Response.json(
        { error: 'Name must be less than 50 characters' },
        { status: 400 },
      );
    }

    // Update user profile using better-auth
    const auth = getAuthFromRequest(req);
    const data = await auth.api.updateUser({
      body: {
        name: trimmedName,
        ...(image !== undefined && { image: image || null }),
      },
      headers: req.headers,
    });

    return Response.json({ success: true, ...data });
  } catch (error) {
    console.error('Error updating profile:', error);
    return Response.json(
      {
        success: false,
        error: (error as { message: string }).message || 'Failed to update profile',
      },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return Response.json({
    success: true,
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
    },
  });
}
