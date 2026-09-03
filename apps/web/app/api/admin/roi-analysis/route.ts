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

/** Fetch each user's period-start balance baseline, summed per user, from the
 *  balance_<interval> bucket tables. Mirrors the dashboard source:
 *  - MtoNow  → balance_day at the close of the previous month (31 Aug for Sep)
 *  - YtoNow  → balance_day at the close of the previous year (31 Dec)
 *  Falls back to the first available (first non-zero) balance the user ever had
 *  when no row exists at-or-before the cutoff, so the baseline is never 0 for a
 *  user that actually holds funds in the period (new accounts). */
async function fetchBaselines(
  dm: Awaited<ReturnType<typeof getDataManager>>,
  interval: 'day' | 'month',
  periodStart: Date,
): Promise<Record<string, number>> {
  const balanceRepo = dm.getBalanceHistoryRepository();
  // Baseline = close value of the PREVIOUS cycle: the last balance_day row at or
  // just before the period start (e.g. for September = the 31 Aug close, NOT the
  // 1 Sep row). `periodStart - 1ms` excludes the period's own first row so a user
  // who has a record on the 1st is anchored to the prior cycle's close instead.
  const cycleCloseCutoff = new Date(periodStart.getTime() - 1);
  // Fallback (no row at/before the cutoff, e.g. a brand-new account): first
  // non-zero balance the user ever had. Bound from epoch so it finds the true
  // earliest balance rather than the first row after the cutoff.
  const fallbackStart = new Date(0);
  const baselines = await balanceRepo.getPeriodStartTotalByUser(
    interval,
    cycleCloseCutoff,
    fallbackStart,
  );
  const perUser: Record<string, number> = {};
  for (const [userId, decimal] of Object.entries(baselines)) {
    perUser[userId] = decimal.toNumber();
  }
  return perUser;
}

/** Net deposits/withdrawals for a cycle, mirroring the dashboard semantics:
 *  only COMPLETED, non-internal transfers count; DEPOSIT adds, WITHDRAW subtracts.
 *
 *  Crucial: the baseline (close of previous cycle, or first-non-zero for new
 *  users) ALREADY reflects the account's opening balance, so the opening "seed"
 *  transfer must NOT be netted again (identity: current = baseline + change +
 *  netDeposit). We therefore window netDeposits to start only AFTER the account's
 *  first-ever transfer:  windowStart = max(cycleStart, firstTransferTimestamp).
 *  Transfers at/before windowStart are part of the baseline and are excluded. */
async function fetchNetDeposits(
  dm: Awaited<ReturnType<typeof getDataManager>>,
  userId: string,
  cycleStart: Date,
  to: Date,
): Promise<number> {
  if (!dm.getTransfers) return 0;
  const all = await dm.getTransfers(userId);

  let firstTs: number | null = null;
  for (const t of all) {
    if (t.status !== 'COMPLETED') continue;
    if (t.network === 'internal') continue;
    const ts = new Date(t.timestamp).getTime();
    if (firstTs === null || ts < firstTs) firstTs = ts;
  }
  const windowStart =
    firstTs !== null ? Math.max(cycleStart.getTime(), firstTs) : cycleStart.getTime();

  let net = 0;
  const end = to.getTime();
  for (const t of all) {
    if (t.status !== 'COMPLETED') continue;
    if (t.network === 'internal') continue;
    const ts = new Date(t.timestamp).getTime();
    if (ts <= windowStart) continue; // part of the baseline / opening seed
    if (ts > end) continue;
    if (t.type === 'DEPOSIT') net += parseFloat(t.amount.toString());
    else if (t.type === 'WITHDRAW') net -= parseFloat(t.amount.toString());
  }
  return net;
}

