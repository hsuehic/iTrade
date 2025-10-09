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
      case '7d':
        startTime.setDate(startTime.getDate() - 7);
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
    const exchangesToQuery = exchange === 'all' 
      ? latestSnapshots.map(s => s.exchange)
      : [exchange];

    const historyPromises = exchangesToQuery.map(async (exchangeName) => {
      return {
        exchange: exchangeName,
        history: await dm.getBalanceTimeSeries(
          exchangeName,
          startTime,
          endTime,
          period === '7d' ? 'hour' : 'day'
        ),
      };
    });

    const historicalData = await Promise.all(historyPromises);

    // Transform historical data for chart
    const chartData: { [key: string]: any } = {};
    
    historicalData.forEach(({ exchange, history }) => {
      history.forEach((point) => {
        const dateKey = point.timestamp.toISOString().split('T')[0];
        if (!chartData[dateKey]) {
          chartData[dateKey] = { date: dateKey };
        }
        chartData[dateKey][exchange] = parseFloat(point.balance.toString());
      });
    });

    const chartDataArray = Object.values(chartData).sort(
      (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Calculate percentage changes
    const calculateChange = (current: number, history: typeof chartDataArray) => {
      if (history.length < 2) return 0;
      const first = Object.values(history[0])
        .filter((v) => typeof v === 'number')
        .reduce((sum: number, v) => sum + (v as number), 0);
      if (first === 0) return 0;
      return ((current - first) / first) * 100;
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
      { status: 500 }
    );
  }
}

