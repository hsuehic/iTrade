'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Wifi, WifiOff, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { MarketStatsCards } from './market-stats-cards';
import { PerpetualsTable } from './perpetuals-table';
import { MarketHeatmap } from './market-heatmap';
import { TopMovers } from './top-movers';
import { FundingRates } from './funding-rates';
import { cn } from '@/lib/utils';
import {
  type PerpetualTicker,
  type MarketStats,
  type BinancePerpTicker,
  type BinanceMarkPrice,
  PERPETUAL_SYMBOLS,
  formatPrice,
} from '@/lib/market-types';

// Price history length (for sparklines)
const PRICE_HISTORY_LENGTH = 30;

// WebSocket reconnect delay
const RECONNECT_DELAY = 3000;

export function MarketDashboard() {
  const [tickers, setTickers] = useState<Map<string, PerpetualTicker>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<
    'connecting' | 'connected' | 'disconnected'
  >('connecting');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);

  // WebSocket refs
  const binanceWsRef = useRef<WebSocket | null>(null);
  const binanceMarkPriceWsRef = useRef<WebSocket | null>(null);

  // Calculate market stats from tickers
  const marketStats = useCallback((): MarketStats => {
    const tickerArray = Array.from(tickers.values());
    if (tickerArray.length === 0) {
      return {
        totalVolume24h: 0,
        totalOpenInterest: 0,
        btcDominance: 0,
        avgFundingRate: 0,
        tickersCount: 0,
        gainersCount: 0,
        losersCount: 0,
      };
    }

    const totalVolume = tickerArray.reduce((sum, t) => sum + t.volume24h, 0);
    const totalOI = tickerArray.reduce((sum, t) => sum + t.openInterest, 0);
    const avgFunding =
      tickerArray.reduce((sum, t) => sum + t.fundingRate, 0) / tickerArray.length;
    const gainers = tickerArray.filter((t) => t.change24h > 0).length;
    const losers = tickerArray.filter((t) => t.change24h < 0).length;

    return {
      totalVolume24h: totalVolume,
      totalOpenInterest: totalOI,
      btcDominance: 0,
      avgFundingRate: avgFunding,
      tickersCount: tickerArray.length,
      gainersCount: gainers,
      losersCount: losers,
    };
  }, [tickers]);

  // Update ticker helper
  const updateTicker = useCallback(
    (symbol: string, updates: Partial<PerpetualTicker>) => {
      setTickers((prev) => {
        const newMap = new Map(prev);
        const existing = newMap.get(symbol);

        if (existing) {
          // Add price to history if price changed
          let priceHistory = existing.priceHistory;
          if (updates.price && updates.price !== existing.price) {
            priceHistory = [...existing.priceHistory, updates.price].slice(
              -PRICE_HISTORY_LENGTH,
            );
          }

          newMap.set(symbol, {
            ...existing,
            ...updates,
            priceHistory,
            lastUpdate: Date.now(),
          });
        } else {
          // Create new ticker
          const base = symbol.replace('USDT', '').replace('-USDT-SWAP', '');
          newMap.set(symbol, {
            symbol,
            displaySymbol: `${base}/USDT`,
            base,
            price: updates.price || 0,
            priceStr: updates.priceStr || '0',
            change24h: updates.change24h || 0,
            changePrice24h: updates.changePrice24h || 0,
            volume24h: updates.volume24h || 0,
            high24h: updates.high24h || 0,
            low24h: updates.low24h || 0,
            fundingRate: updates.fundingRate || 0,
            fundingTime: updates.fundingTime || 0,
            openInterest: updates.openInterest || 0,
            markPrice: updates.markPrice || 0,
            indexPrice: updates.indexPrice || 0,
            exchange: 'Binance',
            priceHistory: updates.price ? [updates.price] : [],
            lastUpdate: Date.now(),
          });
        }

        return newMap;
      });

      setLastUpdate(new Date());
    },
    [],
  );

  // Manual reconnect function
  const handleReconnect = useCallback(() => {
    binanceWsRef.current?.close();
    binanceMarkPriceWsRef.current?.close();
    setConnectionStatus('connecting');
    setReconnectTrigger((prev) => prev + 1);
  }, []);

  // Initialize WebSocket connections
  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let isMounted = true;

    const connect = () => {
      // 1. Connect to ticker stream for price data
      const streams = PERPETUAL_SYMBOLS.binance
        .map((s) => `${s.symbol.toLowerCase()}@ticker`)
        .join('/');
      const tickerWs = new WebSocket(
        `wss://fstream.binance.com/stream?streams=${streams}`,
      );
      binanceWsRef.current = tickerWs;

      tickerWs.onopen = () => {
        console.log('✅ Binance Futures ticker WebSocket connected');
        if (isMounted) setIsLoading(false);
      };

      tickerWs.onmessage = (event) => {
        try {
          const rawData = JSON.parse(event.data);
          if (rawData.data) {
            const ticker: BinancePerpTicker = rawData.data;
            const symbol = ticker.s;
            const price = parseFloat(ticker.c);
            const openPrice = parseFloat(ticker.o);
            const changePrice = price - openPrice;
            const changePercent = parseFloat(ticker.P);

            updateTicker(symbol, {
              price,
              priceStr: formatPrice(price),
              change24h: changePercent,
              changePrice24h: changePrice,
              volume24h: parseFloat(ticker.q),
              high24h: parseFloat(ticker.h),
              low24h: parseFloat(ticker.l),
            });
          }
        } catch (error) {
          console.error('Error parsing Binance ticker:', error);
        }
      };

      tickerWs.onerror = () => {
        if (isMounted) setConnectionStatus('disconnected');
      };

      tickerWs.onclose = () => {
        console.log('Binance ticker WebSocket disconnected');
        if (isMounted) {
          reconnectTimeout = setTimeout(connect, RECONNECT_DELAY);
        }
      };

      // 2. Connect to mark price stream for funding rates
      const markPriceStreams = PERPETUAL_SYMBOLS.binance
        .map((s) => `${s.symbol.toLowerCase()}@markPrice@1s`)
        .join('/');
      const markPriceWs = new WebSocket(
        `wss://fstream.binance.com/stream?streams=${markPriceStreams}`,
      );
      binanceMarkPriceWsRef.current = markPriceWs;

      markPriceWs.onopen = () => {
        console.log('✅ Binance mark price WebSocket connected');
        if (isMounted) setConnectionStatus('connected');
      };

      markPriceWs.onmessage = (event) => {
        try {
          const rawData = JSON.parse(event.data);
          if (rawData.data) {
            const markPrice: BinanceMarkPrice = rawData.data;
            updateTicker(markPrice.s, {
              markPrice: parseFloat(markPrice.p),
              indexPrice: parseFloat(markPrice.i),
              fundingRate: parseFloat(markPrice.r),
              fundingTime: markPrice.T,
            });
          }
        } catch (error) {
          console.error('Error parsing mark price:', error);
        }
      };

      markPriceWs.onerror = () => {
        if (isMounted) setConnectionStatus('disconnected');
      };

      markPriceWs.onclose = () => {
        console.log('Binance mark price WebSocket disconnected');
      };
    };

    connect();

    return () => {
      isMounted = false;
      binanceWsRef.current?.close();
      binanceMarkPriceWsRef.current?.close();
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [updateTicker, reconnectTrigger]);

  const tickerArray = Array.from(tickers.values());
  const stats = marketStats();

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header with connection status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-2"
          >
            <Zap className="size-6 text-yellow-500" />
            <h2 className="text-2xl font-bold">Perpetual Futures</h2>
          </motion.div>

          <Badge
            variant={connectionStatus === 'connected' ? 'default' : 'secondary'}
            className={cn(
              'gap-1',
              connectionStatus === 'connected' &&
                'bg-green-500/10 text-green-600 dark:text-green-400',
            )}
          >
            {connectionStatus === 'connected' ? (
              <Wifi className="size-3" />
            ) : (
              <WifiOff className="size-3" />
            )}
            {connectionStatus === 'connected' ? 'Live' : 'Connecting...'}
          </Badge>
        </div>

        <div className="flex items-center gap-4">
          {lastUpdate && (
            <span className="text-xs text-muted-foreground">
              Last update: {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={handleReconnect} className="gap-2">
            <RefreshCw className="size-4" />
            Reconnect
          </Button>
        </div>
      </div>

      {/* Market Stats */}
      <MarketStatsCards stats={stats} />

      {/* Main content with tabs */}
      <Tabs defaultValue="table" className="space-y-4">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="table" className="gap-2">
            📊 Table View
          </TabsTrigger>
          <TabsTrigger value="heatmap" className="gap-2">
            🎨 Heatmap
          </TabsTrigger>
          <TabsTrigger value="analysis" className="gap-2">
            📈 Analysis
          </TabsTrigger>
        </TabsList>

        <TabsContent value="table" className="mt-4">
          <PerpetualsTable tickers={tickerArray} />
        </TabsContent>

        <TabsContent value="heatmap" className="mt-4">
          <div className="grid gap-6 lg:grid-cols-2">
            <MarketHeatmap tickers={tickerArray} />
            <div className="space-y-6">
              <TopMovers tickers={tickerArray} type="gainers" />
              <TopMovers tickers={tickerArray} type="losers" />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="mt-4">
          <div className="grid gap-6 lg:grid-cols-2">
            <FundingRates tickers={tickerArray} />
            <div className="space-y-6">
              <TopMovers tickers={tickerArray} type="gainers" />
              <TopMovers tickers={tickerArray} type="losers" />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="size-6" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-6 w-20" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>

      <Skeleton className="h-12 w-80" />

      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}
