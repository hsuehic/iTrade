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

    // Avatar must be a plain http(s) URL.
    //
    // `user.image` is serialized inline by better-auth on every
    // /api/auth/get-session call and by /api/auth/admin/list-users, so whatever
    // is stored here is shipped to the client on practically every page load.
    // Accepting a `data:` URL let a 3.3 MB base64 avatar into the row, which
    // turned those endpoints into multi-megabyte responses (nginx spilled them
    // to disk and the whole app felt slow). Store a URL and let the browser
    // cache the image instead.
    if (image !== undefined && image !== null && image !== '') {
      if (typeof image !== 'string') {
        return Response.json({ error: 'Avatar must be a URL string' }, { status: 400 });
      }
      if (image.startsWith('data:')) {
        return Response.json(
          {
            error:
              'Inline (data:) avatars are not supported — please provide an image URL',
          },
          { status: 400 },
        );
      }
      // Allow either an external http(s) URL or an avatar we stored ourselves
      // via POST /api/settings/avatar (which writes the file to the uploads
      // volume and returns a /api/avatars/... URL).
      const isOwnAvatar = /^\/api\/avatars\/[0-9a-f]{16}-[0-9a-f]{12}\.webp$/.test(image);
      if (!isOwnAvatar && !/^https?:\/\//i.test(image)) {
        return Response.json(
          { error: 'Avatar URL must start with http:// or https://' },
          { status: 400 },
        );
      }
      if (image.length > 2048) {
        return Response.json(
          { error: 'Avatar URL is too long (max 2048 characters)' },
          { status: 400 },
        );
      }
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
