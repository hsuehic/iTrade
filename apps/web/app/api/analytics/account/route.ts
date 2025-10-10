import { NextResponse } from 'next/server';

import { getDataManager } from '@/lib/data-manager';

/**
 * GET /api/analytics/account - 获取账户分析数据
 *
 * Query params:
 * - exchange?: string - 交易所名称
 * - period?: '7d' | '30d' | '90d' - 时间周期
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const exchange = searchParams.get('exchange') || 'all';
    const period = searchParams.get('period') || '30d';

    const dm = await getDataManager();

    // Calculate date range
    const endTime = new Date();
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

    // Get latest snapshots for all exchanges or specific exchange
    const snapshotRepo = dm.getAccountSnapshotRepository();

    let latestSnapshots;
    if (exchange === 'all') {
      latestSnapshots = await snapshotRepo.getLatestForAllExchanges();
    } else {
      const snapshot = await snapshotRepo.getLatest(exchange);
      latestSnapshots = snapshot ? [snapshot] : [];
    }

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

    const exchangeData = latestSnapshots.map((snapshot) => {
      const balance = parseFloat(snapshot.totalBalance.toString());
      const positionValue = parseFloat(snapshot.totalPositionValue.toString());
      const unrealizedPnl = parseFloat(snapshot.unrealizedPnl.toString());

      totalBalance += balance;
      totalPositionValue += positionValue;
      totalUnrealizedPnl += unrealizedPnl;
      totalPositions += snapshot.positionCount;

      return {
        exchange: snapshot.exchange,
        balance,
        positionValue,
        unrealizedPnl,
        positionCount: snapshot.positionCount,
        timestamp: snapshot.timestamp,
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
          period === '1h' || period === '1d' || period === '7d' ? 'hour' : 'day'
        ),
      };
    });

    const historicalData = await Promise.all(historyPromises);

    // Transform historical data for chart
    const chartData: { [key: string]: any } = {};

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
          // For 1 day: aggregate to 10-minute intervals
          const roundedTime = new Date(point.timestamp);
          const minutes = roundedTime.getMinutes();
          const roundedMinutes = Math.floor(minutes / 10) * 10; // Round to 10-minute intervals
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
              period === '1h' || period === '1d' || period === '7d'
                ? dateKey
                : dateKey,
          };
        }
        // Use the latest value if multiple points map to the same time slot
        chartData[dateKey][exchange] = parseFloat(point.balance.toString());
      });
    });

    const chartDataArray = Object.values(chartData).sort(
      (a: any, b: any) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Fill missing exchange data with previous values to ensure all exchanges appear on chart
    const exchangeLastValues: { [exchange: string]: number } = {};
    exchangesToQuery.forEach((exchange) => {
      exchangeLastValues[exchange] = 0; // Initialize with 0
    });

    chartDataArray.forEach((item: any) => {
      exchangesToQuery.forEach((exchange) => {
        if (item[exchange] !== undefined) {
          // Update last known value
          exchangeLastValues[exchange] = item[exchange];
        } else {
          // Fill with last known value
          item[exchange] = exchangeLastValues[exchange];
        }
      });
    });

    // Calculate percentage changes
    const calculateChange = (
      current: number,
      history: typeof chartDataArray
    ) => {
      // Debug logging for troubleshooting
      if (period === '1d' && exchange === 'all') {
        console.log('[Balance Change Debug]', {
          period,
          exchange,
          historyLength: history.length,
          current,
          firstHistoryItem: history[0],
          lastHistoryItem: history[history.length - 1],
          exchangesToQuery,
        });
      }

      if (history.length === 0) return 0;

      // For single data point, check if we have any meaningful comparison
      if (history.length === 1) {
        // Try to get balance from 24 hours ago directly from database
        if (
          period === '1d' ||
          period === '1w' ||
          period === '1m' ||
          period === '1y'
        ) {
          // Return 0 as we can't calculate change with single data point
          // But don't treat this as an error - just insufficient data
          return 0;
        }
      }

      // Find the first meaningful (non-zero) balance entry
      let firstMeaningfulBalance = 0;
      let firstMeaningfulIndex = -1;

      for (let i = 0; i < history.length; i++) {
        const totalBalance = Object.values(history[i])
          .filter((v) => typeof v === 'number' && !isNaN(v))
          .reduce((sum: number, v) => sum + (v as number), 0);

        if (totalBalance > 0) {
          firstMeaningfulBalance = totalBalance;
          firstMeaningfulIndex = i;
          break;
        }
      }

      if (firstMeaningfulBalance === 0 || firstMeaningfulIndex === -1) {
        // If no meaningful historical data found
        console.log('[Balance Change] No meaningful historical data found');
        return 0;
      }

      const changePercent =
        ((current - firstMeaningfulBalance) / firstMeaningfulBalance) * 100;

      // Sanity check: if change is over 50% in a day, it's likely a data issue
      if (period === '1d' && Math.abs(changePercent) > 50) {
        console.log('[Balance Change] Suspicious large change detected:', {
          changePercent,
          firstMeaningfulBalance,
          current,
          period,
          firstMeaningfulIndex,
        });
        // For day period, cap at reasonable change (maybe account creation scenario)
        // But more likely it's a data issue, so return 0
        return 0;
      }

      // Debug for 1d period
      if (period === '1d' && exchange === 'all') {
        console.log('[Balance Change Calculation]', {
          firstMeaningfulBalance,
          current,
          changePercent: changePercent,
          calculation: `((${current} - ${firstMeaningfulBalance}) / ${firstMeaningfulBalance}) * 100`,
          firstMeaningfulIndex,
        });
      }

      return changePercent;
    };

    let balanceChange = calculateChange(totalBalance, chartDataArray);

    // Fallback calculation if chart data is insufficient (especially for 1d with 'all' exchange)
    if (
      balanceChange === 0 &&
      chartDataArray.length < 2 &&
      period === '1d' &&
      exchange === 'all'
    ) {
      try {
        console.log(
          '[Balance Change Fallback] Attempting direct database query...'
        );

        // Get snapshots from 24 hours ago for all exchanges
        const fallbackStartTime = new Date();
        fallbackStartTime.setHours(fallbackStartTime.getHours() - 24);

        let historicalBalance = 0;

        // Query each exchange for data from 24 hours ago
        for (const exchangeName of exchangesToQuery) {
          const historicalSnapshots = await dm.getBalanceTimeSeries(
            exchangeName,
            fallbackStartTime,
            new Date(fallbackStartTime.getTime() + 60 * 60 * 1000), // 1 hour window
            'hour'
          );

          if (historicalSnapshots.length > 0) {
            // Get the closest snapshot to 24 hours ago
            const closestSnapshot = historicalSnapshots.reduce(
              (closest, current) => {
                const closestDiff = Math.abs(
                  fallbackStartTime.getTime() - closest.timestamp.getTime()
                );
                const currentDiff = Math.abs(
                  fallbackStartTime.getTime() - current.timestamp.getTime()
                );
                return currentDiff < closestDiff ? current : closest;
              }
            );

            historicalBalance += parseFloat(closestSnapshot.balance.toString());
          }
        }

        console.log('[Balance Change Fallback] Raw data:', {
          historicalBalance,
          currentBalance: totalBalance,
          exchangesToQuery,
          fallbackStartTime: fallbackStartTime.toISOString(),
        });

        if (historicalBalance > 0 && totalBalance !== historicalBalance) {
          balanceChange =
            ((totalBalance - historicalBalance) / historicalBalance) * 100;
          console.log('[Balance Change Fallback] Calculated change:', {
            historicalBalance,
            currentBalance: totalBalance,
            change: balanceChange,
            calculation: `((${totalBalance} - ${historicalBalance}) / ${historicalBalance}) * 100`,
          });
        } else if (historicalBalance === 0) {
          console.log(
            '[Balance Change Fallback] Historical balance is 0 - cannot calculate meaningful change'
          );
          // Don't set balanceChange, keep it as 0
        } else {
          console.log(
            '[Balance Change Fallback] No meaningful change detected:',
            {
              historicalBalance,
              currentBalance: totalBalance,
            }
          );
        }
      } catch (fallbackError) {
        console.error('[Balance Change Fallback] Error:', fallbackError);
      }
    }

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
      { status: 500 }
    );
  }
}
