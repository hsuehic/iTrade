import { NextResponse } from 'next/server';

import { getDataManager } from '@/lib/data-manager';
import { getSession } from '@/lib/auth';

// Transform historical data for chart
export interface ChartDataPoint {
  date: string;
  [exchange: string]: string | number; // exchange names as keys with balance values
}

/**
 * GET /api/analytics/account - 获取账户分析数据
 *
 * Query params:
 * - exchange?: string - 交易所名称
 * - period?: '7d' | '30d' | '90d' - 时间周期
 */
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

    const dm = await getDataManager();

    // Calculate date range
    const now = new Date();
    const endTime = new Date(now.getTime() + 5 * 60 * 1000); // 5 min buffer for clock skew
    const startTime = new Date(now);
    // baselineStartTime/baselineEndTime bracket the previous period (calendar mode only).
    let baselineStartTime = new Date(now);
    let baselineEndTime = new Date(now);

    if (align === 'rolling') {
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
          baselineEndTime = new Date(startTime);
          baselineStartTime = new Date(startTime);
          baselineStartTime.setHours(baselineStartTime.getHours() - 1);
          break;
        case '1d':
          // Start of today (midnight)
          startTime.setHours(0, 0, 0, 0);
          baselineEndTime = new Date(startTime);
          baselineStartTime = new Date(startTime);
          baselineStartTime.setDate(baselineStartTime.getDate() - 1);
          break;
        case '7d':
        case '1w': {
          // Start of current ISO week (Monday 00:00)
          startTime.setHours(0, 0, 0, 0);
          const dow = startTime.getDay(); // 0 = Sun
          startTime.setDate(startTime.getDate() + (dow === 0 ? -6 : 1 - dow));
          baselineEndTime = new Date(startTime);
          baselineStartTime = new Date(startTime);
          baselineStartTime.setDate(baselineStartTime.getDate() - 7);
          break;
        }
        case '1m':
          // Start of current month (1st at midnight)
          startTime.setDate(1);
          startTime.setHours(0, 0, 0, 0);
          baselineEndTime = new Date(startTime);
          baselineStartTime = new Date(startTime);
          baselineStartTime.setMonth(baselineStartTime.getMonth() - 1);
          break;
        case '1y':
          // Start of current year (Jan 1 at midnight)
          startTime.setMonth(0, 1);
          startTime.setHours(0, 0, 0, 0);
          baselineEndTime = new Date(startTime);
          baselineStartTime = new Date(startTime);
          baselineStartTime.setFullYear(baselineStartTime.getFullYear() - 1);
          break;
        case '90d':
          startTime.setDate(startTime.getDate() - 90);
          baselineEndTime = new Date(startTime);
          baselineStartTime = new Date(startTime);
          baselineStartTime.setDate(baselineStartTime.getDate() - 1);
          break;
        case '30d':
        default:
          startTime.setDate(startTime.getDate() - 30);
          baselineEndTime = new Date(startTime);
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

    // Calendar mode: fetch the last non-zero balance at the end of the previous
    // calendar period — this is the "opening balance" baseline.
    // Rolling mode: baseline is computed later from the first non-zero point in chartDataArray.
    let totalBaselineBalance = 0;
    if (align !== 'rolling') {
      const baselinePromises = exchangesToQuery.map(async (exchangeName) => ({
        exchange: exchangeName,
        history: await dm.getBalanceTimeSeries(
          exchangeName,
          baselineStartTime,
          baselineEndTime,
          'day',
          userId,
        ),
      }));
      const baselineData = await Promise.all(baselinePromises);

      const baselineBalances: Record<string, number> = {};
      baselineData.forEach(({ exchange: exName, history }) => {
        let lastBalance = 0;
        for (let i = history.length - 1; i >= 0; i--) {
          const bal = parseFloat(history[i].balance.toString());
          if (bal > 0) {
            lastBalance = bal;
            break;
          }
        }
        baselineBalances[exName] = lastBalance;
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
          period === '1h'
            ? 'minute'
            : period === '1d'
              ? '5min'
              : period === '7d'
                ? 'hour'
                : 'day',
          userId,
        ),
      };
    });

    const historicalData = await Promise.all(historyPromises);

    const chartData: { [key: string]: ChartDataPoint } = {};

    historicalData.forEach(({ exchange: exName, history }) => {
      history.forEach((point) => {
        let dateKey: string;
        if (period === '1h') {
          const roundedTime = new Date(point.timestamp);
          roundedTime.setSeconds(0, 0);
          dateKey = roundedTime.toISOString();
        } else if (period === '1d') {
          const roundedTime = new Date(point.timestamp);
          const minutes = roundedTime.getMinutes();
          roundedTime.setMinutes(Math.floor(minutes / 5) * 5, 0, 0);
          dateKey = roundedTime.toISOString();
        } else if (period === '7d') {
          const roundedTime = new Date(point.timestamp);
          roundedTime.setMinutes(0, 0, 0);
          dateKey = roundedTime.toISOString();
        } else {
          dateKey = point.timestamp.toISOString().split('T')[0];
        }

        if (!chartData[dateKey]) {
          chartData[dateKey] = { date: dateKey };
        }
        chartData[dateKey][exName] = parseFloat(point.balance.toString());
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

    // Rolling mode: first non-zero aggregate snapshot within the window.
    // Calendar mode: last non-zero snapshot at the end of the previous period (already computed).
    let baselineBalance = totalBaselineBalance;
    if (align === 'rolling') {
      for (const point of chartDataArray) {
        const total = Object.values(point)
          .filter((v) => typeof v === 'number' && !isNaN(v))
          .reduce((sum: number, v) => sum + (v as number), 0);
        if (total > 0) {
          baselineBalance = total;
          break;
        }
      }
    }

    const calculateChange = (current: number, baseline: number): number => {
      if (baseline === 0) return 0;
      return ((current - baseline) / baseline) * 100;
    };

    const balanceChange = calculateChange(totalBalance, baselineBalance);
    const totalEquity = totalBalance + totalPositionValue;

    return NextResponse.json({
      summary: {
        totalBalance,
        totalPositionValue,
        totalEquity,
        totalUnrealizedPnl,
        totalPositions,
        balanceChange,
        period,
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
