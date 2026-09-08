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
 * GET /api/admin/users/exchange-stats — admin-only. Returns each user's
 * linked exchange-account summary (number of active accounts + total live
 * balance) so the admin Users page can render "Exchange Accounts" / "Balance"
 * columns. Users with no linked account simply won't appear in the map; the
 * client renders N/A for them.
 *
 * Response: { stats: Record<userId, { exchangeAccounts: number; balance: number }> }
 */
export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdminSession(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const dm = await getDataManager();
    const accountRepo = dm.getAccountInfoRepository();

    // Aggregate active exchange accounts grouped by user, in a single query
    // (not N+1). `userId` here is the full auth hash, same as the Better Auth
    // user id, so the client can join directly on user.id.
    const aggregated = await accountRepo
      .createQueryBuilder('a')
      .select('a."userId"', 'userId')
      .addSelect('COUNT(*)::int', 'accountCount')
      .addSelect('SUM(a."totalBalance")', 'totalBalance')
      .where('a."isActive" = true')
      .groupBy('a."userId"')
      .getRawMany<{
        userId: string;
        accountCount: string;
        totalBalance: string;
      }>();

    const stats: Record<string, { exchangeAccounts: number; balance: number | null }> =
      {};
    for (const r of aggregated) {
      // SUM() over a group of rows is NULL only when every row is NULL, which
      // is practically impossible (totalBalance has a default of 0), but guard
      // anyway so a NULL aggregate maps to the client's N/A instead of $0.00.
      const total = r.totalBalance === null ? null : Number(r.totalBalance);
      stats[r.userId] = {
        exchangeAccounts: Number(r.accountCount),
        balance: total,
      };
    }

    return NextResponse.json({ stats });
  } catch (error) {
    console.error('[Admin Users] Failed to load exchange stats:', error);
    return NextResponse.json({ error: 'Failed to load exchange stats' }, { status: 500 });
  }
}
