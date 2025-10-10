'use client';

import { useEffect, useState } from 'react';
import {
  IconTrendingDown,
  IconTrendingUp,
  IconWallet,
  IconChartLine,
  IconCoins,
  IconRocket,
} from '@tabler/icons-react';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AnimatedCurrency,
  AnimatedInteger,
  AnimatedPercentage,
} from '@/components/animated-number';

interface AccountSummary {
  totalBalance: number;
  totalPositionValue: number;
  totalEquity: number;
  totalUnrealizedPnl: number;
  totalPositions: number;
  balanceChange: number;
  period: string;
}

interface StrategySummary {
  total: number;
  active: number;
  inactive: number;
  totalPnl: number;
  totalOrders: number;
  totalFilledOrders: number;
  avgFillRate: string;
}

interface TradingDashboardCardsProps {
  selectedExchange: string;
  refreshInterval?: number; // 轮询间隔（毫秒），默认 5000ms (5秒)
}

export function TradingDashboardCards({
  selectedExchange,
  refreshInterval = 5000,
}: TradingDashboardCardsProps) {
  const [accountData, setAccountData] = useState<AccountSummary | null>(null);
  const [strategyData, setStrategyData] = useState<StrategySummary | null>(
    null
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [accountRes, strategyRes] = await Promise.all([
          fetch(
            `/api/analytics/account?period=30d&exchange=${selectedExchange}`
          ),
          fetch('/api/analytics/strategies'),
        ]);

        if (accountRes.ok) {
          const accountJson = await accountRes.json();
          setAccountData(accountJson.summary);
        }

        if (strategyRes.ok) {
          const strategyJson = await strategyRes.json();
          setStrategyData(strategyJson.summary);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Refresh data at configured interval
    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [selectedExchange, refreshInterval]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="@container/card">
            <CardHeader>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-32" />
            </CardHeader>
          </Card>
        ))}
      </div>
    );
  }

  const _formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const _formatPercentage = (value: number) => {
    const formatted = Math.abs(value).toFixed(2);
    return value >= 0 ? `+${formatted}%` : `-${formatted}%`;
  };

  const totalEquity = accountData?.totalEquity || 0;
  const totalPnl = accountData?.totalUnrealizedPnl || 0;
  const balanceChange = accountData?.balanceChange || 0;
  const strategyPnl = strategyData?.totalPnl || 0;
  const activeStrategies = strategyData?.active || 0;

  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {/* Total Equity Card */}
      <Card className="@container/card">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <CardDescription className="flex items-center gap-2">
              <IconWallet className="size-4" />
              Total Equity
            </CardDescription>
            <Badge
              variant="outline"
              className={
                balanceChange >= 0
                  ? 'border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400'
                  : 'border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400'
              }
            >
              {balanceChange >= 0 ? (
                <IconTrendingUp className="size-3" />
              ) : (
                <IconTrendingDown className="size-3" />
              )}
              <AnimatedPercentage
                value={balanceChange}
                duration={0.7}
                showSign={true}
              />
            </Badge>
          </div>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            <AnimatedCurrency value={totalEquity} duration={0.7} />
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {balanceChange >= 0 ? 'Growing' : 'Declining'} this month
            {balanceChange >= 0 ? (
              <IconTrendingUp className="size-4 text-green-500" />
            ) : (
              <IconTrendingDown className="size-4 text-red-500" />
            )}
          </div>
          <div className="text-muted-foreground">
            {selectedExchange === 'all'
              ? 'Balance + Positions across all exchanges'
              : `Balance + Positions on ${selectedExchange}`}
          </div>
        </CardFooter>
      </Card>

      {/* Unrealized P&L Card */}
      <Card className="@container/card">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <CardDescription className="flex items-center gap-2">
              <IconChartLine className="size-4" />
              Unrealized P&L
            </CardDescription>
            <Badge
              variant="outline"
              className={
                totalPnl >= 0
                  ? 'border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400'
                  : 'border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400'
              }
            >
              {totalPnl >= 0 ? (
                <IconTrendingUp className="size-3" />
              ) : (
                <IconTrendingDown className="size-3" />
              )}
              {((totalPnl / Math.max(totalEquity - totalPnl, 1)) * 100).toFixed(
                2
              )}
              %
            </Badge>
          </div>
          <CardTitle
            className={`text-2xl font-semibold tabular-nums @[250px]/card:text-3xl ${
              totalPnl >= 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            <AnimatedCurrency value={totalPnl} duration={0.7} />
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {totalPnl >= 0 ? 'Profitable positions' : 'Positions underwater'}
          </div>
          <div className="text-muted-foreground">
            {accountData?.totalPositions || 0} open position
            {accountData?.totalPositions !== 1 ? 's' : ''}
          </div>
        </CardFooter>
      </Card>

      {/* Active Strategies Card */}
      <Card className="@container/card">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <CardDescription className="flex items-center gap-2">
              <IconRocket className="size-4" />
              Active Strategies
            </CardDescription>
            <Badge
              variant="outline"
              className="border-blue-500/50 bg-blue-500/10 text-blue-700 dark:text-blue-400"
            >
              {strategyData?.total || 0} total
            </Badge>
          </div>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            <AnimatedInteger value={activeStrategies} duration={0.7} />
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {activeStrategies > 0 ? 'Trading live' : 'No active strategies'}
          </div>
          <div className="text-muted-foreground">
            Fill rate: {strategyData?.avgFillRate || '0.00'}%
          </div>
        </CardFooter>
      </Card>

      {/* Strategy P&L Card */}
      <Card className="@container/card">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <CardDescription className="flex items-center gap-2">
              <IconCoins className="size-4" />
              Strategy P&L
            </CardDescription>
            <Badge
              variant="outline"
              className={
                strategyPnl >= 0
                  ? 'border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400'
                  : 'border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400'
              }
            >
              {strategyPnl >= 0 ? (
                <IconTrendingUp className="size-3" />
              ) : (
                <IconTrendingDown className="size-3" />
              )}
              {strategyPnl >= 0 ? 'Profit' : 'Loss'}
            </Badge>
          </div>
          <CardTitle
            className={`text-2xl font-semibold tabular-nums @[250px]/card:text-3xl ${
              strategyPnl >= 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            <AnimatedCurrency value={strategyPnl} duration={0.7} />
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {strategyData?.totalOrders || 0} orders executed
          </div>
          <div className="text-muted-foreground">
            {strategyData?.totalFilledOrders || 0} filled successfully
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
