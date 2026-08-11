import { NextRequest, NextResponse } from 'next/server';

import { getAuthFromRequest, getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function isAdminSession(session: Awaited<ReturnType<typeof getSession>>): boolean {
  if (!session?.user) return false;
  const role = (session.user as { role?: string | null }).role;
  return role === 'admin';
}

/**
 * GET /api/admin/users — admin-only. Lists registered users for the admin
 * console / mobile admin screens.
 *
 * Wraps the Better Auth admin plugin's `listUsers` so mobile clients (and the
 * web console, if desired) get a cookie-guarded JSON API consistent with the
 * other `/api/admin/*` routes instead of calling `/api/auth/admin/*` directly.
 *
 * Query params:
 * - searchValue / searchField ('email' | 'name') / searchOperator
 *   ('contains' | 'starts_with' | 'ends_with')
 * - limit (default 100), offset (default 0)
 * - sortBy (default 'createdAt'), sortDirection ('asc' | 'desc', default 'desc')
 */
export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdminSession(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const searchValue = searchParams.get('searchValue') || undefined;
    const searchField = searchParams.get('searchField');
    const searchOperator = searchParams.get('searchOperator');
    const sortDirection = searchParams.get('sortDirection');
    const parsedLimit = Number.parseInt(searchParams.get('limit') ?? '', 10);
    const parsedOffset = Number.parseInt(searchParams.get('offset') ?? '', 10);

    const authInstance = getAuthFromRequest(request);
    const result = await (authInstance.api as any).listUsers({
      headers: request.headers,
      query: {
        searchValue,
        searchField:
          searchField === 'name' || searchField === 'email' ? searchField : undefined,
        searchOperator:
          searchOperator === 'contains' ||
          searchOperator === 'starts_with' ||
          searchOperator === 'ends_with'
            ? searchOperator
            : undefined,
        limit: Number.isFinite(parsedLimit) ? parsedLimit : 100,
        offset: Number.isFinite(parsedOffset) ? parsedOffset : 0,
        sortBy: searchParams.get('sortBy') || 'createdAt',
        sortDirection: sortDirection === 'asc' ? 'asc' : 'desc',
      },
    });

    const users = (result?.users ?? []).map(
      (user: {
        id: string;
        email?: string | null;
        name?: string | null;
        image?: string | null;
        role?: string | string[] | null;
        banned?: boolean | null;
        banReason?: string | null;
        banExpires?: Date | string | null;
        createdAt?: Date | string;
      }) => ({
        id: user.id,
        email: user.email ?? '',
        name: user.name ?? '',
        image: user.image ?? null,
        role: Array.isArray(user.role) ? user.role.join(',') : (user.role ?? 'user'),
        banned: user.banned ?? false,
        banReason: user.banReason ?? null,
        banExpires: user.banExpires ?? null,
        createdAt: user.createdAt ?? null,
      }),
    );

    return NextResponse.json({
      users,
      total: result?.total ?? users.length,
      limit: result?.limit,
      offset: result?.offset,
    });
  } catch (error) {
    console.error('[Admin Users] Failed to list users:', error);
    return NextResponse.json({ error: 'Failed to list users' }, { status: 500 });
  }
}
