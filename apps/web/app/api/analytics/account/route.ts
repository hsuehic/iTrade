import { NextResponse } from 'next/server';

import { getDataManager } from '@/lib/data-manager';
import { getSession } from '@/lib/auth';

// Transform historical data for chart
export interface ChartDataPoint {
  date: string;
  [exchange: string]: string | number; // exchange names as keys with balance values
}

interface BalanceHistoryPoint {
  timestamp: Date;
  balance: { toString(): string };
  free: { toString(): string };
  locked: { toString(): string };
  createdAt?: Date;
  accountId?: number;
}

/**
 * GET /api/analytics/account - 获取账户分析数据
 *
 * Query params:
 * - exchange?: string - 交易所名称
 * - period?: '7d' | '30d' | '90d' - 时间周期 (ignored when startDate/endDate provided)
 * - startDate?: string - ISO date string e.g. "2026-04-01" (arbitrary window start)
 * - endDate?: string   - ISO date string e.g. "2026-04-30" (arbitrary window end, inclusive)
 */

/** Pick chart granularity based on window length in milliseconds. */
function intervalForRange(rangeMs: number): 'minute' | '5min' | 'hour' | 'day' {
  const hours = rangeMs / (1000 * 60 * 60);
  if (hours <= 2) return 'minute';
  if (hours <= 72) return '5min';
  if (hours <= 14 * 24) return 'hour';
  return 'day';
}

function intervalMs(interval: 'minute' | '5min' | 'hour' | 'day'): number {
  switch (interval) {
    case 'minute':
      return 60 * 1000;
    case '5min':
      return 5 * 60 * 1000;
    case 'hour':
      return 60 * 60 * 1000;
    case 'day':
    default:
      return 24 * 60 * 60 * 1000;
  }
}

function getDateKey(
  timestamp: Date,
  historyInterval: 'minute' | '5min' | 'hour' | 'day',
): string {
  if (historyInterval === 'minute') {
    const roundedTime = new Date(timestamp);
    roundedTime.setSeconds(0, 0);
    return roundedTime.toISOString();
  }

  if (historyInterval === '5min') {
    const roundedTime = new Date(timestamp);
    const minutes = roundedTime.getMinutes();
    roundedTime.setMinutes(Math.floor(minutes / 5) * 5, 0, 0);
    return roundedTime.toISOString();
  }

  if (historyInterval === 'hour') {
    const roundedTime = new Date(timestamp);
    roundedTime.setMinutes(0, 0, 0);
    return roundedTime.toISOString();
  }

  return timestamp.toISOString().split('T')[0];
}

