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

    // Optimized: Get latest state from AccountInfo aggregate fields
    let accounts = await dm.getUserAccountsWithBalances(userId);
    if (exchange !== 'all') {
      accounts = accounts.filter(a => a.exchange.toLowerCase() === exchange.toLowerCase());
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

    // Calculate totals
    let totalBalance = 0;
    let totalPositionValue = 0;
    let totalUnrealizedPnl = 0;
    let totalPositions = 0;

    const exchangeData = latestSnapshots.map((account) => {
      const balance = parseFloat(account.totalBalance.toString());
      const positionValue = parseFloat(account.totalPositionValue.toString());
      const unrealizedPnl = parseFloat(account.unrealizedPnl.toString());

      totalBalance += balance;
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

    // Get historical data for chart
    // If specific exchange is selected, only get that exchange's data
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

    // Note: Chart data now exclusively uses balance_xxx tables
    // No fallback to account_snapshots to ensure data consistency

    const chartData: { [key: string]: ChartDataPoint } = {};

    historicalData.forEach(({ exchange, history }) => {
      history.forEach((point) => {
        // For different periods, use different time precision
        let dateKey: string;
        if (period === '1h') {
          // For 1 hour: precise to minute
          const roundedTime = new Date(point.timestamp);
          roundedTime.setSeconds(0, 0); // Round to minute
          dateKey = roundedTime.toISOString();
        } else if (period === '1d') {
          // For 1 day: use 5-minute intervals (matching balance_5min table)
          const roundedTime = new Date(point.timestamp);
          const minutes = roundedTime.getMinutes();
          const roundedMinutes = Math.floor(minutes / 5) * 5; // Round to 5-minute intervals
          roundedTime.setMinutes(roundedMinutes, 0, 0);
          dateKey = roundedTime.toISOString();
        } else if (period === '7d') {
          // For 7 days: aggregate to hour
          const roundedTime = new Date(point.timestamp);
          roundedTime.setMinutes(0, 0, 0);
          dateKey = roundedTime.toISOString();
        } else {
          // For longer periods, group by date only
          dateKey = point.timestamp.toISOString().split('T')[0];
        }

        if (!chartData[dateKey]) {
          chartData[dateKey] = {
            date:
              period === '1h' || period === '1d' || period === '7d' ? dateKey : dateKey,
          };
        }
        // Use the latest value if multiple points map to the same time slot
        chartData[dateKey][exchange] = parseFloat(point.balance.toString());
      });
    });

    const chartDataArray = Object.values(chartData).sort(
      (a: ChartDataPoint, b: ChartDataPoint) =>
        new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    // Fill missing exchange data with previous values to ensure all exchanges appear on chart
    const exchangeLastValues: { [exchange: string]: number } = {};
    exchangesToQuery.forEach((exchange) => {
      exchangeLastValues[exchange] = 0; // Initialize with 0
    });

    chartDataArray.forEach((item: ChartDataPoint) => {
      exchangesToQuery.forEach((exchange) => {
        if (item[exchange] !== undefined) {
          // Update last known value
          exchangeLastValues[exchange] = item[exchange] as number;
        } else {
          // Fill with last known value
          item[exchange] = exchangeLastValues[exchange];
        }
      });
    });

    // Calculate percentage changes
    const calculateChange = (current: number, history: typeof chartDataArray) => {
      if (history.length === 0) return 0;

      // For single data point, insufficient data for comparison
      if (history.length === 1) return 0;

      // Find the first meaningful (non-zero) balance entry
      let firstMeaningfulBalance = 0;

      for (let i = 0; i < history.length; i++) {
        const totalBalance = Object.values(history[i])
          .filter((v) => typeof v === 'number' && !isNaN(v))
          .reduce((sum: number, v) => sum + (v as number), 0);

        if (totalBalance > 0) {
          firstMeaningfulBalance = totalBalance;
          break;
        }
      }

      if (firstMeaningfulBalance === 0) return 0;

      const changePercent =
        ((current - firstMeaningfulBalance) / firstMeaningfulBalance) * 100;

      // Sanity check: if change is over 50% in a day, likely data issue
      if (period === '1d' && Math.abs(changePercent) > 50) {
        return 0;
      }

      return changePercent;
    };

    const balanceChange = calculateChange(totalBalance, chartDataArray);

    // Note: Removed expensive fallback query that was causing performance issues
    // If historical data is insufficient, balanceChange will be 0

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
