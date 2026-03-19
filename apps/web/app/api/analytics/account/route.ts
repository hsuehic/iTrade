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

    const dm = await getDataManager();

    // Calculate date range
    const endTime = new Date(Date.now() + 5 * 60 * 1000); // Add 5 minutes buffer for clock skew
    const startTime = new Date();

    switch (period) {
      case '1h':
        startTime.setHours(startTime.getHours() - 1);
        break;
      case '1d':
        startTime.setDate(startTime.getDate() - 1);
        break;
      case '7d':
        startTime.setDate(startTime.getDate() - 7);
        break;
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

    // Calculate percentage change vs. beginning of period
    const calculateChange = (current: number, history: typeof chartDataArray) => {
      if (history.length < 2) return 0;

      let firstMeaningfulBalance = 0;
      for (let i = 0; i < history.length; i++) {
        const periodTotal = Object.values(history[i])
          .filter((v) => typeof v === 'number' && !isNaN(v))
          .reduce((sum: number, v) => sum + (v as number), 0);
        if (periodTotal > 0) {
          firstMeaningfulBalance = periodTotal;
          break;
        }
      }

      if (firstMeaningfulBalance === 0) return 0;

      const changePercent =
        ((current - firstMeaningfulBalance) / firstMeaningfulBalance) * 100;
      if (period === '1d' && Math.abs(changePercent) > 50) return 0;
      return changePercent;
    };

    const balanceChange = calculateChange(totalBalance, chartDataArray);
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
