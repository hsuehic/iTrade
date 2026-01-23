'use client';

import { useEffect, useState } from 'react';
import {
  IconTrendingDown,
  IconTrendingUp,
  IconWallet,
  IconLock,
  IconCoins,
  IconBuildingBank,
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

interface AccountSummary {
  totalBalance: number;
  totalPositionValue: number;
  totalEquity: number;
  totalUnrealizedPnl: number;
  totalPositions: number;
  balanceChange: number;
  period: string;
}

interface ExchangeData {
  exchange: string;
  balance: number;
  positionValue: number;
  unrealizedPnl: number;
  positionCount: number;
  timestamp: Date;
}

interface BalanceOverviewCardsProps {
  selectedExchange: string;
  refreshInterval?: number;
}

export function BalanceOverviewCards({
  selectedExchange,
  refreshInterval = 5000,
}: BalanceOverviewCardsProps) {
  const [accountData, setAccountData] = useState<AccountSummary | null>(null);
  const [exchangeData, setExchangeData] = useState<ExchangeData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(
          `/api/analytics/account?period=30d&exchange=${selectedExchange}`,
        );

        if (response.ok) {
          const data = await response.json();
          setAccountData(data.summary);
          setExchangeData(data.exchanges || []);
        }
      } catch (error) {
        console.error('Failed to fetch balance data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [selectedExchange, refreshInterval]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  const totalBalance = accountData?.totalBalance || 0;
  const totalEquity = accountData?.totalEquity || 0;
  const balanceChange = accountData?.balanceChange || 0;
  const totalPositionValue = accountData?.totalPositionValue || 0;

  // Calculate available and locked from equity distribution
  const availableBalance = totalBalance;
  const lockedInPositions = totalPositionValue;
  const exchangeCount = exchangeData.length;

  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {/* Total Equity Card */}
      <Card className="@container/card">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <CardDescription className="flex items-center gap-2">
              <IconCoins className="size-4" />
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
              {formatPercentage(balanceChange)}
            </Badge>
          </div>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatCurrency(totalEquity)}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Balance + Position Value
          </div>
          <div className="text-muted-foreground">
            {selectedExchange === 'all'
              ? `Across ${exchangeCount} exchange${exchangeCount !== 1 ? 's' : ''}`
              : `On ${selectedExchange}`}
          </div>
        </CardFooter>
      </Card>

      {/* Available Balance Card */}
      <Card className="@container/card">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <CardDescription className="flex items-center gap-2">
              <IconWallet className="size-4" />
              Available Balance
            </CardDescription>
          </div>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatCurrency(availableBalance)}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Free to trade or withdraw
          </div>
          <div className="text-muted-foreground">
            {totalEquity > 0
              ? `${((availableBalance / totalEquity) * 100).toFixed(1)}% of total equity`
              : 'No equity data'}
          </div>
        </CardFooter>
      </Card>

      {/* Locked in Positions Card */}
      <Card className="@container/card">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <CardDescription className="flex items-center gap-2">
              <IconLock className="size-4" />
              In Positions
            </CardDescription>
            <Badge variant="outline" className="text-muted-foreground">
              {accountData?.totalPositions || 0} position
              {accountData?.totalPositions !== 1 ? 's' : ''}
            </Badge>
          </div>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatCurrency(lockedInPositions)}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Value locked in open positions
          </div>
          <div className="text-muted-foreground">
            {totalEquity > 0
              ? `${((lockedInPositions / totalEquity) * 100).toFixed(1)}% of total equity`
              : 'No position data'}
          </div>
        </CardFooter>
      </Card>

      {/* Exchange Count / Distribution Card */}
      <Card className="@container/card">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <CardDescription className="flex items-center gap-2">
              <IconBuildingBank className="size-4" />
              Exchange Distribution
            </CardDescription>
          </div>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {exchangeCount} Exchange{exchangeCount !== 1 ? 's' : ''}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium flex-wrap">
            {exchangeData.slice(0, 3).map((ex, i) => (
              <span key={ex.exchange}>
                {ex.exchange}
                {i < Math.min(exchangeData.length, 3) - 1 && ', '}
              </span>
            ))}
            {exchangeData.length > 3 && (
              <span className="text-muted-foreground">
                +{exchangeData.length - 3} more
              </span>
            )}
          </div>
          <div className="text-muted-foreground">
            {selectedExchange === 'all'
              ? 'Portfolio distributed across exchanges'
              : `Viewing ${selectedExchange} only`}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
