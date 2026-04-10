'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  IconArrowLeft,
  IconTrendingUp,
  IconTrendingDown,
  IconAlertTriangle,
  IconTarget,
  IconChartLine,
  IconArrowUp,
  IconArrowDown,
  IconActivity,
  IconClock,
  IconListDetails,
} from '@tabler/icons-react';

import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';

type Params = Promise<{ resultId: string }>;

interface BacktestResult {
  id: number;
  name?: string;
  totalReturn: string;
  annualizedReturn: string;
  sharpeRatio: string;
  maxDrawdown: string;
  winRate: string;
  profitFactor: string;
  totalTrades: number;
  avgTradeDuration: number;
  createdAt: string;
  strategy?: { id: number; name: string; type: string };
  config?: {
    id: number;
    name?: string;
    startDate: string;
    endDate: string;
    initialBalance: string;
    commission: string;
    slippage?: string;
  };
}

interface BacktestTrade {
  id: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  entryPrice: string;
  exitPrice: string;
  quantity: string;
  entryTime: string;
  exitTime: string;
  pnl: string;
  commission: string;
  duration: number;
  entryCashBalance?: string | null;
  entryPositionSize?: string | null;
  cashBalance?: string | null;
  positionSize?: string | null;
}

interface EquityPoint {
  timestamp: string;
  value: string;
}

const PAGE_SIZE = 50;

