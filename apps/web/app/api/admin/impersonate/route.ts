import { NextRequest, NextResponse } from 'next/server';
import { User } from '@itrade/data-manager';

import { getAuthFromRequest, getSession, getClientIp } from '@/lib/auth';
import { getDataManager } from '@/lib/data-manager';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SessionResult = Awaited<ReturnType<typeof getSession>>;

// The admin plugin's impersonateUser/stopImpersonating methods (and the
// impersonatedBy field it adds to sessions) aren't visible through the
// widened `ReturnType<typeof betterAuth>` type used for the exported auth
// instance — same reason the existing API-key fallback code above casts to
// `any`. We mirror that pattern here with an explicit result shape instead
// of leaving the cast bare everywhere it's used.
interface ImpersonationApiResult {
  headers: Headers;
  response: { user: { id: string; email: string; name?: string | null } };
}

function getImpersonatedBy(session: SessionResult): string | undefined {
  const sessionRecord = session?.session as
    | { impersonatedBy?: string | null }
    | undefined;
  return sessionRecord?.impersonatedBy ?? undefined;
}

function isAdminSession(session: SessionResult): boolean {
  if (!session?.user) return false;
  const role = (session.user as { role?: string | null }).role;
  return role === 'admin';
}

/** Forward every Set-Cookie header from a better-auth server API call onto a NextResponse. */
function forwardSetCookies(from: Headers, to: NextResponse): void {
  const getSetCookie = (from as unknown as { getSetCookie?: () => string[] })
    .getSetCookie;
  const cookies =
    typeof getSetCookie === 'function'
      ? getSetCookie.call(from)
      : [from.get('set-cookie')];

  for (const cookie of cookies) {
    if (cookie) to.headers.append('set-cookie', cookie);
  }
}

/**
 * POST /api/admin/impersonate — "Login as user".
 *
 * Admin-only. Starts a Better Auth impersonation session: the caller's
 * session cookie is swapped for one authenticated as the target user, so
 * all existing per-user pages/APIs (portfolio, strategies, orders) work
 * unmodified. The admin can act on the user's behalf; every start/stop is
 * audit-logged, and impersonating another admin account is blocked.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!isAdminSession(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const adminUser = session!.user;

    const body = await request.json().catch(() => ({}) as Record<string, unknown>);
    const targetUserId = typeof body.userId === 'string' ? body.userId.trim() : '';

    if (!targetUserId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    if (targetUserId === adminUser.id) {
      return NextResponse.json(
        { error: 'You are already signed in as this account' },
        { status: 400 },
      );
    }

    const dataManager = await getDataManager();
    const targetUser = await dataManager.dataSource
      .getRepository(User)
      .findOne({ where: { id: targetUserId } });

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Defense in depth: block admin-on-admin impersonation even though the
    // better-auth plugin itself doesn't distinguish target roles.
    if (targetUser.role === 'admin') {
      return NextResponse.json(
        { error: 'Impersonating other admin accounts is not allowed' },
        { status: 403 },
      );
    }

    const authInstance = getAuthFromRequest(request);
    const { headers, response }: ImpersonationApiResult = await (
      authInstance.api as any
    ).impersonateUser({
      body: { userId: targetUserId },
      headers: request.headers,
      returnHeaders: true,
    });

    await dataManager.createAuditLog({
      actorId: adminUser.id,
      actorEmail: adminUser.email,
      targetUserId: targetUser.id,
      targetEmail: targetUser.email,
      action: 'impersonate.start',
      ipAddress: getClientIp(request.headers),
      userAgent: request.headers.get('user-agent'),
    });

    const res = NextResponse.json({ success: true, user: response.user });
    forwardSetCookies(headers, res);
    return res;
  } catch (error) {
    console.error('[Admin Impersonate] Failed to start impersonation:', error);
    return NextResponse.json({ error: 'Failed to start impersonation' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/impersonate — exit impersonation, returning to the
 * admin's own session. Available to whoever is currently impersonating
 * (i.e. the target user's session has `impersonatedBy` set).
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession(request);
    const impersonatedBy = getImpersonatedBy(session);

    if (!session?.user || !impersonatedBy) {
      return NextResponse.json({ error: 'Not currently impersonating' }, { status: 400 });
    }

    const targetUser = session.user;

    const authInstance = getAuthFromRequest(request);
    const { headers, response }: ImpersonationApiResult = await (
      authInstance.api as any
    ).stopImpersonating({
      headers: request.headers,
      returnHeaders: true,
    });

    const dataManager = await getDataManager();
    await dataManager.createAuditLog({
      actorId: impersonatedBy,
      targetUserId: targetUser.id,
      targetEmail: targetUser.email,
      action: 'impersonate.stop',
      ipAddress: getClientIp(request.headers),
      userAgent: request.headers.get('user-agent'),
    });

    const res = NextResponse.json({ success: true, user: response.user });
    forwardSetCookies(headers, res);
    return res;
  } catch (error) {
    console.error('[Admin Impersonate] Failed to stop impersonation:', error);
    return NextResponse.json({ error: 'Failed to stop impersonation' }, { status: 500 });
  }
}
