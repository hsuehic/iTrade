'use client';

/* eslint-disable react/prop-types */

import { useState, useEffect, useCallback, useMemo, use } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  AreaChart,
  Area,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Line,
  Scatter,
  Customized,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  strategy?: {
    id: number;
    name: string;
    type: string;
    marketType?: string;
    exchange?: string;
    symbol?: string | null;
    parameters?: Record<string, unknown>;
  };
  config?: {
    id: number;
    name?: string;
    startDate: string;
    endDate: string;
    initialBalance: string;
    commission: string;
    slippage?: string;
    symbols?: string[];
    timeframe?: string;
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

interface BacktestKline {
  openTime: string;
  closeTime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

interface BacktestKlineResponse {
  symbol: string;
  interval: string;
  klines: BacktestKline[];
  truncated?: boolean;
}

interface KlineChartPoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

type AxisScale = ((value: number) => number) & { bandwidth?: () => number };

interface ChartAxisMap {
  scale: AxisScale;
}

interface CandleLayerProps {
  data?: KlineChartPoint[];
  xAxisMap?: Record<string, ChartAxisMap>;
  yAxisMap?: Record<string, ChartAxisMap>;
  offset?: { left: number; top: number; width: number; height: number };
}

interface OrderTooltipData {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'entry' | 'exit';
  price: number;
  quantity: string;
  orderTime: number;
  tradeId: number;
  pnl?: string;
}

interface OrderClusterData {
  time: number;
  count: number;
  buyCount: number;
  sellCount: number;
  avgPrice: number;
  totalQuantity: number;
}

interface OrderMarkerData {
  time: number;
  price: number;
  side: 'BUY' | 'SELL';
  type: 'entry' | 'exit';
  isOrder: true;
  order: OrderTooltipData;
  cluster?: OrderClusterData;
}

interface KlineTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: Record<string, unknown> }>;
  label?: number;
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
  const [klineData, setKlineData] = useState<KlineChartPoint[]>([]);
  const [klineSymbol, setKlineSymbol] = useState<string | null>(null);
  const [klineInterval, setKlineInterval] = useState<string | null>(null);
  const [klineLoading, setKlineLoading] = useState(false);
  const [klineError, setKlineError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tradePage, setTradePage] = useState(0);

  const toBinanceSymbol = (symbol: string) => {
    const upper = symbol.toUpperCase();
    if (upper.includes(':')) {
      const [pair] = upper.split(':');
      return pair.replace('/', '');
    }
    return upper.replace('/', '');
  };

  const getIntervalMs = (interval: string) => {
    const amount = parseInt(interval, 10);
    const unit = interval.replace(String(amount), '');
    switch (unit) {
      case 'm':
        return amount * 60 * 1000;
      case 'h':
        return amount * 60 * 60 * 1000;
      case 'd':
        return amount * 24 * 60 * 60 * 1000;
      case 'w':
        return amount * 7 * 24 * 60 * 60 * 1000;
      default:
        return 60 * 1000;
    }
  };

  const fetchBinanceKlines = useCallback(
    async (symbol: string, interval: string): Promise<BacktestKline[]> => {
      if (!result?.config?.startDate || !result?.config?.endDate) return [];
      const endDate = new Date(result.config.endDate);
      const startDate = new Date(result.config.startDate);
      if (Number.isNaN(endDate.getTime()) || Number.isNaN(startDate.getTime())) return [];

      const intervalMs = getIntervalMs(interval);
      const limit = 1000;
      const targetStart = new Date(
        Math.max(startDate.getTime(), endDate.getTime() - intervalMs * limit),
      );
      const isFutures =
        result.strategy?.marketType === 'perpetual' ||
        result.strategy?.marketType === 'futures' ||
        symbol.includes(':') ||
        symbol.includes('_PERP');
      const baseUrl = isFutures ? 'https://fapi.binance.com' : 'https://api.binance.com';
      const endpoint = isFutures ? '/fapi/v1/klines' : '/api/v3/klines';
      const url = new URL(`${baseUrl}${endpoint}`);
      url.searchParams.set('symbol', toBinanceSymbol(symbol));
      url.searchParams.set('interval', interval);
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('startTime', String(targetStart.getTime()));
      const res = await fetch(url.toString());
      if (!res.ok) return [];
      const raw: Array<
        [number, string, string, string, string, string, number, string, number]
      > = await res.json();
      return raw
        .map((k) => ({
          openTime: new Date(k[0]).toISOString(),
          closeTime: new Date(k[6]).toISOString(),
          open: k[1],
          high: k[2],
          low: k[3],
          close: k[4],
          volume: k[5],
        }))
        .filter((k) => new Date(k.openTime) <= endDate);
    },
    [result],
  );

  const getNumericParam = (value: unknown) =>
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))
        ? Number(value)
        : null;

  const movingAverageType = useMemo(() => {
    const params = result?.strategy?.parameters as Record<string, unknown> | undefined;
    if (!params || typeof params.maType !== 'string') return null;
    const type = params.maType.toLowerCase();
    return type === 'ema' || type === 'sma' ? type : null;
  }, [result]);

  const movingAverageFastPeriod = useMemo(() => {
    const params = result?.strategy?.parameters as Record<string, unknown> | undefined;
    return params ? getNumericParam(params.fastPeriod) : null;
  }, [result]);

  const movingAverageSlowPeriod = useMemo(() => {
    const params = result?.strategy?.parameters as Record<string, unknown> | undefined;
    return params ? getNumericParam(params.slowPeriod) : null;
  }, [result]);

  const computeMovingAverage = useCallback(
    (data: KlineChartPoint[], period: number, type: 'sma' | 'ema') => {
      if (period <= 0 || data.length === 0) return [];
      if (type === 'sma') {
        const values: Array<number | null> = [];
        let sum = 0;
        data.forEach((point, index) => {
          sum += point.close;
          if (index >= period) {
            sum -= data[index - period].close;
          }
          values[index] = index >= period - 1 ? sum / period : null;
        });
        return values;
      }

      const values: Array<number | null> = [];
      let ema: number | null = null;
      const multiplier = 2 / (period + 1);
      data.forEach((point, index) => {
        if (index < period - 1) {
          values[index] = null;
          return;
        }
        if (index === period - 1) {
          const seed = data
            .slice(0, period)
            .reduce((total, current) => total + current.close, 0);
          ema = seed / period;
          values[index] = ema;
          return;
        }
        if (ema === null) {
          ema = point.close;
        } else {
          ema = (point.close - ema) * multiplier + ema;
        }
        values[index] = ema;
      });
      return values;
    },
    [],
  );

  const movingAverageFast = useMemo(() => {
    if (!movingAverageType || !movingAverageFastPeriod) return [];
    return computeMovingAverage(klineData, movingAverageFastPeriod, movingAverageType);
  }, [computeMovingAverage, klineData, movingAverageFastPeriod, movingAverageType]);

  const movingAverageSlow = useMemo(() => {
    if (!movingAverageType || !movingAverageSlowPeriod) return [];
    return computeMovingAverage(klineData, movingAverageSlowPeriod, movingAverageType);
  }, [computeMovingAverage, klineData, movingAverageSlowPeriod, movingAverageType]);

  const klineChartData = useMemo(
    () =>
      klineData.map((point, index) => ({
        ...point,
        maFast: movingAverageFast[index] ?? null,
        maSlow: movingAverageSlow[index] ?? null,
      })),
    [klineData, movingAverageFast, movingAverageSlow],
  );

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

  const getStrategyInterval = useCallback((strategy?: BacktestResult['strategy']) => {
    if (!strategy?.parameters) return null;
    const params = strategy.parameters as Record<string, unknown>;
    return typeof params.klineInterval === 'string' ? params.klineInterval : null;
  }, []);

  useEffect(() => {
    if (!isNaN(resultId)) fetchResult();
  }, [resultId, fetchResult]);

  const fetchKlines = useCallback(
    async (symbol: string, interval: string) => {
      try {
        setKlineLoading(true);
        setKlineError(null);
        const params = new URLSearchParams({
          symbol,
          interval,
          limit: '5000',
        });
        const res = await fetch(`/api/backtest/results/${resultId}/klines?${params}`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setKlineError(err.error || t('errors.fetchKlines'));
          setKlineData([]);
          return;
        }
        let data: BacktestKlineResponse = await res.json();
        if (
          data.klines.length === 0 &&
          result?.strategy?.exchange?.toLowerCase() === 'binance'
        ) {
          const fallback = await fetchBinanceKlines(symbol, interval);
          if (fallback.length > 0) {
            data = { ...data, klines: fallback };
          }
        }
        const parsed = data.klines
          .map((kline) => {
            const open = parseFloat(kline.open);
            const high = parseFloat(kline.high);
            const low = parseFloat(kline.low);
            const close = parseFloat(kline.close);
            const time = new Date(kline.openTime).getTime();
            if (![open, high, low, close, time].every((v) => Number.isFinite(v))) {
              return null;
            }
            return { time, open, high, low, close };
          })
          .filter((point): point is KlineChartPoint => point !== null);
        setKlineData(parsed);
        setKlineSymbol(data.symbol);
        setKlineInterval(data.interval);
      } catch {
        setKlineError(t('errors.fetchKlines'));
        setKlineData([]);
      } finally {
        setKlineLoading(false);
      }
    },
    [fetchBinanceKlines, resultId, result, t],
  );

  useEffect(() => {
    if (!result) return;
    const defaultSymbol =
      result.config?.symbols?.[0] ?? result.strategy?.symbol ?? trades[0]?.symbol ?? null;
    const defaultInterval =
      getStrategyInterval(result.strategy) ?? result.config?.timeframe;
    setKlineSymbol((current) => current ?? defaultSymbol);
    setKlineInterval((current) => current ?? defaultInterval ?? '1h');
  }, [result, trades, getStrategyInterval]);

  useEffect(() => {
    if (!klineSymbol || !klineInterval) return;
    fetchKlines(klineSymbol, klineInterval);
  }, [klineSymbol, klineInterval, fetchKlines]);

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

  const tradeById = useMemo(
    () => new Map(trades.map((trade) => [trade.id, trade])),
    [trades],
  );
  const tradeSymbols = Array.from(new Set(trades.map((trade) => trade.symbol)));
  const availableSymbols =
    result?.config?.symbols && result.config.symbols.length > 0
      ? result.config.symbols
      : tradeSymbols;

  const klineTimeRange = useMemo(() => {
    if (klineData.length === 0) return null;
    const times = klineData.map((point) => point.time);
    return {
      start: Math.min(...times),
      end: Math.max(...times),
    };
  }, [klineData]);

  const orderMarkers = useMemo<OrderMarkerData[]>(() => {
    const intervalMs = klineInterval ? getIntervalMs(klineInterval) : null;
    const rangeStart = klineTimeRange?.start ?? null;
    const clusterBuckets = new Map<number, OrderClusterData>();

    const filtered = orderFills
      .filter((order) => !klineSymbol || order.symbol === klineSymbol)
      .filter((order) => {
        if (!klineTimeRange) return true;
        const time = order.fillTime.getTime();
        return time >= klineTimeRange.start && time <= klineTimeRange.end;
      })
      .map<OrderMarkerData | null>((order) => {
        const price = parseFloat(order.price);
        if (!Number.isFinite(price)) return null;
        const time = order.fillTime.getTime();
        if (intervalMs && rangeStart !== null) {
          const bucketTime =
            Math.floor((time - rangeStart) / intervalMs) * intervalMs + rangeStart;
          const existing = clusterBuckets.get(bucketTime);
          const buyCount = existing?.buyCount ?? 0;
          const sellCount = existing?.sellCount ?? 0;
          const count = existing?.count ?? 0;
          const avgPrice = existing?.avgPrice ?? 0;
          const totalQuantity = existing?.totalQuantity ?? 0;
          const quantity = Number.isNaN(Number(order.quantity))
            ? 0
            : parseFloat(order.quantity);
          const nextCount = count + 1;
          clusterBuckets.set(bucketTime, {
            time: bucketTime,
            count: nextCount,
            buyCount: buyCount + (order.side === 'BUY' ? 1 : 0),
            sellCount: sellCount + (order.side === 'SELL' ? 1 : 0),
            avgPrice: (avgPrice * count + price) / nextCount,
            totalQuantity: totalQuantity + quantity,
          });
          return null;
        }

        const trade = tradeById.get(order.tradeId);
        return {
          time,
          price,
          side: order.side,
          type: order.type,
          isOrder: true,
          order: {
            symbol: order.symbol,
            side: order.side,
            type: order.type,
            price,
            quantity: order.quantity,
            orderTime: time,
            tradeId: order.tradeId,
            pnl: trade?.pnl,
          },
        };
      })
      .filter((order): order is OrderMarkerData => order !== null);

    if (intervalMs && rangeStart !== null) {
      const clustered: OrderMarkerData[] = Array.from(clusterBuckets.values())
        .filter((cluster) => cluster.count > 0)
        .map((cluster) => {
          const side: 'BUY' | 'SELL' =
            cluster.buyCount >= cluster.sellCount ? 'BUY' : 'SELL';
          return {
            time: cluster.time,
            price: cluster.avgPrice,
            side,
            type: 'entry',
            isOrder: true,
            order: {
              symbol: klineSymbol ?? '',
              side,
              type: 'entry',
              price: cluster.avgPrice,
              quantity: String(cluster.totalQuantity),
              orderTime: cluster.time,
              tradeId: -1,
            },
            cluster,
          };
        });
      if (clustered.length <= 400) return clustered;
      const step = Math.ceil(clustered.length / 400);
      return clustered.filter((_, index) => index % step === 0);
    }

    if (filtered.length <= 400) return filtered;
    const step = Math.ceil(filtered.length / 400);
    return filtered.filter((_, index) => index % step === 0);
  }, [klineInterval, klineSymbol, klineTimeRange, orderFills, tradeById]);

  const isOrderPayload = (payload: unknown): payload is OrderMarkerData =>
    typeof payload === 'object' &&
    payload !== null &&
    'isOrder' in payload &&
    (payload as { isOrder?: boolean }).isOrder === true;

  const isKlinePayload = (payload: unknown): payload is KlineChartPoint =>
    typeof payload === 'object' &&
    payload !== null &&
    'open' in payload &&
    'high' in payload &&
    'low' in payload &&
    'close' in payload &&
    'time' in payload &&
    typeof (payload as KlineChartPoint).open === 'number' &&
    typeof (payload as KlineChartPoint).high === 'number' &&
    typeof (payload as KlineChartPoint).low === 'number' &&
    typeof (payload as KlineChartPoint).close === 'number' &&
    typeof (payload as KlineChartPoint).time === 'number';

  type RenderOrderMarkerProps = {
    cx?: number;
    cy?: number;
    payload?: OrderMarkerData;
  };

  const renderOrderMarker = (props: unknown) => {
    const { cx, cy, payload } = props as RenderOrderMarkerProps;
    if (cx === undefined || cy === undefined || !payload) {
      return <g />;
    }
    const color = payload.side === 'BUY' ? '#22c55e' : '#ef4444';
    if (payload.cluster && payload.cluster.count > 1) {
      const radius = Math.min(10, 3 + payload.cluster.count * 0.5);
      return (
        <g>
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="hsl(var(--card))"
            stroke={color}
            strokeWidth={1.2}
            fillOpacity={0.85}
          />
          <text
            x={cx}
            y={cy + 3}
            textAnchor="middle"
            fontSize={Math.max(8, radius)}
            fill={color}
            fontWeight={600}
          >
            {payload.cluster.count}
          </text>
        </g>
      );
    }
    const size = 4;
    const isEntry = payload.type === 'entry';
    const points =
      payload.side === 'BUY'
        ? `${cx},${cy - size} ${cx - size},${cy + size} ${cx + size},${cy + size}`
        : `${cx},${cy + size} ${cx - size},${cy - size} ${cx + size},${cy - size}`;
    return (
      <polygon
        points={points}
        fill={isEntry ? color : 'hsl(var(--card))'}
        stroke={color}
        strokeWidth={1}
        fillOpacity={isEntry ? 0.85 : 0.65}
        strokeOpacity={0.85}
      />
    );
  };

  const renderCandles = (props: CandleLayerProps) => {
    if (!props.data || props.data.length === 0) return null;
    const xAxis = props.xAxisMap ? Object.values(props.xAxisMap)[0] : null;
    const yAxis = props.yAxisMap ? Object.values(props.yAxisMap)[0] : null;
    const xScale = xAxis?.scale;
    const yScale = yAxis?.scale;
    if (!xScale || !yScale || !props.offset) return null;
    const candleWidth = Math.min(
      8,
      Math.max(2, (props.offset.width / props.data.length) * 0.7),
    );

    return (
      <g>
        {props.data.map((point) => {
          const x = xScale(point.time);
          if (!Number.isFinite(x)) return null;
          const openY = yScale(point.open);
          const closeY = yScale(point.close);
          const highY = yScale(point.high);
          const lowY = yScale(point.low);
          const color = point.close >= point.open ? '#22c55e' : '#ef4444';
          const bodyTop = Math.min(openY, closeY);
          const bodyHeight = Math.max(1, Math.abs(openY - closeY));

          return (
            <g key={point.time}>
              <line
                x1={x}
                x2={x}
                y1={highY}
                y2={lowY}
                stroke={color}
                strokeOpacity={0.6}
                strokeWidth={1}
              />
              <rect
                x={x - candleWidth / 2}
                y={bodyTop}
                width={candleWidth}
                height={bodyHeight}
                fill={color}
                fillOpacity={0.75}
              />
            </g>
          );
        })}
      </g>
    );
  };

  const renderKlineTooltip = ({ active, payload }: KlineTooltipProps) => {
    if (!active || !payload || payload.length === 0) return null;
    const orderItem = payload.find(
      (item) => item.payload && isOrderPayload(item.payload),
    )?.payload;
    if (orderItem && isOrderPayload(orderItem)) {
      if (orderItem.cluster && orderItem.cluster.count > 1) {
        const cluster = orderItem.cluster;
        const dominantSide = cluster.buyCount >= cluster.sellCount ? 'BUY' : 'SELL';
        return (
          <div className="rounded-md border bg-card px-3 py-2 text-xs shadow-md">
            <div className="text-sm font-medium">
              {new Date(cluster.time).toLocaleString(locale)}
            </div>
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
              <span className="text-muted-foreground">{t('trades.table.side')}</span>
              <span className="text-right font-mono">
                {dominantSide === 'BUY' ? t('trades.side.buy') : t('trades.side.sell')}
              </span>
              <span className="text-muted-foreground">{t('orders.price')}</span>
              <span className="text-right font-mono">
                ${formatNumber(cluster.avgPrice, 4)}
              </span>
              <span className="text-muted-foreground">{t('orders.count')}</span>
              <span className="text-right font-mono">{cluster.count}</span>
              <span className="text-muted-foreground">{t('trades.table.quantity')}</span>
              <span className="text-right font-mono">
                {formatNumber(cluster.totalQuantity, 4)}
              </span>
              <span className="text-muted-foreground">{t('trades.side.buy')}</span>
              <span className="text-right font-mono">{cluster.buyCount}</span>
              <span className="text-muted-foreground">{t('trades.side.sell')}</span>
              <span className="text-right font-mono">{cluster.sellCount}</span>
            </div>
          </div>
        );
      }
      const order = orderItem.order;
      const isBuy = order.side === 'BUY';
      return (
        <div className="rounded-md border bg-card px-3 py-2 text-xs shadow-md">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className={isBuy ? 'text-green-600' : 'text-red-600'}>
              {isBuy ? t('trades.side.buy') : t('trades.side.sell')}
            </span>
            <span className="font-mono">{order.symbol}</span>
            <span className="text-muted-foreground">
              {order.type === 'entry' ? t('orders.typeEntry') : t('orders.typeExit')}
            </span>
          </div>
          <div className="text-muted-foreground">
            {new Date(order.orderTime).toLocaleString(locale)}
          </div>
          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
            <span className="text-muted-foreground">{t('orders.price')}</span>
            <span className="text-right font-mono">${formatNumber(order.price, 4)}</span>
            <span className="text-muted-foreground">{t('trades.table.quantity')}</span>
            <span className="text-right font-mono">
              {formatNumber(order.quantity, 4)}
            </span>
            {order.pnl && (
              <>
                <span className="text-muted-foreground">{t('trades.table.pnl')}</span>
                <span className="text-right font-mono">
                  {parseFloat(order.pnl) >= 0 ? '+' : ''}${formatNumber(order.pnl)}
                </span>
              </>
            )}
          </div>
        </div>
      );
    }

    const klineItem = payload.find(
      (item) => item.payload && isKlinePayload(item.payload),
    )?.payload;
    if (klineItem && isKlinePayload(klineItem)) {
      return (
        <div className="rounded-md border bg-card px-3 py-2 text-xs shadow-md">
          <div className="text-sm font-medium">
            {new Date(klineItem.time).toLocaleString(locale)}
          </div>
          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
            <span className="text-muted-foreground">{t('chart.open')}</span>
            <span className="text-right font-mono">
              ${formatNumber(klineItem.open, 4)}
            </span>
            <span className="text-muted-foreground">{t('chart.high')}</span>
            <span className="text-right font-mono">
              ${formatNumber(klineItem.high, 4)}
            </span>
            <span className="text-muted-foreground">{t('chart.low')}</span>
            <span className="text-right font-mono">
              ${formatNumber(klineItem.low, 4)}
            </span>
            <span className="text-muted-foreground">{t('chart.close')}</span>
            <span className="text-right font-mono">
              ${formatNumber(klineItem.close, 4)}
            </span>
          </div>
        </div>
      );
    }

    return null;
  };

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
            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <IconChartLine className="h-4 w-4 text-blue-500" />
                      {t('chart.kline')}
                    </CardTitle>
                    <CardDescription>{t('chart.klineDescription')}</CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {availableSymbols.length > 1 && (
                      <Select
                        value={klineSymbol ?? undefined}
                        onValueChange={(value) => setKlineSymbol(value)}
                      >
                        <SelectTrigger size="sm" className="h-8 text-xs">
                          <SelectValue placeholder={t('trades.table.symbol')} />
                        </SelectTrigger>
                        <SelectContent>
                          {availableSymbols.map((symbol) => (
                            <SelectItem key={symbol} value={symbol}>
                              {symbol}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {klineInterval && (
                      <Badge variant="secondary" className="text-xs">
                        {klineInterval}
                      </Badge>
                    )}
                    {movingAverageType && movingAverageFastPeriod && (
                      <Badge variant="outline" className="text-xs">
                        {`${movingAverageType.toUpperCase()} ${movingAverageFastPeriod}`}
                      </Badge>
                    )}
                    {movingAverageType && movingAverageSlowPeriod && (
                      <Badge variant="outline" className="text-xs">
                        {`${movingAverageType.toUpperCase()} ${movingAverageSlowPeriod}`}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {klineLoading ? (
                  <Skeleton className="h-72 w-full" />
                ) : klineChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <ComposedChart
                      data={klineChartData}
                      margin={{ top: 12, right: 24, left: 8, bottom: 8 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(var(--border))"
                        strokeOpacity={0.25}
                      />
                      <XAxis
                        dataKey="time"
                        type="number"
                        scale="time"
                        domain={['dataMin', 'dataMax']}
                        tickCount={6}
                        tickFormatter={(value) =>
                          new Date(value).toLocaleDateString(locale, {
                            month: 'short',
                            day: 'numeric',
                          })
                        }
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        domain={[
                          (min: number) => min * 0.98,
                          (max: number) => max * 1.02,
                        ]}
                        tickFormatter={(value) => `$${formatNumber(value, 2)}`}
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                        width={64}
                      />
                      <Tooltip
                        content={renderKlineTooltip}
                        cursor={{
                          stroke: 'hsl(var(--border))',
                          strokeDasharray: '3 3',
                        }}
                      />
                      <Customized component={renderCandles} data={klineChartData} />
                      <Line
                        type="monotone"
                        dataKey="close"
                        stroke="transparent"
                        dot={false}
                        activeDot={{ r: 3, fill: 'hsl(var(--foreground))' }}
                        isAnimationActive={false}
                      />
                      {movingAverageType && movingAverageFastPeriod && (
                        <Line
                          type="monotone"
                          dataKey="maFast"
                          stroke="#38bdf8"
                          strokeWidth={1.4}
                          dot={false}
                          connectNulls
                          isAnimationActive={false}
                        />
                      )}
                      {movingAverageType && movingAverageSlowPeriod && (
                        <Line
                          type="monotone"
                          dataKey="maSlow"
                          stroke="#f59e0b"
                          strokeWidth={1.4}
                          dot={false}
                          connectNulls
                          isAnimationActive={false}
                        />
                      )}
                      <Scatter
                        data={orderMarkers}
                        dataKey="price"
                        shape={renderOrderMarker}
                        isAnimationActive={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                    <IconChartLine className="h-8 w-8 text-muted-foreground" />
                    <span>{t('chart.noKlineData')}</span>
                    {klineError && (
                      <span className="text-xs text-destructive">{klineError}</span>
                    )}
                  </div>
                )}
                {!klineLoading && klineChartData.length > 0 && klineError && (
                  <p className="mt-2 text-xs text-destructive">{klineError}</p>
                )}
              </CardContent>
            </Card>
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