export default function BacktestResultDetailPage(props: { params: Params }) {
  const params = use(props.params);
  const resultId = parseInt(params.resultId, 10);

  const t = useTranslations('backtest');
  const locale = useLocale();
  const router = useRouter();

  const [result, setResult] = useState<BacktestResult | null>(null);
  const [trades, setTrades] = useState<BacktestTrade[]>([]);
  const [equityPoints, setEquityPoints] = useState<EquityPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [tradePage, setTradePage] = useState(0);

  const fetchResult = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/backtest/results/${resultId}?trades=true&equity=true`,
        { cache: 'no-store' },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || t('errors.fetchResultDetails'));
        return;
      }
      const data = await res.json();
      setResult(data.result);
      setTrades(data.result.trades || []);
      setEquityPoints(data.result.equity || []);
    } catch {
      toast.error(t('errors.fetchResultDetails'));
    } finally {
      setLoading(false);
    }
  }, [resultId, t]);

  useEffect(() => {
    if (!isNaN(resultId)) fetchResult();
  }, [resultId, fetchResult]);

  const formatNumber = (value: string | number | undefined, decimals = 2) => {
    if (value === undefined || value === null) return '-';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '-';
    return num.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatPercent = (value: string | number | undefined) => {
    if (value === undefined || value === null) return '-';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '-';
    return `${(num * 100).toFixed(2)}%`;
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  };

  const getReturnColor = (v: number) => (v >= 0 ? 'text-green-500' : 'text-red-500');

  const totalPages = Math.ceil(trades.length / PAGE_SIZE);
  const pagedTrades = trades.slice(tradePage * PAGE_SIZE, (tradePage + 1) * PAGE_SIZE);

  // Compute equity chart data with a baseline
  const initialBalance = result?.config?.initialBalance
    ? parseFloat(result.config.initialBalance)
    : undefined;

  const equityData = equityPoints.map((pt) => ({
    time: new Date(pt.timestamp).getTime(),
    value: parseFloat(pt.value),
  }));

  // Winning vs losing trade counts
  const winningTrades = trades.filter((t) => parseFloat(t.pnl) > 0).length;
  const losingTrades = trades.filter((t) => parseFloat(t.pnl) <= 0).length;

  // Flatten trades into individual order fills sorted by fill time.
  // Each trade = 1 entry order + 1 exit order.
  // Orders have no PnL — PnL belongs to the trade (entry+exit pair).
  type OrderFill = {
    key: string;
    fillTime: Date;
    type: 'entry' | 'exit';
    side: 'BUY' | 'SELL';
    price: string;
    quantity: string;
    cashBalance?: string | null;
    positionSize?: string | null;
    symbol: string;
    tradeId: number;
  };

  const orderFills: OrderFill[] = trades
    .flatMap((trade): OrderFill[] => {
      const entrySide = trade.side;
      const exitSide: 'BUY' | 'SELL' = trade.side === 'BUY' ? 'SELL' : 'BUY';
      return [
        {
          key: `entry-${trade.id}`,
          fillTime: new Date(trade.entryTime),
          type: 'entry',
          side: entrySide,
          price: trade.entryPrice,
          quantity: trade.quantity,
          // Post-entry state: cash decreases, position size increases
          cashBalance: trade.entryCashBalance ?? null,
          positionSize: trade.entryPositionSize ?? null,
          symbol: trade.symbol,
          tradeId: trade.id,
        },
        {
          key: `exit-${trade.id}`,
          fillTime: new Date(trade.exitTime),
          type: 'exit',
          side: exitSide,
          price: trade.exitPrice,
          quantity: trade.quantity,
          // Post-exit state: cash increases, position size decreases
          cashBalance: trade.cashBalance ?? null,
          positionSize: trade.positionSize ?? null,
          symbol: trade.symbol,
          tradeId: trade.id,
        },
      ];
    })
    .sort((a, b) => a.fillTime.getTime() - b.fillTime.getTime());

  const ORDER_PAGE_SIZE = 50;
  const [orderPage, setOrderPage] = useState(0);
  const totalOrderPages = Math.ceil(orderFills.length / ORDER_PAGE_SIZE);
  const pagedOrders = orderFills.slice(
    orderPage * ORDER_PAGE_SIZE,
    (orderPage + 1) * ORDER_PAGE_SIZE,
  );

  if (loading) {
    return (
      <SidebarInset>
        <SiteHeader title={t('result.title')} />
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-1/3" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </SidebarInset>
    );
  }

  if (!result) {
    return (
      <SidebarInset>
        <SiteHeader title={t('result.title')} />
        <div className="p-6 text-center space-y-4">
          <p className="text-muted-foreground">{t('result.notFound')}</p>
          <Button variant="link" onClick={() => router.push('/backtest')}>
            <IconArrowLeft className="mr-2 h-4 w-4" />
            {t('result.backToList')}
          </Button>
        </div>
      </SidebarInset>
    );
  }

  const totalReturnNum = parseFloat(result.totalReturn);
  const maxDrawdownNum = parseFloat(result.maxDrawdown);
  const pageTitle = result.name || result.strategy?.name || `Result #${result.id}`;

  // Absolute P&L: initial × totalReturn
  const absReturn =
    initialBalance !== undefined ? initialBalance * totalReturnNum : undefined;

  // Absolute max drawdown: peak equity × maxDrawdown
  const peakEquity =
    equityData.length > 0
      ? Math.max(...equityData.map((pt) => pt.value))
      : initialBalance;
  const absMaxDrawdown =
    peakEquity !== undefined ? peakEquity * maxDrawdownNum : undefined;

  return (
    <SidebarInset>
      <SiteHeader title={pageTitle} />
      <div className="flex flex-1 flex-col p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push('/backtest')}
                className="h-8 w-8 -ml-2"
              >
                <IconArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-2xl font-bold tracking-tight">{pageTitle}</h1>
              <Badge
                variant="outline"
                className={
                  totalReturnNum >= 0
                    ? 'bg-green-500/10 text-green-600 border-green-500/20'
                    : 'bg-red-500/10 text-red-600 border-red-500/20'
                }
              >
                {totalReturnNum >= 0 ? '+' : ''}
                {formatPercent(result.totalReturn)}
                {absReturn !== undefined && (
                  <span className="ml-1.5 opacity-75">
                    ({totalReturnNum >= 0 ? '+' : ''}${formatNumber(Math.abs(absReturn))})
                  </span>
                )}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground ml-8">
              {result.strategy && (
                <span className="font-medium text-foreground/80">
                  {result.strategy.name}
                </span>
              )}
              {result.config && (
                <span>
                  {new Date(result.config.startDate).toLocaleDateString(locale)}
                  {' – '}
                  {new Date(result.config.endDate).toLocaleDateString(locale)}
                </span>
              )}
              <span>{new Date(result.createdAt).toLocaleString(locale)}</span>
            </div>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('metrics.totalReturn')}
              </CardTitle>
              {totalReturnNum >= 0 ? (
                <IconTrendingUp className="h-4 w-4 text-green-500" />
              ) : (
                <IconTrendingDown className="h-4 w-4 text-red-500" />
              )}
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold font-mono ${getReturnColor(totalReturnNum)}`}
              >
                {totalReturnNum >= 0 ? '+' : ''}
                {formatPercent(result.totalReturn)}
              </div>
              {absReturn !== undefined && (
                <div className={`text-sm font-mono ${getReturnColor(totalReturnNum)}`}>
                  {totalReturnNum >= 0 ? '+' : '-'}${formatNumber(Math.abs(absReturn))}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {t('metrics.annualizedReturn')}: {formatPercent(result.annualizedReturn)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('metrics.sharpeRatio')}
              </CardTitle>
              <IconActivity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">
                {formatNumber(result.sharpeRatio)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('metrics.profitFactor')}: {formatNumber(result.profitFactor)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('metrics.maxDrawdown')}
              </CardTitle>
              <IconAlertTriangle className="h-4 w-4 text-red-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-red-500">
                -{formatPercent(result.maxDrawdown)}
              </div>
              {absMaxDrawdown !== undefined && absMaxDrawdown > 0 && (
                <div className="text-sm font-mono text-red-500">
                  -${formatNumber(absMaxDrawdown)}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {result.config && (
                  <>
                    {t('config.initial', {
                      amount: formatNumber(result.config.initialBalance),
                    })}
                  </>
                )}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('metrics.winRate')}
              </CardTitle>
              <IconTarget className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">
                {formatPercent(result.winRate)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {winningTrades}W / {losingTrades}L &nbsp;·&nbsp; {result.totalTrades}{' '}
                {t('metrics.totalTrades').toLowerCase()}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="chart" className="space-y-4">
          <TabsList>
            <TabsTrigger value="chart" className="flex items-center gap-1.5">
              <IconChartLine className="h-3.5 w-3.5" />
              {t('chart.equityCurve')}
            </TabsTrigger>
            <TabsTrigger value="trades" className="flex items-center gap-1.5">
              <IconListDetails className="h-3.5 w-3.5" />
              {t('trades.title')}
              {trades.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs h-4 px-1">
                  {trades.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="orders" className="flex items-center gap-1.5">
              <IconActivity className="h-3.5 w-3.5" />
              {t('orders.title')}
              {orderFills.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs h-4 px-1">
                  {orderFills.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Equity Curve Tab */}
          <TabsContent value="chart" className="space-y-4">
            {equityData.length > 0 ? (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <IconChartLine className="h-4 w-4 text-green-500" />
                    {t('chart.equityCurve')}
                  </CardTitle>
                  {result.config && (
                    <CardDescription>
                      {t('config.initial', {
                        amount: formatNumber(result.config.initialBalance),
                      })}
                      {' → '}
                      {initialBalance !== undefined
                        ? `$${formatNumber(initialBalance * (1 + totalReturnNum))}`
                        : equityData.length > 0
                          ? `$${formatNumber(equityData[equityData.length - 1].value)}`
                          : ''}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={340}>
                    <AreaChart
                      data={equityData}
                      margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#22c55e" stopOpacity={0.15} />
                          <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(var(--border))"
                        strokeOpacity={0.4}
                      />
                      <XAxis
                        dataKey="time"
                        type="number"
                        scale="time"
                        domain={['dataMin', 'dataMax']}
                        tickFormatter={(v) =>
                          new Date(v).toLocaleDateString(locale, {
                            month: 'short',
                            day: 'numeric',
                          })
                        }
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tickFormatter={(v) =>
                          `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : formatNumber(v, 0)}`
                        }
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                        width={60}
                      />
                      {initialBalance !== undefined && (
                        <ReferenceLine
                          y={initialBalance}
                          stroke="hsl(var(--muted-foreground))"
                          strokeDasharray="4 4"
                          strokeOpacity={0.5}
                          strokeWidth={1}
                        />
                      )}
                      <Tooltip
                        contentStyle={{
                          background: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          fontSize: 12,
                        }}
                        formatter={(v: number) => [
                          `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                          t('chart.equity'),
                        ]}
                        labelFormatter={(label) => new Date(label).toLocaleString(locale)}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#22c55e"
                        strokeWidth={1.5}
                        fill="url(#equityFill)"
                        dot={false}
                        activeDot={{ r: 3, fill: '#22c55e', strokeWidth: 0 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="flex items-center justify-center py-16">
                  <div className="text-center space-y-2">
                    <IconChartLine className="h-8 w-8 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">{t('chart.noData')}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Extra stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-1">
                  <CardDescription>{t('metrics.annualizedReturn')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div
                    className={`text-xl font-bold font-mono ${getReturnColor(parseFloat(result.annualizedReturn))}`}
                  >
                    {formatPercent(result.annualizedReturn)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardDescription>{t('metrics.profitFactor')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold font-mono">
                    {formatNumber(result.profitFactor)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardDescription>{t('metrics.totalTrades')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold font-mono">{result.totalTrades}</div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {winningTrades}W / {losingTrades}L
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardDescription className="flex items-center gap-1">
                    <IconClock className="h-3 w-3" />
                    {t('analysis.avgTradeDuration')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold font-mono">
                    {formatDuration(result.avgTradeDuration)}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Trades Tab */}
          <TabsContent value="trades" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <IconListDetails className="h-4 w-4" />
                  {t('trades.title')}
                </CardTitle>
                <CardDescription>
                  {t('trades.count', { count: trades.length })}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {trades.length === 0 ? (
                  <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                    {t('trades.empty')}
                  </div>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">#</TableHead>
                          <TableHead>{t('trades.table.symbol')}</TableHead>
                          <TableHead>{t('trades.table.side')}</TableHead>
                          <TableHead className="text-right">
                            {t('trades.table.entry')}
                          </TableHead>
                          <TableHead className="text-right">
                            {t('trades.table.exit')}
                          </TableHead>
                          <TableHead className="text-right">
                            {t('trades.table.quantity')}
                          </TableHead>
                          <TableHead className="text-right">
                            {t('trades.table.pnl')}
                          </TableHead>
                          <TableHead>{t('result.entryTime')}</TableHead>
                          <TableHead className="text-right">
                            {t('trades.table.duration')}
                          </TableHead>
                          <TableHead className="text-right">
                            {t('trades.table.equity')}
                          </TableHead>
                          <TableHead className="text-right">
                            {t('trades.table.positionSize')}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedTrades.map((trade, idx) => {
                          const pnlNum = parseFloat(trade.pnl);
                          return (
                            <TableRow key={trade.id}>
                              <TableCell className="text-xs text-muted-foreground font-mono">
                                {tradePage * PAGE_SIZE + idx + 1}
                              </TableCell>
                              <TableCell className="font-medium font-mono text-sm">
                                {trade.symbol}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={
                                    trade.side === 'BUY'
                                      ? 'bg-green-500/10 text-green-600 border-green-500/20'
                                      : 'bg-red-500/10 text-red-600 border-red-500/20'
                                  }
                                >
                                  {trade.side === 'BUY' ? (
                                    <IconArrowUp className="h-3 w-3 mr-1" />
                                  ) : (
                                    <IconArrowDown className="h-3 w-3 mr-1" />
                                  )}
                                  {trade.side === 'BUY'
                                    ? t('trades.side.buy')
                                    : t('trades.side.sell')}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                ${formatNumber(trade.entryPrice, 4)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                ${formatNumber(trade.exitPrice, 4)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {formatNumber(trade.quantity, 4)}
                              </TableCell>
                              <TableCell
                                className={`text-right font-bold font-mono text-sm ${
                                  pnlNum >= 0 ? 'text-green-600' : 'text-red-600'
                                }`}
                              >
                                {pnlNum >= 0 ? '+' : ''}${formatNumber(trade.pnl)}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {new Date(trade.entryTime).toLocaleString(locale, {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {formatDuration(trade.duration)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {trade.cashBalance != null
                                  ? `$${formatNumber(trade.cashBalance)}`
                                  : '—'}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {trade.positionSize != null
                                  ? formatNumber(trade.positionSize, 4)
                                  : '—'}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between px-4 py-3 border-t">
                        <p className="text-xs text-muted-foreground">
                          {t('result.tradesPage', {
                            from: tradePage * PAGE_SIZE + 1,
                            to: Math.min((tradePage + 1) * PAGE_SIZE, trades.length),
                            total: trades.length,
                          })}
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setTradePage((p) => Math.max(0, p - 1))}
                            disabled={tradePage === 0}
                          >
                            {t('result.prev')}
                          </Button>
                          <span className="text-xs text-muted-foreground">
                            {tradePage + 1} / {totalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setTradePage((p) => Math.min(totalPages - 1, p + 1))
                            }
                            disabled={tradePage >= totalPages - 1}
                          >
                            {t('result.next')}
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          {/* Orders Tab */}
          <TabsContent value="orders" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <IconActivity className="h-4 w-4" />
                  {t('orders.title')}
                </CardTitle>
                <CardDescription>
                  {t('orders.description', { count: orderFills.length })}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {orderFills.length === 0 ? (
                  <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                    {t('trades.empty')}
                  </div>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">#</TableHead>
                          <TableHead>{t('orders.fillTime')}</TableHead>
                          <TableHead>{t('orders.type')}</TableHead>
                          <TableHead>{t('trades.table.side')}</TableHead>
                          <TableHead>{t('trades.table.symbol')}</TableHead>
                          <TableHead className="text-right">
                            {t('orders.price')}
                          </TableHead>
                          <TableHead className="text-right">
                            {t('trades.table.quantity')}
                          </TableHead>
                          <TableHead className="text-right">
                            {t('trades.table.equity')}
                          </TableHead>
                          <TableHead className="text-right">
                            {t('trades.table.positionSize')}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedOrders.map((order, idx) => {
                          const isEntry = order.type === 'entry';
                          return (
                            <TableRow
                              key={order.key}
                              className={isEntry ? '' : 'bg-muted/20'}
                            >
                              <TableCell className="text-xs text-muted-foreground font-mono">
                                {orderPage * ORDER_PAGE_SIZE + idx + 1}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {order.fillTime.toLocaleString(locale, {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={
                                    isEntry
                                      ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                                      : 'bg-orange-500/10 text-orange-600 border-orange-500/20'
                                  }
                                >
                                  {isEntry ? t('orders.typeEntry') : t('orders.typeExit')}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={
                                    order.side === 'BUY'
                                      ? 'bg-green-500/10 text-green-600 border-green-500/20'
                                      : 'bg-red-500/10 text-red-600 border-red-500/20'
                                  }
                                >
                                  {order.side === 'BUY' ? (
                                    <IconArrowUp className="h-3 w-3 mr-1" />
                                  ) : (
                                    <IconArrowDown className="h-3 w-3 mr-1" />
                                  )}
                                  {order.side === 'BUY'
                                    ? t('trades.side.buy')
                                    : t('trades.side.sell')}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-medium font-mono text-sm">
                                {order.symbol}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                ${formatNumber(order.price, 4)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {formatNumber(order.quantity, 4)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {order.cashBalance != null
                                  ? `$${formatNumber(order.cashBalance)}`
                                  : '—'}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm">
                                {order.positionSize != null
                                  ? formatNumber(order.positionSize, 4)
                                  : '—'}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>

                    {/* Pagination */}
                    {totalOrderPages > 1 && (
                      <div className="flex items-center justify-between px-4 py-3 border-t">
                        <p className="text-xs text-muted-foreground">
                          {t('result.tradesPage', {
                            from: orderPage * ORDER_PAGE_SIZE + 1,
                            to: Math.min(
                              (orderPage + 1) * ORDER_PAGE_SIZE,
                              orderFills.length,
                            ),
                            total: orderFills.length,
                          })}
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setOrderPage((p) => Math.max(0, p - 1))}
                            disabled={orderPage === 0}
                          >
                            {t('result.prev')}
                          </Button>
                          <span className="text-xs text-muted-foreground">
                            {orderPage + 1} / {totalOrderPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setOrderPage((p) => Math.min(totalOrderPages - 1, p + 1))
                            }
                            disabled={orderPage >= totalOrderPages - 1}
                          >
                            {t('result.next')}
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </SidebarInset>
  );
}
