'use client';

import { useEffect, useState } from 'react';
import {
  IconTrendingDown,
  IconTrendingUp,
  IconWallet,
  IconChartLine,
  IconRocket,
  IconChevronDown,
} from '@tabler/icons-react';
import { useLocale, useTranslations } from 'next-intl';

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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { fetchJsonShared } from '@/lib/fetch-json';

interface AccountSummary {
  totalBalance: number;
  totalPositionValue: number;
  totalEquity: number;
  totalUnrealizedPnl: number;
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

interface RealizedPnlData {
  value: number; // 账户级已实现盈亏（期内）
  unrealizedChange: number; // 同期未实现盈亏变动
  approximate: boolean; // 基线 uPnl 历史缺失时为 true
  period: string;
}

interface TradingDashboardCardsProps {
  selectedExchange: string;
  refreshInterval?: number; // 轮询间隔（毫秒），默认 5000ms (5秒)
}

export function TradingDashboardCards({
  selectedExchange,
  refreshInterval = 5000,
}: TradingDashboardCardsProps) {
  const t = useTranslations('dashboard.cards');
  const locale = useLocale();
  const [accountData, setAccountData] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [balanceChangeData, setBalanceChangeData] = useState<BalanceChangeData | null>(
    null,
  );
  const [balanceChangePeriod, setBalanceChangePeriod] = useState<string>('1m');
  const [rollingChangeData, setRollingChangeData] = useState<BalanceChangeData | null>(
    null,
  );
  const [rollingChangePeriod, setRollingChangePeriod] = useState<string>('1m');
  const [realizedPnlData, setRealizedPnlData] = useState<RealizedPnlData | null>(null);
  const [realizedPeriod, setRealizedPeriod] = useState<string>('1m');

  // Main account data
  useEffect(() => {
    const fetchMainData = async () => {
      try {
        const accountJson = await fetchJsonShared<{ summary: AccountSummary }>(
          `/api/analytics/account?period=30d&exchange=${selectedExchange}`,
        );
        if (accountJson) {
          setAccountData(accountJson.summary);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchMainData();

    // Refresh main data at configured interval
    const interval = setInterval(fetchMainData, refreshInterval);
    return () => clearInterval(interval);
  }, [selectedExchange, refreshInterval]);

  // Calendar-aligned balance change
  useEffect(() => {
    const fetchBalanceChangeData = async () => {
      const json = await fetchJsonShared<{
        summary: { balanceChange: number; balanceChangeValue?: number };
      }>(
        `/api/analytics/account?period=${balanceChangePeriod}&align=calendar&exchange=${selectedExchange}`,
      );
      if (json) {
        setBalanceChangeData({
          change: json.summary.balanceChange,
          changeValue: json.summary.balanceChangeValue ?? 0,
          period: balanceChangePeriod,
        });
      }
    };
    fetchBalanceChangeData();
  }, [selectedExchange, balanceChangePeriod]);

  // Rolling-window balance change
  useEffect(() => {
    const fetchRollingChangeData = async () => {
      const json = await fetchJsonShared<{
        summary: { balanceChange: number; balanceChangeValue?: number };
      }>(
        `/api/analytics/account?period=${rollingChangePeriod}&align=rolling&exchange=${selectedExchange}`,
      );
      if (json) {
        setRollingChangeData({
          change: json.summary.balanceChange,
          changeValue: json.summary.balanceChangeValue ?? 0,
          period: rollingChangePeriod,
        });
      }
    };
    fetchRollingChangeData();
  }, [selectedExchange, rollingChangePeriod]);

  // Account-level realized P&L (calendar-aligned, same endpoint family as the
  // other period cards; identical URLs share one in-flight request and the
  // server applies a short analytics cache, so no extra DB load)
  useEffect(() => {
    const fetchRealizedPnlData = async () => {
      const json = await fetchJsonShared<{
        summary: {
          realizedPnl?: number | null;
          unrealizedPnlChange?: number | null;
          realizedPnlApproximate?: boolean;
        };
      }>(
        `/api/analytics/account?period=${realizedPeriod}&align=calendar&exchange=${selectedExchange}`,
      );
      if (json) {
        setRealizedPnlData({
          value: json.summary.realizedPnl ?? 0,
          unrealizedChange: json.summary.unrealizedPnlChange ?? 0,
          approximate: json.summary.realizedPnlApproximate === true,
          period: realizedPeriod,
        });
      }
    };
    fetchRealizedPnlData();
  }, [selectedExchange, realizedPeriod]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => (
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'USD',
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatPercentage = (value: number, showSign = true) => {
    const formatted = Math.abs(value).toFixed(2);
    const sign = value >= 0 ? '+' : '-';
    return showSign ? `${sign}${formatted}%` : `${formatted}%`;
  };

  const totalBalance = accountData?.totalBalance || 0;
  const totalEquity = accountData?.totalEquity || 0;
  const realizedPnlValue = realizedPnlData?.value ?? 0;
  const totalUnrealizedPnl = accountData?.totalUnrealizedPnl || 0;
  // Card 1's badge/trend show ONLY the calendar-period figure (same source as
  // Card 2). Deliberately no fallback to the 30d main fetch: that would flash
  // the rolling 30d % before the calendar figure arrives. Until the calendar
  // data loads we render skeletons instead.
  const balanceChange = balanceChangeData?.change ?? 0;
  const periodLabels: Record<string, string> = {
    '1d': t('period.day'),
    '1w': t('period.week'),
    '1m': t('period.month'),
    '1y': t('period.year'),
  };

  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-5">
      {/* Balance Card */}
      <Card className="@container/card">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <CardDescription className="flex items-center gap-2 whitespace-nowrap">
              <IconWallet className="size-4 shrink-0" />
              {t('balanceTitle')}
            </CardDescription>
            {balanceChangeData ? (
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
                {formatPercentage(balanceChange)}
              </Badge>
            ) : (
              <Skeleton className="h-5 w-16" />
            )}
          </div>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatCurrency(totalBalance)}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          {balanceChangeData ? (
            <div className="line-clamp-1 flex gap-2 font-medium">
              {balanceChange >= 0 ? t('balanceTrend.up') : t('balanceTrend.down')}
              {balanceChange >= 0 ? (
                <IconTrendingUp className="size-4 text-green-500" />
              ) : (
                <IconTrendingDown className="size-4 text-red-500" />
              )}
            </div>
          ) : (
            <Skeleton className="h-4 w-24" />
          )}
          <div className="text-muted-foreground">
            {selectedExchange === 'all'
              ? t('balanceFooterAll')
              : t('balanceFooterSingle', { exchange: selectedExchange })}
          </div>
        </CardFooter>
      </Card>

      {/* Balance Change Card */}
      <Card className="@container/card">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <CardDescription className="flex items-center gap-2 whitespace-nowrap">
              <IconChartLine className="size-4 shrink-0" />
              {t('balanceChangeTitle')}
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
                {formatPercentage(balanceChangeData?.change || 0)}
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
            {formatCurrency(balanceChangeData?.changeValue || 0)}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium items-center">
            <span className="whitespace-nowrap">
              {balanceChangeData?.change === 0 && balanceChangeData?.changeValue === 0
                ? t('balanceChangeStatus.none')
                : (balanceChangeData?.changeValue || 0) >= 0
                  ? t('balanceChangeStatus.increased')
                  : t('balanceChangeStatus.decreased')}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-6 px-2 text-xs bg-muted/50 hover:bg-muted border border-transparent hover:border-border data-[state=open]:border-primary data-[state=open]:bg-primary/10 focus-visible:border-primary focus-visible:bg-primary/5 focus-visible:outline-none focus-visible:ring-0 focus:outline-none focus:ring-0 transition-colors"
                >
                  <span className="mr-1">
                    {periodLabels[balanceChangePeriod] || balanceChangePeriod}
                  </span>
                  <IconChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-20" align="start">
                {[
                  { value: '1d', label: periodLabels['1d'] },
                  { value: '1w', label: periodLabels['1w'] },
                  { value: '1m', label: periodLabels['1m'] },
                  { value: '1y', label: periodLabels['1y'] },
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
              ? selectedExchange === 'all'
                ? t('balanceChangeDescription.noDataAll')
                : t('balanceChangeDescription.noDataSingle')
              : balanceChangePeriod === '1d'
                ? t('balanceChangeDescription.lastDay')
                : balanceChangePeriod === '1w'
                  ? t('balanceChangeDescription.lastWeek')
                  : balanceChangePeriod === '1m'
                    ? t('balanceChangeDescription.lastMonth')
                    : t('balanceChangeDescription.lastYear')}
          </div>
        </CardFooter>
      </Card>

      {/* Rolling Change Card */}
      <Card className="@container/card">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <CardDescription className="flex items-center gap-2 whitespace-nowrap">
              <IconChartLine className="size-4 shrink-0" />
              {t('rollingChangeTitle')}
            </CardDescription>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={
                  (rollingChangeData?.change || 0) >= 0
                    ? 'border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400'
                    : 'border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400'
                }
              >
                {(rollingChangeData?.change || 0) >= 0 ? (
                  <IconTrendingUp className="size-3" />
                ) : (
                  <IconTrendingDown className="size-3" />
                )}
                {formatPercentage(rollingChangeData?.change || 0)}
              </Badge>
            </div>
          </div>
          <CardTitle
            className={`text-2xl font-semibold tabular-nums @[250px]/card:text-3xl ${
              (rollingChangeData?.changeValue || 0) >= 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {formatCurrency(rollingChangeData?.changeValue || 0)}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium items-center">
            <span className="whitespace-nowrap">
              {rollingChangeData?.change === 0 && rollingChangeData?.changeValue === 0
                ? t('balanceChangeStatus.none')
                : (rollingChangeData?.changeValue || 0) >= 0
                  ? t('balanceChangeStatus.increased')
                  : t('balanceChangeStatus.decreased')}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-6 px-2 text-xs bg-muted/50 hover:bg-muted border border-transparent hover:border-border data-[state=open]:border-primary data-[state=open]:bg-primary/10 focus-visible:border-primary focus-visible:bg-primary/5 focus-visible:outline-none focus-visible:ring-0 focus:outline-none focus:ring-0 transition-colors"
                >
                  <span className="mr-1">
                    {periodLabels[rollingChangePeriod] || rollingChangePeriod}
                  </span>
                  <IconChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-20" align="start">
                {[
                  { value: '1d', label: periodLabels['1d'] },
                  { value: '1w', label: periodLabels['1w'] },
                  { value: '1m', label: periodLabels['1m'] },
                  { value: '1y', label: periodLabels['1y'] },
                ].map((period) => (
                  <DropdownMenuItem
                    key={period.value}
                    onClick={() => setRollingChangePeriod(period.value)}
                    className="cursor-pointer text-sm"
                  >
                    {period.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="text-muted-foreground">
            {rollingChangePeriod === '1d'
              ? t('rollingChangeDescription.lastDay')
              : rollingChangePeriod === '1w'
                ? t('rollingChangeDescription.lastWeek')
                : rollingChangePeriod === '1m'
                  ? t('rollingChangeDescription.lastMonth')
                  : t('rollingChangeDescription.lastYear')}
          </div>
        </CardFooter>
      </Card>

      {/* Realized P&L Card */}
      <Card className="@container/card">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <CardDescription className="flex items-center gap-2 whitespace-nowrap">
              <IconChartLine className="size-4 shrink-0" />
              {t('realizedTitle')}
            </CardDescription>
            <Badge
              variant="outline"
              className={
                realizedPnlValue >= 0
                  ? 'border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400'
                  : 'border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400'
              }
            >
              {realizedPnlValue >= 0 ? (
                <IconTrendingUp className="size-3" />
              ) : (
                <IconTrendingDown className="size-3" />
              )}
              {realizedPnlValue >= 0 ? t('profit') : t('loss')}
            </Badge>
          </div>
          <CardTitle
            className={`text-2xl font-semibold tabular-nums @[250px]/card:text-3xl ${
              realizedPnlValue >= 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            }`}
            title={realizedPnlData?.approximate ? t('realizedApproximate') : undefined}
          >
            {realizedPnlData?.approximate ? '≈' : ''}
            {formatCurrency(realizedPnlValue)}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium items-center">
            <span className="whitespace-nowrap">
              {realizedPnlValue >= 0
                ? t('realizedStatus.positive')
                : t('realizedStatus.negative')}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-6 px-2 text-xs bg-muted/50 hover:bg-muted border border-transparent hover:border-border data-[state=open]:border-primary data-[state=open]:bg-primary/10 focus-visible:border-primary focus-visible:bg-primary/5 focus-visible:outline-none focus-visible:ring-0 focus:outline-none focus:ring-0 transition-colors"
                >
                  <span className="mr-1">
                    {periodLabels[realizedPeriod] || realizedPeriod}
                  </span>
                  <IconChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-20" align="start">
                {[
                  { value: '1d', label: periodLabels['1d'] },
                  { value: '1w', label: periodLabels['1w'] },
                  { value: '1m', label: periodLabels['1m'] },
                  { value: '1y', label: periodLabels['1y'] },
                ].map((period) => (
                  <DropdownMenuItem
                    key={period.value}
                    onClick={() => setRealizedPeriod(period.value)}
                    className="cursor-pointer text-sm"
                  >
                    {period.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="text-muted-foreground">
            {realizedPeriod === '1d'
              ? t('realizedDescription.lastDay')
              : realizedPeriod === '1w'
                ? t('realizedDescription.lastWeek')
                : realizedPeriod === '1m'
                  ? t('realizedDescription.lastMonth')
                  : t('realizedDescription.lastYear')}
          </div>
        </CardFooter>
      </Card>

      {/* Unrealized P&L Card */}
      <Card className="@container/card">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <CardDescription className="flex items-center gap-2">
              <IconRocket className="size-4" />
              {t('unrealizedTitle')}
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
            {formatCurrency(totalUnrealizedPnl)}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {totalUnrealizedPnl >= 0
              ? t('unrealizedStatus.positive')
              : t('unrealizedStatus.negative')}
          </div>
          <div className="text-muted-foreground">
            {t('openPositions', { count: accountData?.totalPositions || 0 })}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
