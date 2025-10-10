'use client';

import { useEffect, useState } from 'react';
import {
  IconTrendingDown,
  IconTrendingUp,
  IconWallet,
  IconChartLine,
  IconCoins,
  IconRocket,
  IconChevronDown,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

interface AccountSummary {
  totalBalance: number;
  totalPositionValue: number;
  totalEquity: number;
  totalUnrealizedPnl: number;
  totalRealizedPnl?: number; // 新增已实现盈亏
  totalPositions: number;
  balanceChange: number;
  balanceChangeValue?: number; // 新增余额变化数值
  period: string;
}

interface BalanceChangeData {
  change: number; // 百分比变化
  changeValue: number; // 数值变化
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
  const [balanceChangeData, setBalanceChangeData] =
    useState<BalanceChangeData | null>(null);
  const [balanceChangePeriod, setBalanceChangePeriod] = useState<string>('1m');

  // Main account and strategy data
  useEffect(() => {
    const fetchMainData = async () => {
      try {
        const [accountRes, strategyRes] = await Promise.all([
          fetch(
            `/api/analytics/account?period=30d&exchange=${selectedExchange}`
          ),
          fetch('/api/analytics/strategies'),
        ]);

        if (accountRes.ok) {
          const accountJson = await accountRes.json();
          let accountSummary = accountJson.summary;

          // Get realized PnL from strategies
          if (strategyRes.ok) {
            const strategyJson = await strategyRes.json();
            setStrategyData(strategyJson.summary);

            // Calculate total realized PnL from all strategies
            const totalRealizedPnl =
              strategyJson.allStrategies?.reduce(
                (sum: number, strategy: any) =>
                  sum + (strategy.realizedPnl || 0),
                0
              ) || 0;

            accountSummary.totalRealizedPnl = totalRealizedPnl;
          }

          setAccountData(accountSummary);
        }
      } catch (error) {
        console.error('Failed to fetch main dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMainData();

    // Refresh main data at configured interval
    const interval = setInterval(fetchMainData, refreshInterval);
    return () => clearInterval(interval);
  }, [selectedExchange, refreshInterval]);

  // Balance change data (separate effect to avoid unnecessary calls)
  useEffect(() => {
    const fetchBalanceChangeData = async () => {
      try {
        const balanceChangeRes = await fetch(
          `/api/analytics/account?period=${balanceChangePeriod}&exchange=${selectedExchange}`
        );

        if (balanceChangeRes.ok) {
          const balanceChangeJson = await balanceChangeRes.json();
          const summary = balanceChangeJson.summary;

          // Calculate balance change value
          const currentBalance = summary.totalBalance;
          const changePercentage = summary.balanceChange;

          // Debug log for 1d period issues
          if (balanceChangePeriod === '1d' && changePercentage === 0) {
            console.log('1d period data:', {
              currentBalance,
              changePercentage,
              chartDataLength: balanceChangeJson.chartData?.length || 0,
            });
          }

          // Correct formula: if current = 1000 and change = +5%,
          // then previous = 1000/1.05 = 952.38, changeValue = 1000 - 952.38 = 47.62
          let changeValue = 0;
          if (changePercentage !== 0) {
            const previousBalance =
              currentBalance / (1 + changePercentage / 100);
            changeValue = currentBalance - previousBalance;
          }

          setBalanceChangeData({
            change: changePercentage,
            changeValue: changeValue,
            period: balanceChangePeriod,
          });
        }
      } catch (error) {
        console.error('Failed to fetch balance change data:', error);
      }
    };

    fetchBalanceChangeData();
  }, [selectedExchange, balanceChangePeriod]);

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

  const totalBalance = accountData?.totalBalance || 0;
  const totalEquity = accountData?.totalEquity || 0;
  const totalRealizedPnl = accountData?.totalRealizedPnl || 0;
  const totalUnrealizedPnl = accountData?.totalUnrealizedPnl || 0;
  const balanceChange = accountData?.balanceChange || 0;

  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {/* Balance Card */}
      <Card className="@container/card">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <CardDescription className="flex items-center gap-2">
              <IconWallet className="size-4" />
              Balance
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
                duration={0.4}
                showSign={true}
              />
            </Badge>
          </div>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            <AnimatedCurrency value={totalBalance} duration={0.4} />
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
              ? 'Cash balance across all exchanges'
              : `Cash balance on ${selectedExchange}`}
          </div>
        </CardFooter>
      </Card>

      {/* Balance Change Card */}
      <Card className="@container/card">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <CardDescription className="flex items-center gap-2">
              <IconChartLine className="size-4" />
              Balance Change
            </CardDescription>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={
                  (balanceChangeData?.change || 0) >= 0
                    ? 'border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400'
                    : 'border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400'
                }
              >
                {(balanceChangeData?.change || 0) >= 0 ? (
                  <IconTrendingUp className="size-3" />
                ) : (
                  <IconTrendingDown className="size-3" />
                )}
                <AnimatedPercentage
                  value={balanceChangeData?.change || 0}
                  duration={0.4}
                  showSign={true}
                />
              </Badge>
            </div>
          </div>
          <CardTitle
            className={`text-2xl font-semibold tabular-nums @[250px]/card:text-3xl ${
              (balanceChangeData?.changeValue || 0) >= 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            <AnimatedCurrency
              value={balanceChangeData?.changeValue || 0}
              duration={0.4}
            />
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium items-center">
            {balanceChangeData?.change === 0 &&
            balanceChangeData?.changeValue === 0
              ? 'No change'
              : (balanceChangeData?.changeValue || 0) >= 0
                ? 'Balance increased'
                : 'Balance decreased'}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-6 px-2 text-xs bg-muted/50 hover:bg-muted border border-transparent hover:border-border data-[state=open]:border-primary data-[state=open]:bg-primary/10 focus-visible:border-primary focus-visible:bg-primary/5 focus-visible:outline-none focus-visible:ring-0 focus:outline-none focus:ring-0 transition-colors"
                >
                  <span className="mr-1">
                    {balanceChangePeriod === '1d'
                      ? 'Day'
                      : balanceChangePeriod === '1w'
                        ? 'Week'
                        : balanceChangePeriod === '1m'
                          ? 'Month'
                          : 'Year'}
                  </span>
                  <IconChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-20" align="start">
                {[
                  { value: '1d', label: 'Day' },
                  { value: '1w', label: 'Week' },
                  { value: '1m', label: 'Month' },
                  { value: '1y', label: 'Year' },
                ].map((period) => (
                  <DropdownMenuItem
                    key={period.value}
                    onClick={() => setBalanceChangePeriod(period.value)}
                    className="cursor-pointer text-sm"
                  >
                    {period.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="text-muted-foreground">
            {balanceChangeData?.change === 0 &&
            balanceChangeData?.changeValue === 0 &&
            balanceChangePeriod === '1d'
              ? 'Insufficient data for daily comparison'
              : balanceChangePeriod === '1d'
                ? 'Change in the last 24 hours'
                : balanceChangePeriod === '1w'
                  ? 'Change in the last week'
                  : balanceChangePeriod === '1m'
                    ? 'Change in the last month'
                    : 'Change in the last year'}
          </div>
        </CardFooter>
      </Card>

      {/* Realized P&L Card */}
      <Card className="@container/card">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <CardDescription className="flex items-center gap-2">
              <IconChartLine className="size-4" />
              Realized P&L
            </CardDescription>
            <Badge
              variant="outline"
              className={
                totalRealizedPnl >= 0
                  ? 'border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400'
                  : 'border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400'
              }
            >
              {totalRealizedPnl >= 0 ? (
                <IconTrendingUp className="size-3" />
              ) : (
                <IconTrendingDown className="size-3" />
              )}
              {totalRealizedPnl >= 0 ? 'Profit' : 'Loss'}
            </Badge>
          </div>
          <CardTitle
            className={`text-2xl font-semibold tabular-nums @[250px]/card:text-3xl ${
              totalRealizedPnl >= 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            <AnimatedCurrency value={totalRealizedPnl} duration={0.4} />
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {totalRealizedPnl >= 0
              ? 'Closed profitable trades'
              : 'Closed losing trades'}
          </div>
          <div className="text-muted-foreground">
            Locked-in profits and losses from completed trades
          </div>
        </CardFooter>
      </Card>

      {/* Unrealized P&L Card */}
      <Card className="@container/card">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <CardDescription className="flex items-center gap-2">
              <IconRocket className="size-4" />
              Unrealized P&L
            </CardDescription>
            <Badge
              variant="outline"
              className={
                totalUnrealizedPnl >= 0
                  ? 'border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400'
                  : 'border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400'
              }
            >
              {totalUnrealizedPnl >= 0 ? (
                <IconTrendingUp className="size-3" />
              ) : (
                <IconTrendingDown className="size-3" />
              )}
              {totalEquity > 0
                ? ((totalUnrealizedPnl / totalEquity) * 100).toFixed(2)
                : '0.00'}
              %
            </Badge>
          </div>
          <CardTitle
            className={`text-2xl font-semibold tabular-nums @[250px]/card:text-3xl ${
              totalUnrealizedPnl >= 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            <AnimatedCurrency value={totalUnrealizedPnl} duration={0.4} />
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {totalUnrealizedPnl >= 0
              ? 'Profitable positions'
              : 'Positions underwater'}
          </div>
          <div className="text-muted-foreground">
            {accountData?.totalPositions || 0} open position
            {accountData?.totalPositions !== 1 ? 's' : ''}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
