import { NextResponse } from 'next/server';

import { getDataManager } from '@/lib/data-manager';
import { getSession } from '@/lib/auth';

/**
 * GET /api/analytics/pnl-chart
 *
 * Returns time-series P&L data excluding the impact of deposits and withdrawals.
 *
 * P&L for period[i] = closing_balance[i] - closing_balance[i-1] - net_transfers[i]
 * where net_transfers[i] = deposits - withdrawals during period[i] (COMPLETED, non-internal)
 *
 * Query params:
 *   granularity: 'hour' | 'day' | 'month'  (default: 'day')
 *   exchange:    'all' | exchange name       (default: 'all')
 */

type Granularity = 'hour' | 'day' | 'month';

function periodKey(date: Date, granularity: Granularity): string {
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  if (granularity === 'month') return `${y}-${mo}`;
  if (granularity === 'day') return `${y}-${mo}-${d}`;
  return `${y}-${mo}-${d}T${h}:00`;
}

/** Returns the period key one step before the given key. */
function prevPeriodKey(key: string, granularity: Granularity): string {
  if (granularity === 'month') {
    const [y, mo] = key.split('-').map(Number);
    const d = new Date(Date.UTC(y, mo - 2, 1)); // subtract 1 month
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  if (granularity === 'day') {
    const d = new Date(`${key}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
  }
  // hour: key format is YYYY-MM-DDTHH:00
  const d = new Date(`${key}:00.000Z`);
  d.setUTCHours(d.getUTCHours() - 1);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  return `${y}-${mo}-${day}T${h}:00`;
}

/** ISO string for the start of a period key (used as the chart date label). */
function keyToIso(key: string, granularity: Granularity): string {
  if (granularity === 'month') return `${key}-01T00:00:00.000Z`;
  if (granularity === 'day') return `${key}T00:00:00.000Z`;
  return `${key}:00.000Z`;
}

export async function GET(request: Request) {
  try {
    const session = await getSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const granularity = (searchParams.get('granularity') || 'day') as Granularity;
    const exchange = searchParams.get('exchange') || 'all';

    if (!['hour', 'day', 'month'].includes(granularity)) {
      return NextResponse.json({ error: 'Invalid granularity' }, { status: 400 });
    }

    const dm = await getDataManager();
    const now = new Date();

    // ── Date range ────────────────────────────────────────────────────────────
    // We fetch one extra period before the window start to provide the opening
    // balance for the first P&L bar.
    const windowStart = new Date(now);
    const fetchStart = new Date(now); // one period earlier than windowStart

    if (granularity === 'hour') {
      // Last 24 hours, hourly bars
      windowStart.setUTCHours(windowStart.getUTCHours() - 23, 0, 0, 0);
      fetchStart.setUTCHours(fetchStart.getUTCHours() - 24, 0, 0, 0);
    } else if (granularity === 'day') {
      // Last 30 days, daily bars
      windowStart.setUTCDate(windowStart.getUTCDate() - 29);
      windowStart.setUTCHours(0, 0, 0, 0);
      fetchStart.setUTCDate(fetchStart.getUTCDate() - 30);
      fetchStart.setUTCHours(0, 0, 0, 0);
    } else {
      // Last 12 months, monthly bars
      windowStart.setUTCDate(1);
      windowStart.setUTCHours(0, 0, 0, 0);
      windowStart.setUTCMonth(windowStart.getUTCMonth() - 11);
      fetchStart.setUTCDate(1);
      fetchStart.setUTCHours(0, 0, 0, 0);
      fetchStart.setUTCMonth(fetchStart.getUTCMonth() - 12);
    }

    const interval = (
      granularity === 'hour' ? 'hour' : granularity === 'day' ? 'day' : 'month'
    ) as 'hour' | 'day' | 'week' | 'minute' | '5min' | 'month';

    // ── Resolve exchanges ─────────────────────────────────────────────────────
    let accounts = await dm.getUserAccountsWithBalances(userId);
    if (exchange !== 'all') {
      accounts = accounts.filter(
        (a) => a.exchange.toLowerCase() === exchange.toLowerCase(),
      );
    }
    const exchangesToQuery =
      exchange === 'all' ? [...new Set(accounts.map((a) => a.exchange))] : [exchange];

    if (exchangesToQuery.length === 0) {
      return NextResponse.json({ chartData: [], granularity });
    }

    // ── Fetch balance history & transfers in parallel ─────────────────────────
    const [historyResults, transfers] = await Promise.all([
      Promise.all(
        exchangesToQuery.map(async (ex) => ({
          exchange: ex,

          history: await dm.getBalanceTimeSeries(
            ex,
            fetchStart,
            now,
            interval as any,
            userId,
          ),
        })),
      ),
      dm.getTransfers(userId, fetchStart, now),
    ]);

    // ── Aggregate balance snapshots by (exchange, periodKey) ─────────────────
    // Each snapshot represents the closing balance for that period.
    // Multiple accounts on the same exchange are summed.
    const balByExAndPeriod: Record<string, Record<string, number>> = {};
    // ordered set of period keys
    const allPeriodKeys = new Set<string>();

    for (const { exchange: ex, history } of historyResults) {
      if (!balByExAndPeriod[ex]) balByExAndPeriod[ex] = {};
      for (const snap of history) {
        const key = periodKey(snap.timestamp, granularity);
        allPeriodKeys.add(key);
        balByExAndPeriod[ex][key] =
          (balByExAndPeriod[ex][key] ?? 0) + parseFloat(snap.balance.toString());
      }
    }

    // ── Aggregate transfers by (exchange, periodKey) ──────────────────────────
    // net_transfer > 0 means net deposit; < 0 means net withdrawal.
    const netTransferByExAndPeriod: Record<string, Record<string, number>> = {};

    for (const t of transfers) {
      if (t.status !== 'COMPLETED') continue;
      if (t.network === 'internal') continue;

      const tEx = t.exchange?.toLowerCase() ?? '';
      // Skip if filtering by a specific exchange and this transfer doesn't match
      if (exchange !== 'all' && tEx !== exchange.toLowerCase()) continue;

      const key = periodKey(t.timestamp, granularity);
      const exKey = exchange === 'all' ? '__total__' : tEx;

      if (!netTransferByExAndPeriod[exKey]) netTransferByExAndPeriod[exKey] = {};

      const amt = parseFloat(t.amount.toString());
      const delta = t.type === 'DEPOSIT' ? amt : t.type === 'WITHDRAW' ? -amt : 0;
      netTransferByExAndPeriod[exKey][key] =
        (netTransferByExAndPeriod[exKey][key] ?? 0) + delta;
    }

    // Also bucket transfers per-exchange for individual exchange breakdown
    if (exchange === 'all') {
      for (const t of transfers) {
        if (t.status !== 'COMPLETED') continue;
        if (t.network === 'internal') continue;
        const tEx = t.exchange?.toLowerCase() ?? '';
        const key = periodKey(t.timestamp, granularity);
        if (!netTransferByExAndPeriod[tEx]) netTransferByExAndPeriod[tEx] = {};
        const amt = parseFloat(t.amount.toString());
        const delta = t.type === 'DEPOSIT' ? amt : t.type === 'WITHDRAW' ? -amt : 0;
        netTransferByExAndPeriod[tEx][key] =
          (netTransferByExAndPeriod[tEx][key] ?? 0) + delta;
      }
    }

    // ── Compute total balance per period ──────────────────────────────────────
    const sortedKeys = [...allPeriodKeys].sort();

    // Only include keys within the visible window (not the extra period we
    // fetched to get the opening balance)
    const windowStartKey = periodKey(windowStart, granularity);
    const visibleKeys = sortedKeys.filter((k) => k >= windowStartKey);

    // ── Build P&L per period ──────────────────────────────────────────────────
    const chartData: Array<Record<string, number | string>> = [];

    for (let i = 0; i < visibleKeys.length; i++) {
      const key = visibleKeys[i];
      const prevKey = sortedKeys[sortedKeys.indexOf(key) - 1] ?? null;

      // Skip periods with no prior balance snapshot — the P&L would be meaningless
      // (full account value appears as profit). A synthetic reference record should
      // be inserted for the period immediately before the first real data period so
      // that period shows correctly while this one is still skipped.
      if (prevKey === null) continue;

      const point: Record<string, number | string> = {
        date: keyToIso(key, granularity),
      };

      let totalPnl = 0;

      for (const ex of exchangesToQuery) {
        const closingBal = balByExAndPeriod[ex]?.[key] ?? 0;
        const openingBal = balByExAndPeriod[ex]?.[prevKey] ?? 0;
        const netTransfer = netTransferByExAndPeriod[ex.toLowerCase()]?.[key] ?? 0;

        const exPnl = closingBal - openingBal - netTransfer;
        point[ex.toLowerCase()] = Math.round(exPnl * 100) / 100;
        totalPnl += exPnl;
      }

      point['total'] = Math.round(totalPnl * 100) / 100;
      chartData.push(point);
    }

    return NextResponse.json({ chartData, granularity });
  } catch (error) {
    console.error('PnL chart error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch P&L chart data' },
      { status: 500 },
    );
  }
}