export async function GET(request: Request) {
  try {
    const session = await getSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const exchange = searchParams.get('exchange') || 'all';
    const period = searchParams.get('period') || '30d';
    // 'calendar' (default): period starts at the calendar boundary (midnight, Monday, 1st, Jan 1).
    // 'rolling':            period is a fixed-length window ending now.
    const align = searchParams.get('align') || 'calendar';

    // Arbitrary time-window parameters (take priority over period/align).
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');

    const dm = await getDataManager();

    // Calculate date range
    const now = new Date();
    let endTime = new Date(now.getTime() + 5 * 60 * 1000); // 5 min buffer for clock skew
    const startTime = new Date(now);
    // baselineStartTime/baselineEndTime bracket the previous period (calendar mode only).
    let baselineStartTime = new Date(now);
    let baselineEndTime = new Date(now);

    // ── Arbitrary window (startDate / endDate params) ────────────────────────
    // When explicit dates are supplied we bypass the period/align logic entirely.
    let useCustomWindow = false;
    if (startDateParam) {
      useCustomWindow = true;
      const parsed = new Date(startDateParam);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: `Invalid startDate: ${startDateParam}` },
          { status: 400 },
        );
      }
      // Treat supplied dates as UTC midnight so "2026-04-01" means start of April 1
      parsed.setUTCHours(0, 0, 0, 0);
      startTime.setTime(parsed.getTime());

      if (endDateParam) {
        const parsedEnd = new Date(endDateParam);
        if (isNaN(parsedEnd.getTime())) {
          return NextResponse.json(
            { error: `Invalid endDate: ${endDateParam}` },
            { status: 400 },
          );
        }
        // End of the supplied day (23:59:59.999 UTC)
        parsedEnd.setUTCHours(23, 59, 59, 999);
        endTime = parsedEnd;
      }
      // Baseline = day just before the window start
      baselineEndTime = new Date(startTime.getTime() - 1);
      baselineStartTime = new Date(startTime);
      baselineStartTime.setDate(baselineStartTime.getDate() - 1);
    } else if (align === 'rolling') {
      // Rolling window: look back N units from now
      switch (period) {
        case '1h':
          startTime.setHours(startTime.getHours() - 1);
          break;
        case '1d':
          startTime.setDate(startTime.getDate() - 1);
          break;
        case '7d':
        case '1w':
          startTime.setDate(startTime.getDate() - 7);
          break;
        case '1m':
          startTime.setMonth(startTime.getMonth() - 1);
          break;
        case '1y':
          startTime.setFullYear(startTime.getFullYear() - 1);
          break;
        case '90d':
          startTime.setDate(startTime.getDate() - 90);
          break;
        case '30d':
        default:
          startTime.setDate(startTime.getDate() - 30);
      }
    } else {
      // Calendar-aligned periods
      switch (period) {
        case '1h':
          // Start of current hour
          startTime.setMinutes(0, 0, 0);
          baselineEndTime = new Date(startTime.getTime() - 1);
          baselineStartTime = new Date(startTime);
          baselineStartTime.setHours(baselineStartTime.getHours() - 1);
          break;
        case '1d':
          // Start of today (midnight)
          startTime.setHours(0, 0, 0, 0);
          baselineEndTime = new Date(startTime.getTime() - 1);
          baselineStartTime = new Date(startTime);
          baselineStartTime.setDate(baselineStartTime.getDate() - 1);
          break;
        case '7d':
        case '1w': {
          // Start of current ISO week (Monday 00:00)
          startTime.setHours(0, 0, 0, 0);
          const dow = startTime.getDay(); // 0 = Sun
          startTime.setDate(startTime.getDate() + (dow === 0 ? -6 : 1 - dow));
          baselineEndTime = new Date(startTime.getTime() - 1);
          baselineStartTime = new Date(startTime);
          baselineStartTime.setDate(baselineStartTime.getDate() - 7);
          break;
        }
        case '1m':
          // Start of current month (1st at midnight)
          startTime.setDate(1);
          startTime.setHours(0, 0, 0, 0);
          baselineEndTime = new Date(startTime.getTime() - 1);
          baselineStartTime = new Date(startTime);
          baselineStartTime.setMonth(baselineStartTime.getMonth() - 1);
          break;
        case '1y':
          // Start of current year (Jan 1 at midnight)
          startTime.setMonth(0, 1);
          startTime.setHours(0, 0, 0, 0);
          baselineEndTime = new Date(startTime.getTime() - 1);
          baselineStartTime = new Date(startTime);
          baselineStartTime.setFullYear(baselineStartTime.getFullYear() - 1);
          break;
        case '90d':
          startTime.setDate(startTime.getDate() - 90);
          baselineEndTime = new Date(startTime.getTime() - 1);
          baselineStartTime = new Date(startTime);
          baselineStartTime.setDate(baselineStartTime.getDate() - 1);
          break;
        case '30d':
        default:
          startTime.setDate(startTime.getDate() - 30);
          baselineEndTime = new Date(startTime.getTime() - 1);
          baselineStartTime = new Date(startTime);
          baselineStartTime.setDate(baselineStartTime.getDate() - 1);
      }
    }

    // Fetch accounts (and their aggregate fields for position/unrealizedPnl)
    let accounts = await dm.getUserAccountsWithBalances(userId);
    if (exchange !== 'all') {
      accounts = accounts.filter(
        (a) => a.exchange.toLowerCase() === exchange.toLowerCase(),
      );
    }

    const latestSnapshots = accounts;

    // If no data found for specific exchange, return empty response
    if (exchange !== 'all' && latestSnapshots.length === 0) {
      return NextResponse.json({
        summary: {
          totalBalance: 0,
          totalPositionValue: 0,
          totalEquity: 0,
          totalUnrealizedPnl: 0,
          totalPositions: 0,
          balanceChange: 0,
          period,
        },
        exchanges: [],
        chartData: [],
        timestamp: new Date(),
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Use exchange-reported totalBalance from AccountInfo (set by AccountPollingService
    // from each exchange's totalEquity). This properly accounts for unrealized P&L
    // on open positions and matches the balance history chart data.
    // ─────────────────────────────────────────────────────────────────────────
    let totalPositionValue = 0;
    let totalUnrealizedPnl = 0;
    let totalPositions = 0;

    const exchangeData = latestSnapshots.map((account) => {
      const balance = parseFloat(account.totalBalance.toString());
      const positionValue = parseFloat(account.totalPositionValue.toString());
      const unrealizedPnl = parseFloat(account.unrealizedPnl.toString());

      totalPositionValue += positionValue;
      totalUnrealizedPnl += unrealizedPnl;
      totalPositions += account.positionCount;

      return {
        exchange: account.exchange,
        balance,
        positionValue,
        unrealizedPnl,
        positionCount: account.positionCount,
        timestamp: account.updateTime,
      };
    });

    const totalBalance = exchangeData.reduce((sum, e) => sum + e.balance, 0);

    // Get historical data for chart
    const exchangesToQuery =
      exchange === 'all' ? latestSnapshots.map((s) => s.exchange) : [exchange];

    // Determine chart granularity.
    // For custom windows derive it from the actual range length; otherwise use period.
    const historyInterval: 'minute' | '5min' | 'hour' | 'day' = useCustomWindow
      ? intervalForRange(endTime.getTime() - startTime.getTime())
      : period === '1h'
        ? 'minute'
        : period === '1d'
          ? '5min'
          : period === '7d'
            ? 'hour'
            : 'day';
    const bucketIntervalMs = intervalMs(historyInterval);
    const transferStartByExchange: Record<string, Date> = {};
    exchangesToQuery.forEach((ex) => {
      transferStartByExchange[ex.toLowerCase()] = startTime;
    });

    const getTransferStartAfterBaseline = (
      point: BalanceHistoryPoint,
      defaultStart: Date,
    ): Date => {
      const bucketEnd = new Date(point.timestamp.getTime() + bucketIntervalMs);
      const createdAt = point.createdAt ? new Date(point.createdAt) : null;

      // First-account bootstrap rows are written after their synthetic period has
      // already ended. Transfers before that write are already reflected in the
      // baseline and must not be subtracted again.
      if (createdAt && createdAt.getTime() > bucketEnd.getTime()) {
        return createdAt;
      }

      return defaultStart;
    };

    // Calendar / custom-window mode: fetch the last non-zero balance at the end of the
    // previous period — this is the "opening balance" baseline.
    // Rolling mode: baseline is computed later from the first non-zero point in chartDataArray.
    let totalBaselineBalance = 0;
    if (useCustomWindow || align !== 'rolling') {
      const baselinePromises = exchangesToQuery.map(async (exchangeName) => ({
        exchange: exchangeName,
        history: await dm.getBalanceTimeSeries(
          exchangeName,
          baselineStartTime,
          baselineEndTime,
          historyInterval === 'minute' ? 'minute' : 'day',
          userId,
        ),
      }));
      const baselineData = await Promise.all(baselinePromises);

      const baselineBalances: Record<string, number> = {};
      baselineData.forEach(({ exchange: exName, history }) => {
        // Sum the latest non-zero balance for EACH account belonging to this exchange
        const latestPerAccount: Record<number, BalanceHistoryPoint> = {};
        for (let i = history.length - 1; i >= 0; i--) {
          const point = history[i] as BalanceHistoryPoint;
          const accountId = point.accountId;
          if (accountId && latestPerAccount[accountId] === undefined) {
            const bal = parseFloat(point.balance.toString());
            if (bal > 0) {
              latestPerAccount[accountId] = point;
            }
          }
        }
        const baselinePoints = Object.values(latestPerAccount);
        baselineBalances[exName] = baselinePoints.reduce(
          (sum, point) => sum + parseFloat(point.balance.toString()),
          0,
        );

        if (baselinePoints.length > 0) {
          const exchangeTransferStart = baselinePoints
            .map((point) => getTransferStartAfterBaseline(point, startTime))
            .reduce((min, pointStart) =>
              pointStart.getTime() < min.getTime() ? pointStart : min,
            );
          transferStartByExchange[exName.toLowerCase()] = exchangeTransferStart;
        }
      });

      totalBaselineBalance = exchangesToQuery.reduce(
        (sum, ex) => sum + (baselineBalances[ex] ?? 0),
        0,
      );
    }

    const historyPromises = exchangesToQuery.map(async (exchangeName) => {
      return {
        exchange: exchangeName,
        history: await dm.getBalanceTimeSeries(
          exchangeName,
          startTime,
          endTime,
          historyInterval,
          userId,
        ),
      };
    });

    const historicalData = await Promise.all(historyPromises);

    const chartData: { [key: string]: ChartDataPoint } = {};

    historicalData.forEach(({ exchange: exName, history }) => {
      history.forEach((point) => {
        const dateKey = getDateKey(point.timestamp, historyInterval);

        if (!chartData[dateKey]) {
          chartData[dateKey] = { date: dateKey };
        }
        // Use addition to aggregate multiple accounts on the same exchange
        const currentVal = chartData[dateKey][exName];
        const val = typeof currentVal === 'number' ? currentVal : 0;
        chartData[dateKey][exName] = val + parseFloat(point.balance.toString());
      });
    });

    const chartDataArray = Object.values(chartData).sort(
      (a: ChartDataPoint, b: ChartDataPoint) =>
        new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    // Fill missing exchange data with previous values
    const exchangeLastValues: { [exchange: string]: number } = {};
    exchangesToQuery.forEach((ex) => {
      exchangeLastValues[ex] = 0;
    });

    chartDataArray.forEach((item: ChartDataPoint) => {
      exchangesToQuery.forEach((ex) => {
        if (item[ex] !== undefined) {
          exchangeLastValues[ex] = item[ex] as number;
        } else {
          item[ex] = exchangeLastValues[ex];
        }
      });
    });

    // Rolling mode or fallback (if previous period has no data):
    // find the first non-zero aggregate snapshot within the current window.
    // Custom windows always have a baseline already set, so skip the fallback only
    // when align === 'rolling' (and we haven't overridden with a custom window).
    let baselineBalance = totalBaselineBalance;
    if ((!useCustomWindow && align === 'rolling') || baselineBalance === 0) {
      for (const point of chartDataArray) {
        const total = Object.values(point)
          .filter((v) => typeof v === 'number' && !isNaN(v))
          .reduce((sum: number, v) => sum + (v as number), 0);
        if (total > 0) {
          baselineBalance = total;

          historicalData.forEach(({ exchange: exName, history }) => {
            const exchangeBalance = point[exName];
            if (typeof exchangeBalance !== 'number' || exchangeBalance <= 0) {
              return;
            }

            const baselinePoint = history.find(
              (historyPoint) =>
                getDateKey(historyPoint.timestamp, historyInterval) === point.date,
            ) as BalanceHistoryPoint | undefined;

            if (baselinePoint) {
              transferStartByExchange[exName.toLowerCase()] =
                getTransferStartAfterBaseline(
                  baselinePoint,
                  new Date(new Date(point.date).getTime() + bucketIntervalMs),
                );
            }
          });
          break;
        }
      }
    }

    const calculateChange = (current: number, baseline: number): number => {
      if (baseline === 0) return 0;
      return ((current - baseline) / baseline) * 100;
    };

    // Net deposits = transfers (deposits − withdrawals) that occurred WITHIN the
    // current period only. The previous period's transfers must NOT be included
    // because they're already reflected in the baseline balance.
    let netDeposits = 0;
    if (dm.getTransfers) {
      const transferStartTimes = Object.values(transferStartByExchange);
      const earliestTransferStart =
        transferStartTimes.length > 0
          ? transferStartTimes.reduce((min, pointStart) =>
              pointStart.getTime() < min.getTime() ? pointStart : min,
            )
          : startTime;
      const transfers = await dm.getTransfers(userId, earliestTransferStart, endTime);
      for (const t of transfers) {
        if (exchange !== 'all' && t.exchange?.toLowerCase() !== exchange.toLowerCase())
          continue;
        const exchangeTransferStart =
          transferStartByExchange[t.exchange?.toLowerCase() || ''] ?? startTime;
        if (new Date(t.timestamp).getTime() < exchangeTransferStart.getTime()) {
          continue;
        }
        if (t.status === 'COMPLETED') {
          if (t.network === 'internal') {
            continue;
          }
          const amt = parseFloat(t.amount.toString());
          if (t.type === 'DEPOSIT') {
            netDeposits += amt;
          } else if (t.type === 'WITHDRAW') {
            netDeposits -= amt;
          }
        }
      }
    }

    const adjustedTotalBalance = totalBalance - netDeposits;
    const balanceChange = calculateChange(adjustedTotalBalance, baselineBalance);
    const balanceChangeValue = adjustedTotalBalance - baselineBalance;
    const totalEquity = totalBalance + totalPositionValue;

    // Build a human-readable period label for the response
    const periodLabel = useCustomWindow
      ? `${startDateParam}${endDateParam ? ` to ${endDateParam}` : '+'}`
      : period;

    return NextResponse.json({
      summary: {
        totalBalance,
        totalPositionValue,
        totalEquity,
        totalUnrealizedPnl,
        totalPositions,
        balanceChange,
        balanceChangeValue,
        netDeposits,
        period: periodLabel,
      },
      exchanges: exchangeData,
      chartData: chartDataArray,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Account analytics error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch account analytics' },
      { status: 500 },
    );
  }
}
