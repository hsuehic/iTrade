'use client';

import * as React from 'react';
import { CartesianGrid, XAxis, YAxis, Area, AreaChart } from 'recharts';
import { useLocale, useTranslations } from 'next-intl';

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
} from '@/components/ui/chart';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Loader2 } from 'lucide-react';

interface ChartDataPoint {
  date: string;
  [exchange: string]: string | number;
}

interface AccountBalanceChartProps {
  selectedExchange: string;
  refreshInterval?: number; // 轮询间隔（毫秒），默认 5000ms (5秒)
}

export function AccountBalanceChart({
  selectedExchange,
  refreshInterval = 5000,
}: AccountBalanceChartProps) {
  const t = useTranslations('dashboard.balanceChart');
  const locale = useLocale();
  const isMobile = useIsMobile();
  const [timeRange, setTimeRange] = React.useState('1d');
  const [chartData, setChartData] = React.useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [exchanges, setExchanges] = React.useState<string[]>([]);
  const updateTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const chartConfig = {
    binance: {
      label: t('exchange.binance'),
      color: '#F3BA2F',
    },
    okx: {
      label: t('exchange.okx'),
      color: 'hsl(142,76%,36%)',
    },
    coinbase: {
      label: t('exchange.coinbase'),
      color: '#2463EB',
    },
  } satisfies ChartConfig;

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
          `/api/analytics/account?period=${timeRange}&exchange=${selectedExchange}`,
        );
        if (response.ok) {
          const data = await response.json();
          const newChartData = data.chartData || [];

          if (isFirstLoad || timeRange !== '1h') {
            // For first load or non-realtime views, replace all data
            setChartData(newChartData);
          } else {
            // For 1-hour view, implement sliding window update with debounce
            if (updateTimeoutRef.current) {
              clearTimeout(updateTimeoutRef.current);
            }

            updateTimeoutRef.current = setTimeout(() => {
              setChartData((prevData) => {
                if (!prevData.length || !newChartData.length) {
                  return newChartData;
                }

                // Get the latest timestamp from previous data
                const latestPrevTime = new Date(
                  prevData[prevData.length - 1]?.date,
                ).getTime();

                // Find new data points that are newer than our latest
                const newPoints = newChartData.filter(
                  (point: ChartDataPoint) =>
                    new Date(point.date).getTime() > latestPrevTime,
                );

                if (newPoints.length === 0) {
                  return prevData; // No new data
                }

                // Combine previous data with new points
                let updatedData = [...prevData, ...newPoints];

                // Keep only last 60 data points for smooth scrolling (1 hour of minute data)
                const maxPoints = 60;
                if (updatedData.length > maxPoints) {
                  updatedData = updatedData.slice(-maxPoints);
                }

                return updatedData;
              });
            }, 100); // 100ms debounce for smoother updates
          }

          // Extract exchange names from data
          if (data.chartData && data.chartData.length > 0) {
            const exchangeNames = Object.keys(data.chartData[0]).filter(
              (key) => key !== 'date',
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
    return () => {
      clearInterval(interval);
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [timeRange, selectedExchange, refreshInterval]);

  const formatCurrency = (value: number) => {
    // Smart formatting based on value magnitude
    if (value >= 1000000) {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
        notation: 'compact',
        compactDisplay: 'short',
      }).format(value);
    } else if (value >= 10000) {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    } else {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    }
  };

  const formatTooltipCurrency = (value: number) => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const getPeriodLabel = () => {
    switch (timeRange) {
      case '7d':
        return t('period.last7Days');
      case '90d':
        return t('period.last3Months');
      case '1d':
        return t('period.last1Day');
      case '1h':
        return t('period.last1Hour');
      case '30d':
      default:
        return t('period.last30Days');
    }
  };

  // Calculate Y-axis domain based on data range
  const calculateYAxisDomain = () => {
    if (!chartData || chartData.length === 0) return ['auto', 'auto'];

    let min = Infinity;
    let max = -Infinity;

    chartData.forEach((item) => {
      exchanges.forEach((exchange) => {
        const value = item[exchange];
        if (typeof value === 'number' && !isNaN(value)) {
          min = Math.min(min, value);
          max = Math.max(max, value);
        }
      });
    });

    if (min === Infinity || max === -Infinity) return ['auto', 'auto'];

    // Add 5% padding on both sides for better visualization
    const range = max - min;
    const padding = range * 0.05;

    return [
      Math.max(0, min - padding), // Don't go below 0 for financial data
      max + padding,
    ];
  };

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">{t('title')}</CardTitle>
        <CardDescription>
          <span className="hidden @[540px]/card:block">
            {selectedExchange === 'all'
              ? t('subtitleAll', { period: getPeriodLabel() })
              : t('subtitleSingle', {
                  exchange:
                    selectedExchange.charAt(0).toUpperCase() + selectedExchange.slice(1),
                  period: getPeriodLabel(),
                })}
          </span>
          <span className="@[540px]/card:hidden">{getPeriodLabel()}</span>
        </CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            value={timeRange}
            onValueChange={(value) => value && setTimeRange(value)}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:!px-3 @[767px]/card:flex"
          >
            <ToggleGroupItem value="90d">{t('range.3m')}</ToggleGroupItem>
            <ToggleGroupItem value="30d">{t('range.30d')}</ToggleGroupItem>
            <ToggleGroupItem value="7d">{t('range.7d')}</ToggleGroupItem>
            <ToggleGroupItem value="1d">{t('range.1d')}</ToggleGroupItem>
            <ToggleGroupItem value="1h">{t('range.1h')}</ToggleGroupItem>
          </ToggleGroup>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger
              className="flex w-40 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden"
              size="sm"
              aria-label={t('rangeSelectLabel')}
            >
              <SelectValue placeholder={t('period.last30Days')} />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="90d" className="rounded-lg">
                {t('period.last3Months')}
              </SelectItem>
              <SelectItem value="30d" className="rounded-lg">
                {t('period.last30Days')}
              </SelectItem>
              <SelectItem value="7d" className="rounded-lg">
                {t('period.last7Days')}
              </SelectItem>
              <SelectItem value="1d" className="rounded-lg">
                {t('period.last1Day')}
              </SelectItem>
              <SelectItem value="1h" className="rounded-lg">
                {t('period.last1Hour')}
              </SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {loading ? (
          <div className="flex h-[450px] w-full items-center justify-center rounded-md bg-transparent">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-[450px] items-center justify-center text-muted-foreground">
            <div className="text-center space-y-2">
              <p className="text-lg font-medium">{t('empty.title')}</p>
              <p className="text-sm">{t('empty.description')}</p>
            </div>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[450px] w-full">
            <AreaChart
              data={chartData}
              margin={{ top: 30, right: 40, left: 25, bottom: 25 }}
            >
              <defs>
                {/* Gradient fills for each exchange */}
                {exchanges.map((exchange) => (
                  <linearGradient
                    key={`gradient-${exchange}`}
                    id={`gradient-${exchange}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={
                        chartConfig[exchange as keyof typeof chartConfig]?.color ||
                        'hsl(var(--primary))'
                      }
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="50%"
                      stopColor={
                        chartConfig[exchange as keyof typeof chartConfig]?.color ||
                        'hsl(var(--primary))'
                      }
                      stopOpacity={0.1}
                    />
                    <stop
                      offset="100%"
                      stopColor={
                        chartConfig[exchange as keyof typeof chartConfig]?.color ||
                        'hsl(var(--primary))'
                      }
                      stopOpacity={0.0}
                    />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid
                horizontal={true}
                vertical={true}
                strokeDasharray="3 3"
                stroke="#999999"
                strokeOpacity={0.3}
                strokeWidth={1}
              />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={12}
                minTickGap={40}
                fontSize={12}
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(value) => {
                  const date = new Date(value);
                  if (timeRange === '1h') {
                    return date.toLocaleTimeString(locale, {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    });
                  } else if (timeRange === '1d') {
                    return date.toLocaleTimeString(locale, {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    });
                  } else {
                    return date.toLocaleDateString(locale, {
                      month: 'short',
                      day: 'numeric',
                    });
                  }
                }}
              />
              <YAxis
                tickLine={true}
                axisLine={true}
                tickMargin={16}
                width={85}
                fontSize={12}
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                domain={calculateYAxisDomain()}
                tickFormatter={formatCurrency}
                tickCount={8}
              />
              <ChartTooltip
                cursor={{
                  stroke: 'hsl(var(--border))',
                  strokeWidth: 1,
                  strokeDasharray: '3 3',
                }}
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;

                  const date = new Date(label);
                  let formattedDate;

                  if (timeRange === '1h') {
                    formattedDate = date.toLocaleString(locale, {
                      weekday: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    });
                  } else if (timeRange === '1d') {
                    formattedDate = date.toLocaleString(locale, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    });
                  } else {
                    formattedDate = date.toLocaleDateString(locale, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    });
                  }

                  return (
                    <div className="rounded-lg border bg-background/95 backdrop-blur-sm shadow-lg p-3 min-w-[200px]">
                      <div className="text-sm font-medium text-foreground mb-2">
                        {formattedDate}
                      </div>
                      <div className="space-y-1">
                        {payload.map((entry, index) => {
                          const exchangeName = entry.dataKey as string;
                          const displayName =
                            chartConfig[exchangeName as keyof typeof chartConfig]
                              ?.label ||
                            exchangeName.charAt(0).toUpperCase() + exchangeName.slice(1);

                          return (
                            <div
                              key={index}
                              className="flex items-center justify-between gap-3"
                            >
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-3 h-3 rounded-sm"
                                  style={{ backgroundColor: entry.color }}
                                />
                                <span className="text-sm font-medium text-muted-foreground">
                                  {displayName}
                                </span>
                              </div>
                              <span className="text-sm font-semibold text-foreground tabular-nums">
                                {formatTooltipCurrency(entry.value as number)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      {payload.length > 1 && (
                        <div className="mt-2 pt-2 border-t border-border/50">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-muted-foreground">
                              {t('total')}
                            </span>
                            <span className="text-sm font-semibold text-foreground tabular-nums">
                              {formatTooltipCurrency(
                                payload.reduce(
                                  (sum, entry) => sum + (entry.value as number),
                                  0,
                                ),
                              )}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              {exchanges.map((exchange) => (
                <Area
                  key={exchange}
                  type="monotone"
                  dataKey={exchange}
                  stroke={chartConfig[exchange as keyof typeof chartConfig]?.color}
                  strokeWidth={1}
                  fill={`url(#gradient-${exchange})`}
                  fillOpacity={1}
                  dot={
                    chartData.length <= 10
                      ? {
                          r: 1.5,
                          strokeWidth: 2,
                          fill: 'hsl(var(--background))',
                          stroke:
                            chartConfig[exchange as keyof typeof chartConfig]?.color,
                          filter: 'drop-shadow(0 2px 4px rgb(0 0 0 / 0.15))',
                        }
                      : false
                  }
                  activeDot={{
                    r: 5,
                    strokeWidth: 2,
                    fill: chartConfig[exchange as keyof typeof chartConfig]?.color,
                    stroke: 'hsl(var(--background))',
                    filter: 'drop-shadow(0 4px 8px rgb(0 0 0 / 0.2))',
                  }}
                  animationDuration={timeRange === '1h' ? 800 : 400}
                  animationEasing="ease-out"
                  connectNulls
                  strokeLinecap="round"
                  strokeLinejoin="round"
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
