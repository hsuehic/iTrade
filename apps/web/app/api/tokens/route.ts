import { getSession, auth } from '@/lib/auth';

/**
 * POST /api/tokens
 *
 * Creates an API token with user-selected permissions.
 *
 * better-auth's `apiKey.create` client endpoint blocks the `permissions` field
 * (it is server-only). We work around this by calling `auth.api.createApiKey`
 * directly from the server — without forwarding headers, which makes
 * `authRequired` falsy inside better-auth and allows `permissions` + `userId`
 * to be set freely.
 */
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    name?: string;
    permissions?: Record<string, string[]>;
    metadata?: Record<string, unknown>;
  };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { name, permissions, metadata } = body;

  if (!name?.trim()) {
    return Response.json({ error: 'Token name is required' }, { status: 400 });
  }

  try {
    // Call the server-side auth API WITHOUT headers so that `authRequired`
    // evaluates to falsy inside better-auth, bypassing the server-only
    // restriction on `permissions`. The `createApiKey` method is added by the
    // apiKey() plugin but is not reflected in the base ReturnType<betterAuth>
    // type, hence the cast.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (auth.api as any).createApiKey({
      body: {
        userId: session.user.id,
        name: name.trim(),
        ...(permissions !== undefined ? { permissions } : {}),
        ...(metadata !== undefined ? { metadata } : {}),
      },
    });

    return Response.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create token';
    console.error('[POST /api/tokens]', err);
    return Response.json({ error: message }, { status: 500 });
  }
}
