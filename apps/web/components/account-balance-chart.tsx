'use client';

import * as React from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { useIsMobile } from '@/hooks/use-mobile';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Skeleton } from '@/components/ui/skeleton';

const chartConfig = {
  binance: {
    label: 'Binance',
    color: 'hsl(var(--chart-1))',
  },
  okx: {
    label: 'OKX',
    color: 'hsl(var(--chart-2))',
  },
  coinbase: {
    label: 'Coinbase',
    color: 'hsl(var(--chart-3))',
  },
} satisfies ChartConfig;

interface AccountBalanceChartProps {
  selectedExchange: string;
  refreshInterval?: number; // 轮询间隔（毫秒），默认 5000ms (5秒)
}

export function AccountBalanceChart({ 
  selectedExchange, 
  refreshInterval = 5000 
}: AccountBalanceChartProps) {
  const isMobile = useIsMobile();
  const [timeRange, setTimeRange] = React.useState('30d');
  const [chartData, setChartData] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [exchanges, setExchanges] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (isMobile) {
      setTimeRange('7d');
    }
  }, [isMobile]);

  React.useEffect(() => {
    let isFirstLoad = true;

    const fetchData = async () => {
      // Only show loading skeleton on first load
      if (isFirstLoad) {
        setLoading(true);
      }

      try {
        const response = await fetch(
          `/api/analytics/account?period=${timeRange}&exchange=${selectedExchange}`
        );
        if (response.ok) {
          const data = await response.json();
          setChartData(data.chartData || []);
          
          // Extract exchange names from data
          if (data.chartData && data.chartData.length > 0) {
            const exchangeNames = Object.keys(data.chartData[0]).filter(
              (key) => key !== 'date'
            );
            setExchanges(exchangeNames);
          }
        }
      } catch (error) {
        console.error('Failed to fetch chart data:', error);
      } finally {
        if (isFirstLoad) {
          setLoading(false);
          isFirstLoad = false;
        }
      }
    };

    fetchData();
    
    // Refresh data at configured interval
    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [timeRange, selectedExchange, refreshInterval]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getPeriodLabel = () => {
    switch (timeRange) {
      case '7d':
        return 'Last 7 days';
      case '90d':
        return 'Last 3 months';
      case '30d':
      default:
        return 'Last 30 days';
    }
  };

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Account Balance
          {selectedExchange !== 'all' && (
            <Badge variant="outline" className="text-xs capitalize font-normal">
              {selectedExchange}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          <span className="hidden @[540px]/card:block">
            {selectedExchange === 'all' 
              ? `Portfolio value over time • ${getPeriodLabel()}`
              : `${selectedExchange.charAt(0).toUpperCase() + selectedExchange.slice(1)} balance • ${getPeriodLabel()}`}
          </span>
          <span className="@[540px]/card:hidden">{getPeriodLabel()}</span>
        </CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            value={timeRange}
            onValueChange={(value) => value && setTimeRange(value)}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:!px-4 @[767px]/card:flex"
          >
            <ToggleGroupItem value="90d">3 months</ToggleGroupItem>
            <ToggleGroupItem value="30d">30 days</ToggleGroupItem>
            <ToggleGroupItem value="7d">7 days</ToggleGroupItem>
          </ToggleGroup>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger
              className="flex w-40 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden"
              size="sm"
              aria-label="Select time range"
            >
              <SelectValue placeholder="Last 30 days" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="90d" className="rounded-lg">
                Last 3 months
              </SelectItem>
              <SelectItem value="30d" className="rounded-lg">
                Last 30 days
              </SelectItem>
              <SelectItem value="7d" className="rounded-lg">
                Last 7 days
              </SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {loading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : chartData.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center text-muted-foreground">
            <div className="text-center">
              <p className="text-lg font-medium">No data available</p>
              <p className="text-sm">Start trading to see your account balance history</p>
            </div>
          </div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[300px] w-full"
          >
            <AreaChart data={chartData}>
              <defs>
                {exchanges.map((exchange, index) => (
                  <linearGradient
                    key={exchange}
                    id={`fill${exchange}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={`hsl(var(--chart-${index + 1}))`}
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor={`hsl(var(--chart-${index + 1}))`}
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return date.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  });
                }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={formatCurrency}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) => {
                      return new Date(value).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      });
                    }}
                    formatter={(value) => formatCurrency(value as number)}
                    indicator="dot"
                  />
                }
              />
              {exchanges.map((exchange, index) => (
                <Area
                  key={exchange}
                  dataKey={exchange}
                  type="monotone"
                  fill={`url(#fill${exchange})`}
                  stroke={`hsl(var(--chart-${index + 1}))`}
                  strokeWidth={2}
                  stackId="a"
                />
              ))}
              <ChartLegend content={<ChartLegendContent />} />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

