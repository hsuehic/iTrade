'use client';

import * as React from 'react';
import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Cell,
  ReferenceLine,
} from 'recharts';
import { useLocale } from 'next-intl';
import { Loader2 } from 'lucide-react';

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ChartConfig, ChartContainer, ChartTooltip } from '@/components/ui/chart';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Granularity = 'hour' | 'day' | 'month';

interface PnlDataPoint {
  date: string;
  total: number;
  [exchange: string]: string | number;
}

interface PnlBarChartProps {
  selectedExchange: string;
  refreshInterval?: number;
}

const chartConfig = {
  total: { label: 'Total P&L', color: '#60a5fa' },
  binance: { label: 'Binance', color: '#F3BA2F' },
  okx: { label: 'OKX', color: 'hsl(142,76%,36%)' },
  coinbase: { label: 'Coinbase', color: '#2463EB' },
} satisfies ChartConfig;

const POSITIVE_COLOR = 'hsl(142, 76%, 36%)';
const NEGATIVE_COLOR = 'hsl(0, 72%, 51%)';

export function PnlBarChart({
  selectedExchange,
  refreshInterval = 30000,
}: PnlBarChartProps) {
  const locale = useLocale();
  const [granularity, setGranularity] = React.useState<Granularity>('day');
  const [chartData, setChartData] = React.useState<PnlDataPoint[]>([]);
  const [exchanges, setExchanges] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let isFirstLoad = true;

    const fetchData = async () => {
      if (isFirstLoad) setLoading(true);
      try {
        const res = await fetch(
          `/api/analytics/pnl-chart?granularity=${granularity}&exchange=${selectedExchange}`,
        );
        if (res.ok) {
          const json = await res.json();
          const raw: PnlDataPoint[] = json.chartData || [];
          setChartData(raw);
          if (raw.length > 0) {
            const exKeys = Object.keys(raw[0]).filter(
              (k) => k !== 'date' && k !== 'total',
            );
            setExchanges(exKeys);
          }
        }
      } catch (err) {
        console.error('Failed to fetch P&L chart data:', err);
      } finally {
        if (isFirstLoad) {
          setLoading(false);
          isFirstLoad = false;
        }
      }
    };

    fetchData();
    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [granularity, selectedExchange, refreshInterval]);

  const formatCurrency = (value: number) => {
    const abs = Math.abs(value);
    const sign = value < 0 ? '-' : value > 0 ? '+' : '';
    if (abs >= 1_000_000) {
      return `${sign}${new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'USD',
        currencyDisplay: 'narrowSymbol',
        notation: 'compact',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(abs)}`;
    }
    if (abs >= 10_000) {
      return `${sign}${new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'USD',
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(abs)}`;
    }
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'USD',
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      signDisplay: 'exceptZero',
    }).format(value);
  };

  const formatXLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    if (granularity === 'month') {
      return d.toLocaleDateString(locale, { month: 'short', year: '2-digit' });
    }
    if (granularity === 'day') {
      return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
    }
    return d.toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const formatTooltipDate = (dateStr: string) => {
    const d = new Date(dateStr);
    if (granularity === 'month') {
      return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    }
    if (granularity === 'day') {
      return d.toLocaleDateString(locale, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
    return d.toLocaleString(locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const granularityLabel: Record<Granularity, string> = {
    hour: 'Last 24 hours (hourly)',
    day: 'Last 30 days (daily)',
    month: 'Last 12 months (monthly)',
  };

  const granularityShort: Record<Granularity, string> = {
    hour: 'Last 24h',
    day: 'Last 30d',
    month: 'Last 12m',
  };

  // Always use 'total' for the bar — per-exchange breakdown is in tooltip only.
  // This ensures correct bar positioning when exchanges have mixed positive/negative P&L.

  // Round up to the nearest "nice" number: 1/2/5 × 10^n
  const niceMax = (raw: number): number => {
    if (raw <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    if (norm <= 1) return mag;
    if (norm <= 2) return 2 * mag;
    if (norm <= 5) return 5 * mag;
    return 10 * mag;
  };

  // Symmetric domain around 0 with a nice round max value
  const calculateYDomain = (): [number, number] => {
    if (!chartData.length) return [-1, 1];
    let absMax = 0;
    chartData.forEach((d) => {
      const v = d['total'] as number;
      if (typeof v === 'number') absMax = Math.max(absMax, Math.abs(v));
    });
    const nice = niceMax(absMax * 1.1); // 10% headroom then round up
    return [-nice, nice];
  };

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">P&amp;L Chart</CardTitle>
        <CardDescription>
          <span className="hidden @[540px]/card:block">
            Net profit &amp; loss excluding deposits &amp; withdrawals •{' '}
            {granularityLabel[granularity]}
          </span>
          <span className="@[540px]/card:hidden">{granularityShort[granularity]}</span>
        </CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            value={granularity}
            onValueChange={(v) => v && setGranularity(v as Granularity)}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:!px-3 @[540px]/card:flex"
          >
            <ToggleGroupItem value="month">Monthly</ToggleGroupItem>
            <ToggleGroupItem value="day">Daily</ToggleGroupItem>
            <ToggleGroupItem value="hour">Hourly</ToggleGroupItem>
          </ToggleGroup>
          <Select
            value={granularity}
            onValueChange={(v) => setGranularity(v as Granularity)}
          >
            <SelectTrigger
              className="flex w-36 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[540px]/card:hidden"
              size="sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="month" className="rounded-lg">
                Monthly P&amp;L
              </SelectItem>
              <SelectItem value="day" className="rounded-lg">
                Daily P&amp;L
              </SelectItem>
              <SelectItem value="hour" className="rounded-lg">
                Hourly P&amp;L
              </SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {loading ? (
          <div className="flex h-[350px] w-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-[350px] items-center justify-center text-muted-foreground">
            <div className="text-center space-y-2">
              <p className="text-lg font-medium">No P&amp;L data available</p>
              <p className="text-sm">
                Start trading to see your profit &amp; loss history
              </p>
            </div>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[350px] w-full">
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 25 }}
              barCategoryGap="20%"
            >
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                stroke="#999999"
                strokeOpacity={0.3}
              />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                minTickGap={granularity === 'hour' ? 30 : 20}
                fontSize={11}
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={formatXLabel}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={90}
                fontSize={11}
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={formatCurrency}
                domain={calculateYDomain()}
                tickCount={5}
              />
              <ChartTooltip
                cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;

                  // The bar always uses 'total' dataKey, so payload[0].value is the total.
                  const totalVal = (payload[0]?.value as number) ?? 0;

                  // Look up per-exchange values from the raw chartData by date key.
                  const dateKey = label as string;
                  const dataPoint = chartData.find((d) => d.date === dateKey);
                  const showBreakdown =
                    selectedExchange === 'all' && exchanges.length > 1;

                  return (
                    <div className="rounded-lg border bg-background/95 backdrop-blur-sm shadow-lg p-3 min-w-[180px]">
                      <p className="text-sm font-medium text-foreground mb-2">
                        {formatTooltipDate(label)}
                      </p>
                      <div className="space-y-1">
                        {showBreakdown && dataPoint
                          ? exchanges.map((ex, i) => {
                              const val = (dataPoint[ex.toLowerCase()] as number) ?? 0;
                              const displayName =
                                chartConfig[ex.toLowerCase() as keyof typeof chartConfig]
                                  ?.label || ex.charAt(0).toUpperCase() + ex.slice(1);
                              return (
                                <div
                                  key={i}
                                  className="flex items-center justify-between gap-3"
                                >
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="w-2.5 h-2.5 rounded-sm"
                                      style={{
                                        backgroundColor:
                                          val >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR,
                                      }}
                                    />
                                    <span className="text-xs text-muted-foreground">
                                      {displayName}
                                    </span>
                                  </div>
                                  <span
                                    className="text-xs font-semibold tabular-nums"
                                    style={{
                                      color: val >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR,
                                    }}
                                  >
                                    {formatCurrency(val)}
                                  </span>
                                </div>
                              );
                            })
                          : null}
                      </div>
                      <div
                        className={
                          showBreakdown && exchanges.length > 1
                            ? 'mt-2 pt-2 border-t border-border/50 flex items-center justify-between'
                            : 'flex items-center justify-between'
                        }
                      >
                        <span className="text-xs font-medium text-muted-foreground">
                          {showBreakdown
                            ? 'Total'
                            : exchanges[0]
                              ? chartConfig[
                                  exchanges[0].toLowerCase() as keyof typeof chartConfig
                                ]?.label || exchanges[0]
                              : 'P&L'}
                        </span>
                        <span
                          className="text-xs font-bold tabular-nums"
                          style={{
                            color: totalVal >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR,
                          }}
                        >
                          {formatCurrency(totalVal)}
                        </span>
                      </div>
                    </div>
                  );
                }}
              />

              {/* Always render a single bar for 'total' — correct positioning for
                  mixed positive/negative exchanges. Per-exchange breakdown is in tooltip only. */}
              <ReferenceLine
                y={0}
                stroke="#888888"
                strokeWidth={1}
                ifOverflow="extendDomain"
                label={{
                  value: '$0',
                  position: 'insideLeft',
                  fontSize: 10,
                  fill: '#888888',
                  dy: -6,
                }}
              />
              <Bar dataKey="total" radius={[3, 3, 0, 0]} maxBarSize={48}>
                {chartData.map((entry, idx) => {
                  const val = entry['total'] as number;
                  return (
                    <Cell
                      key={idx}
                      fill={val >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR}
                      fillOpacity={0.85}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}

        {/* Summary row */}
        {!loading && chartData.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-4 px-2">
            {(() => {
              const total = chartData.reduce(
                (sum, d) => sum + ((d['total'] as number) || 0),
                0,
              );
              const positive = chartData.filter((d) => (d['total'] as number) > 0).length;
              const negative = chartData.filter((d) => (d['total'] as number) < 0).length;
              return (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Period total:</span>
                    <span
                      className="text-xs font-semibold tabular-nums"
                      style={{ color: total >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR }}
                    >
                      {formatCurrency(total)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-sm"
                      style={{ backgroundColor: POSITIVE_COLOR }}
                    />
                    <span className="text-xs text-muted-foreground">
                      {positive} profitable
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-sm"
                      style={{ backgroundColor: NEGATIVE_COLOR }}
                    />
                    <span className="text-xs text-muted-foreground">{negative} loss</span>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
