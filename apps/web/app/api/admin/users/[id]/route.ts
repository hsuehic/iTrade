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
 * PATCH /api/admin/users/[id] — admin-only. Updates a user's role and/or ban
 * status via the Better Auth admin plugin.
 *
 * Body:
 * - role?: 'admin' | 'user' — promote/demote
 * - banned?: boolean — ban (optionally with `banReason`) or unban
 *
 * Guards beyond the admin-session check:
 * - You cannot demote or ban your own account (avoids console lockout).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession(request);
  if (!isAdminSession(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const adminUser = session!.user as { id: string };

  const { id } = await params;
  const targetUserId = id?.trim();
  if (!targetUserId) {
    return NextResponse.json({ error: 'user id is required' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}) as Record<string, unknown>);
  const role = typeof body.role === 'string' ? body.role : undefined;
  const banned = typeof body.banned === 'boolean' ? body.banned : undefined;
  const banReason = typeof body.banReason === 'string' ? body.banReason : undefined;

  if (role === undefined && banned === undefined) {
    return NextResponse.json(
      { error: 'Nothing to update: provide role and/or banned' },
      { status: 400 },
    );
  }

  if (role !== undefined && role !== 'admin' && role !== 'user') {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  // Self-guard: never let an admin lock themselves out of the console.
  if (targetUserId === adminUser.id && (role === 'user' || banned === true)) {
    return NextResponse.json(
      { error: 'You cannot demote or ban your own account' },
      { status: 400 },
    );
  }

  try {
    const authInstance = getAuthFromRequest(request);

    if (role !== undefined) {
      await (authInstance.api as any).setRole({
        body: { userId: targetUserId, role },
        headers: request.headers,
      });
    }

    if (banned !== undefined) {
      if (banned) {
        await (authInstance.api as any).banUser({
          body: {
            userId: targetUserId,
            ...(banReason !== undefined ? { banReason } : {}),
          },
          headers: request.headers,
        });
      } else {
        await (authInstance.api as any).unbanUser({
          body: { userId: targetUserId },
          headers: request.headers,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Admin Users] Failed to update user:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}