/**
 * GET /api/admin/roi-analysis — admin-only. Returns per-user asset & ROI
 * summary for every user that has at least one active linked exchange account.
 *
 * - Live balances aggregated from `account_info` (total / available / locked).
 * - MtoNowROI / YtoNowROI read `balance_day` for the equity baseline at the
 *   CLOSE of the previous cycle (MtoNow = 31 Aug for Sep; YtoNow = 31 Dec).
 *   New accounts with no prior-cycle row fall back to their first non-zero
 *   balance as the baseline.
 * - ROI nets out deposits/withdrawals made after the account's opening (the
 *   baseline seed is NOT netted again) via netDeposits (COMPLETED, non-internal
 *   transfers), so a top-up or withdrawal doesn't masquerade as a gain:
 *       roi = (totalBalance − netDeposits − baseline) / baseline × 100
 *   This is a balance-based achieved Return on Investment (equivalent to the
 *   dashboard's balanceChange), computed once for all users at admin scale.
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

    const userRows: UserRow[] = aggregated.map((r) => {
      const total = Number(r.totalBalance);
      const available = Number(r.availableBalance);
      // Locked can't be negative and free+locked must reconcile to total equity.
      // Cross-margin futures accounts can report available > total (negative
      // locked) — clamp so free never exceeds total and locked is never negative.
      const clampedAvailable = Math.min(available, total);
      const clampedLocked = Math.max(0, total - clampedAvailable);
      return {
        userId: r.userId,
        accountCount: Number(r.accountCount),
        totalBalance: total,
        feeBalance: clampedAvailable,
        lockedBalance: clampedLocked,
        monthStartBalance: 0,
        yearStartBalance: 0,
      };
    });

    if (userRows.length === 0) {
      return NextResponse.json({ rows: [], computedAt: new Date().toISOString() });
    }

    // ── 2. Period-start baselines from balance_<interval> tables ───────────
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const monthBaselines = await fetchBaselines(dm, 'day', monthStart);
    const yearBaselines = await fetchBaselines(dm, 'day', yearStart);

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

    // ── 4. Net deposits/withdrawals within each period, per user ──────────
    const monthNet: Record<string, number> = {};
    const yearNet: Record<string, number> = {};
    for (const u of userRows) {
      try {
        monthNet[u.userId] = await fetchNetDeposits(dm, u.userId, monthStart, now);
        yearNet[u.userId] = await fetchNetDeposits(dm, u.userId, yearStart, now);
      } catch (e) {
        console.error(`[Admin ROI] Transfer fetch failed for ${u.userId}:`, e);
        monthNet[u.userId] = 0;
        yearNet[u.userId] = 0;
      }
    }

    // ── 5. Compute ROI and assemble rows ───────────────────────────────────
    // Dashboard-faithful formula: per-user ROI nets out deposits/withdrawals
    // made during the period, so a top-up doesn't masquerade as a gain.
    //   roi = (totalBalance − netDeposits − baseline) / baseline × 100
    const calculateChange = (
      current: number,
      baseline: number,
      netDeposits: number,
    ): number => {
      if (baseline <= 0) return 0; // 0 → no period-start baseline → shown as N/A in UI
      return ((current - netDeposits - baseline) / baseline) * 100;
    };

    const rows = userRows.map((u) => {
      const meta = userMeta[u.userId];
      const monthBaseline = monthBaselines[u.userId] ?? 0;
      const yearBaseline = yearBaselines[u.userId] ?? 0;
      const mNet = monthNet[u.userId] ?? 0;
      const yNet = yearNet[u.userId] ?? 0;
      // Trading PnL for the period (deposits netted out): change = current −
      // netDeposits − baseline. ROI is that change relative to the baseline.
      const mPnl = u.totalBalance - mNet - monthBaseline;
      const yPnl = u.totalBalance - yNet - yearBaseline;
      return {
        userId: u.userId,
        name: meta?.name ?? '',
        email: meta?.email ?? '',
        accountCount: u.accountCount,
        balance: u.totalBalance,
        feeBalance: u.feeBalance,
        lockedBalance: u.lockedBalance,
        mtoNowPnl: mPnl,
        mtoNowRoi: calculateChange(u.totalBalance, monthBaseline, mNet),
        mtoNowBaseline: monthBaseline,
        monthNetDeposits: mNet,
        ytoNowPnl: yPnl,
        ytoNowRoi: calculateChange(u.totalBalance, yearBaseline, yNet),
        ytoNowBaseline: yearBaseline,
        yearNetDeposits: yNet,
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
