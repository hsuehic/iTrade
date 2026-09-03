import { NextRequest, NextResponse } from 'next/server';

import { getAuthFromRequest, getSession } from '@/lib/auth';
import { getDataManager } from '@/lib/data-manager';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function isAdminSession(session: Awaited<ReturnType<typeof getSession>>): boolean {
  if (!session?.user) return false;
  const role = (session.user as { role?: string | null }).role;
  return role === 'admin';
}

interface UserRow {
  userId: string;
  accountCount: number;
  totalBalance: number;
  feeBalance: number; // available / free balance
  lockedBalance: number;
  monthStartBalance: number;
  yearStartBalance: number;
}

/** Fetch each user's latest balance at-or-before the cutoff, summed per user.
 *  Uses the balance_<interval> bucket tables (matching the dashboard's source):
 *  - overDay → 'day' table for the month-start baseline
 *  - overMonth → 'month' table for the year-start baseline */
async function fetchBaselines(
  dm: Awaited<ReturnType<typeof getDataManager>>,
  interval: 'day' | 'month',
  cutoff: Date,
): Promise<Record<string, number>> {
  const balanceRepo = dm.getBalanceHistoryRepository();
  const baselines = await balanceRepo.getPeriodStartTotalByUser(interval, cutoff);
  const perUser: Record<string, number> = {};
  for (const [userId, decimal] of Object.entries(baselines)) {
    perUser[userId] = decimal.toNumber();
  }
  return perUser;
}

/**
 * GET /api/admin/roi-analysis — admin-only. Returns per-user asset & ROI
 * summary for every user that has at least one active linked exchange account.
 *
 * - Live balances aggregated from `account_info` (total / available / locked).
 * - MtoNowROI / YtoNowROI use the balance_<interval> bucket tables for the
 *   period-start equity baseline (matching the dashboard's source): MtoNowROI
 *   reads `balance_day` at-or-before month start; YtoNowROI reads
 *   `balance_month` at-or-before year start.
 * - Note: this is a balance-based ROI (no net-deposit adjustment), computed
 *   once for all users at admin scale.
 */
export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdminSession(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const dm = await getDataManager();

    // ── 1. Aggregate live balances from account_info, grouped by user ──────
    const accountRepo = dm.getAccountInfoRepository();
    const aggregated = await accountRepo
      .createQueryBuilder('a')
      .select('a."userId"', 'userId')
      .addSelect('COUNT(*)::int', 'accountCount')
      .addSelect('SUM(a."totalBalance")', 'totalBalance')
      .addSelect('SUM(a."availableBalance")', 'availableBalance')
      .addSelect('SUM(a."lockedBalance")', 'lockedBalance')
      .where('a."isActive" = true')
      .groupBy('a."userId"')
      .getRawMany<{
        userId: string;
        accountCount: string;
        totalBalance: string;
        availableBalance: string;
        lockedBalance: string;
      }>();

    const userRows: UserRow[] = aggregated.map((r) => ({
      userId: r.userId,
      accountCount: Number(r.accountCount),
      totalBalance: Number(r.totalBalance),
      feeBalance: Number(r.availableBalance),
      lockedBalance: Number(r.lockedBalance),
      monthStartBalance: 0,
      yearStartBalance: 0,
    }));

    if (userRows.length === 0) {
      return NextResponse.json({ rows: [], computedAt: new Date().toISOString() });
    }

    // ── 2. Period-start baselines from balance_<interval> tables ───────────
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const monthBaselines = await fetchBaselines(dm, 'day', monthStart);
    const yearBaselines = await fetchBaselines(dm, 'month', yearStart);

    for (const u of userRows) {
      u.monthStartBalance = monthBaselines[u.userId] ?? 0;
      u.yearStartBalance = yearBaselines[u.userId] ?? 0;
    }

    // ── 3. Map userId → name/email via auth users ──────────────────────────
    const authInstance = getAuthFromRequest(request);
    let userMeta: Record<
      string,
      { name: string; email: string; createdAt: Date | null }
    > = {};
    try {
      const result = await (authInstance.api as any).listUsers({
        headers: request.headers,
        query: { limit: 100000 },
      });
      for (const u of result?.users ?? []) {
        userMeta[u.id] = {
          name: u.name ?? '',
          email: u.email ?? '',
          createdAt: u.createdAt ?? null,
        };
      }
    } catch (e) {
      console.error('[Admin ROI] Failed to load user metadata:', e);
      userMeta = {};
    }

    // ── 4. Compute ROI and assemble rows ───────────────────────────────────
    const calculateChange = (current: number, baseline: number): number => {
      if (baseline <= 0) return 0; // 0 → no period-start baseline available → shown as N/A in UI
      return ((current - baseline) / baseline) * 100;
    };

    const rows = userRows.map((u) => {
      const meta = userMeta[u.userId];
      const monthBaseline = monthBaselines[u.userId] ?? 0;
      const yearBaseline = yearBaselines[u.userId] ?? 0;
      return {
        userId: u.userId,
        name: meta?.name ?? '',
        email: meta?.email ?? '',
        accountCount: u.accountCount,
        balance: u.totalBalance,
        feeBalance: u.feeBalance,
        lockedBalance: u.lockedBalance,
        mtoNowRoi: calculateChange(u.totalBalance, monthBaseline),
        mtoNowBaseline: monthBaseline,
        ytoNowRoi: calculateChange(u.totalBalance, yearBaseline),
        ytoNowBaseline: yearBaseline,
        createdAt: meta?.createdAt ?? null,
      };
    });

    rows.sort((a, b) => b.balance - a.balance);

    return NextResponse.json({
      rows,
      computedAt: now.toISOString(),
      monthStart: monthStart.toISOString(),
      yearStart: yearStart.toISOString(),
    });
  } catch (error) {
    console.error('[Admin ROI Analysis] Failed to build ROI summary:', error);
    return NextResponse.json({ error: 'Failed to build ROI summary' }, { status: 500 });
  }
}
