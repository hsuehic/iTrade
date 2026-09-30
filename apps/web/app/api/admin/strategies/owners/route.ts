import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/auth';
import { getDataManager } from '@/lib/data-manager';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function isAdminSession(session: Awaited<ReturnType<typeof getSession>>): boolean {
  if (!session?.user) return false;
  const role = (session.user as { role?: string | null }).role;
  return role === 'admin';
}

/**
 * GET /api/admin/strategies/owners — admin-only.
 *
 * The candidate list for the Strategy Management owner filter: only users that
 * have at least one ACTIVE bound exchange account (a user without one can never
 * own a runnable strategy, so offering them in the filter only yields empty
 * results). Predicate matches `/api/admin/users/exchange-stats`.
 *
 * Deliberately a dedicated endpoint rather than reusing `/api/admin/users`:
 * that route returns full Better Auth user rows (a base64 avatar per record,
 * several MB in aggregate) and exists for the admin Users page. This returns
 * only the three fields the dropdown needs, from one query.
 *
 * Response: { owners: Array<{ id: string; name: string | null; email: string | null }> }
 */
export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdminSession(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const dm = await getDataManager();
    const owners = await dm.getUsersWithExchangeAccounts();
    return NextResponse.json({ owners });
  } catch (error) {
    console.error('[Admin Strategy Owners] Failed to load owners:', error);
    return NextResponse.json({ error: 'Failed to load users' }, { status: 500 });
  }
}
