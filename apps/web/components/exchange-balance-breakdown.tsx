'use client';

import * as React from 'react';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ExchangeLogo } from '@/components/exchange-logo';

interface ExchangeData {
  exchange: string;
  balance: number;
  positionValue: number;
  unrealizedPnl: number;
  positionCount: number;
  timestamp: Date;
}

interface ExchangeBalanceBreakdownProps {
  selectedExchange: string;
  refreshInterval?: number;
}

// Exchange-specific colors
const EXCHANGE_COLORS: Record<string, string> = {
  binance: '#F3BA2F',
  okx: '#00DC82',
  coinbase: '#2463EB',
  default: 'hsl(var(--primary))',
};

export function ExchangeBalanceBreakdown({
  selectedExchange,
  refreshInterval = 10000,
}: ExchangeBalanceBreakdownProps) {
  const [exchangeData, setExchangeData] = React.useState<ExchangeData[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(
          `/api/analytics/account?period=30d&exchange=${selectedExchange}`,
        );

        if (response.ok) {
          const data = await response.json();
          setExchangeData(data.exchanges || []);
        }
      } catch (error) {
        console.error('Failed to fetch exchange data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [selectedExchange, refreshInterval]);

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return `$${value.toFixed(2)}`;
  };

  const formatCurrencyFull = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  if (loading) {
    return (
      <Card className="@container/card">
        <CardHeader>
          <CardTitle>Exchange Breakdown</CardTitle>
          <CardDescription>Balance distribution by exchange</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (exchangeData.length === 0) {
    return (
      <Card className="@container/card">
        <CardHeader>
          <CardTitle>Exchange Breakdown</CardTitle>
          <CardDescription>Balance distribution by exchange</CardDescription>
        </CardHeader>
        <CardContent className="flex h-[300px] items-center justify-center text-muted-foreground">
          <div className="text-center space-y-2">
            <p className="text-lg font-medium">No exchange data found</p>
            <p className="text-sm">Connect an exchange to see your balance breakdown</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Prepare chart data
  const chartData = exchangeData.map((ex) => ({
    name: ex.exchange.charAt(0).toUpperCase() + ex.exchange.slice(1),
    exchange: ex.exchange,
    balance: ex.balance,
    positionValue: ex.positionValue,
    total: ex.balance + ex.positionValue,
    fill: EXCHANGE_COLORS[ex.exchange.toLowerCase()] || EXCHANGE_COLORS.default,
  }));

  // Calculate totals
  const totalBalance = exchangeData.reduce((sum, ex) => sum + ex.balance, 0);
  const totalPositionValue = exchangeData.reduce((sum, ex) => sum + ex.positionValue, 0);

  // Custom tooltip
  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{
      payload: {
        name: string;
        exchange: string;
        balance: number;
        positionValue: number;
        total: number;
        fill: string;
      };
    }>;
  }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="rounded-lg border bg-background/95 backdrop-blur-sm shadow-lg p-3 min-w-[180px]">
          <div className="flex items-center gap-2 mb-2">
            <ExchangeLogo exchange={data.exchange} className="h-5 w-5" />
            <span className="font-medium">{data.name}</span>
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Balance:</span>
              <span className="font-medium tabular-nums">
                {formatCurrencyFull(data.balance)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Positions:</span>
              <span className="font-medium tabular-nums">
                {formatCurrencyFull(data.positionValue)}
              </span>
            </div>
            <div className="flex justify-between pt-1 border-t">
              <span className="text-muted-foreground">Total:</span>
              <span className="font-semibold tabular-nums">
                {formatCurrencyFull(data.total)}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Exchange Breakdown</CardTitle>
        <CardDescription>
          Balance and position value distribution by exchange
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col @lg/card:flex-row gap-6">
          {/* Bar Chart */}
          <div className="flex-1 min-h-[250px]">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <XAxis
                  type="number"
                  tickFormatter={formatCurrency}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  width={80}
                />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
                />
                <Bar dataKey="total" radius={[0, 4, 4, 0]} animationDuration={500}>
                  {chartData.map((entry, index) => (
                    <rect key={`bar-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Exchange Details List */}
          <div className="flex-1 flex flex-col gap-3 min-w-[200px]">
            <div className="text-sm font-medium text-muted-foreground mb-1">
              Exchange Details
            </div>
            <div className="space-y-3">
              {exchangeData.map((ex) => {
                const percentage =
                  totalBalance + totalPositionValue > 0
                    ? ((ex.balance + ex.positionValue) /
                        (totalBalance + totalPositionValue)) *
                      100
                    : 0;

                return (
                  <div
                    key={ex.exchange}
                    className="flex items-start justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <ExchangeLogo exchange={ex.exchange} className="h-8 w-8" />
                      <div>
                        <div className="font-medium capitalize">{ex.exchange}</div>
                        <div className="text-xs text-muted-foreground">
                          {ex.positionCount} position
                          {ex.positionCount !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold tabular-nums">
                        {formatCurrencyFull(ex.balance + ex.positionValue)}
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {percentage.toFixed(1)}% of total
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary */}
            <div className="mt-auto pt-3 border-t">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Cash:</span>
                <span className="font-medium tabular-nums">
                  {formatCurrencyFull(totalBalance)}
                </span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-muted-foreground">Total Positions:</span>
                <span className="font-medium tabular-nums">
                  {formatCurrencyFull(totalPositionValue)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
