'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { TickerCard, type TickerData } from './ticker-card';
import { Skeleton } from '@/components/ui/skeleton';

// Same order for both exchanges
const COMMON_COINS = ['BTC', 'ETH', 'SOL', 'APT', 'WLD', 'OP'];

const BINANCE_COINS = COMMON_COINS.map((base) => ({
  symbol: `${base}USDT`,
  display: `${base}/USDT`,
  base,
}));

const OKX_COINS = COMMON_COINS.map((base) => ({
  symbol: `${base}-USDT-SWAP`,
  display: `${base}/USDT`,
  base,
}));

// Create lookup maps for precise matching between API symbols and Display symbols
const BINANCE_SYMBOL_MAP = new Map(BINANCE_COINS.map((c) => [c.symbol, c.display]));
const OKX_SYMBOL_MAP = new Map(OKX_COINS.map((c) => [c.symbol, c.display]));

interface BinanceTickerData {
  e: string; // Event type
  s: string; // Symbol
  c: string; // Last price
  o: string; // Open price
  h: string; // High price
  l: string; // Low price
  q: string; // Total traded quote asset volume
  P: string; // Price change percent
}

interface OKXTickerData {
  arg: {
    channel: string;
    instId: string;
  };
  data: {
    instId: string;
    last: string;
    open24h: string;
    high24h: string;
    low24h: string;
    volCcy24h: string;
  }[];
}

// Helper function to trim trailing zeros from price strings
const trimTrailingZeros = (priceStr: string): string => {
  // If it contains a decimal point, remove trailing zeros
  if (priceStr.includes('.')) {
    // Remove trailing zeros after decimal point
    let trimmed = priceStr.replace(/(\.\d*?)0+$/, '$1');
    // If only decimal point remains, remove it too
    trimmed = trimmed.replace(/\.$/, '');
    return trimmed;
  }
  return priceStr;
};

export function TickerGrid() {
  const t = useTranslations('landing.ticker');

  // Initialize with placeholder data in correct order
  const [binanceTickers, setBinanceTickers] = useState<TickerData[]>(
    BINANCE_COINS.map((coin) => ({
      symbol: coin.display,
      price: '0',
      change24h: 0,
      volume24h: 0,
      high24h: '0',
      low24h: '0',
      exchange: 'Binance',
    })),
  );
  const [okxTickers, setOkxTickers] = useState<TickerData[]>(
    OKX_COINS.map((coin) => ({
      symbol: coin.display,
      price: '0',
      change24h: 0,
      volume24h: 0,
      high24h: '0',
      low24h: '0',
      exchange: 'OKX',
    })),
  );
  const [loading, setLoading] = useState(true);
  const [_connectionStatus, setConnectionStatus] = useState<
    'connecting' | 'websocket' | 'error'
  >('connecting');

  // WebSocket refs
  const binanceWsRef = useRef<WebSocket | null>(null);
  const okxWsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Data buffers for throttling
  const latestBinanceDataRef = useRef<Map<string, TickerData>>(new Map());
  const latestOkxDataRef = useRef<Map<string, TickerData>>(new Map());

  // Track visible cards (kept for potential future optimization or debugging)
  const visibleCardsRef = useRef<Set<string>>(new Set());

  // Handle visibility change for ticker cards
  const handleVisibilityChange = useCallback((tickerId: string, visible: boolean) => {
    // With global throttling, individual visibility tracking for updates is less critical for performance
    // but can still be kept if we want to pause purely rendering processing.
    if (visible) {
      visibleCardsRef.current.add(tickerId);
    } else {
      visibleCardsRef.current.delete(tickerId);
    }
  }, []);

  useEffect(() => {
    let binanceConnected = false;
    let okxConnected = false;

    const updateTicker = (
      tickerData: Partial<TickerData>,
      exchange: 'Binance' | 'OKX',
      symbol: string,
    ) => {
      // Resolve display symbol strictly using the map, with fallback parsing
      let displaySymbol = symbol;

      if (exchange === 'Binance') {
        if (BINANCE_SYMBOL_MAP.has(symbol)) {
          displaySymbol = BINANCE_SYMBOL_MAP.get(symbol)!;
        } else if (symbol.endsWith('USDT')) {
          displaySymbol = symbol.replace('USDT', '/USDT');
        }
      } else if (exchange === 'OKX') {
        if (OKX_SYMBOL_MAP.has(symbol)) {
          displaySymbol = OKX_SYMBOL_MAP.get(symbol)!;
        } else if (symbol.includes('-SWAP')) {
          const base = symbol.split('-')[0];
          displaySymbol = `${base}/USDT`;
        } else if (symbol.includes('-')) {
          displaySymbol = symbol.replace('-', '/');
        }
      }

      const fullTickerData: TickerData = {
        symbol: displaySymbol,
        price: tickerData.price || '0',
        change24h: tickerData.change24h || 0,
        volume24h: tickerData.volume24h || 0,
        high24h: tickerData.high24h,
        low24h: tickerData.low24h,
        exchange,
      };

      // Update the latest data refs immediately with the resolved display symbol
      if (exchange === 'Binance') {
        latestBinanceDataRef.current.set(displaySymbol, fullTickerData);
      } else {
        latestOkxDataRef.current.set(displaySymbol, fullTickerData);
      }
    };

    // Throttled update flush loop
    const flushUpdates = () => {
      // Flush Binance updates if needed
      if (latestBinanceDataRef.current.size > 0) {
        // Create a snapshot of the current updates to avoid race conditions with state updates
        const updates = new Map(latestBinanceDataRef.current);
        latestBinanceDataRef.current.clear();

        setBinanceTickers((prev) => {
          let hasChanges = false;
          const next = prev.map((t) => {
            // Look up update using the display symbol (e.g., BTC/USDT)
            const update = updates.get(t.symbol);
            if (update) {
              hasChanges = true;
              return update;
            }
            return t;
          });

          if (hasChanges) {
            return next;
          }
          return prev;
        });
      }

      // Flush OKX updates if needed
      if (latestOkxDataRef.current.size > 0) {
        // Create a snapshot of the current updates
        const updates = new Map(latestOkxDataRef.current);
        latestOkxDataRef.current.clear();

        setOkxTickers((prev) => {
          let hasChanges = false;
          const next = prev.map((t) => {
            const update = updates.get(t.symbol);
            if (update) {
              hasChanges = true;
              return update;
            }
            return t;
          });

          if (hasChanges) {
            return next;
          }
          return prev;
        });
      }
    };

    // Start the flush loop (every 1000ms = 1s)
    const intervalId = setInterval(flushUpdates, 1000);

    // Connect to Binance WebSocket (Futures)
    const connectBinance = () => {
      const streams = BINANCE_COINS.map(
        (coin) => `${coin.symbol.toLowerCase()}@ticker`,
      ).join('/');
      // Use fstream.binance.com for Futures
      const ws = new WebSocket(`wss://fstream.binance.com/stream?streams=${streams}`);
      binanceWsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ Binance Futures WebSocket connected directly');
        binanceConnected = true;
        if (okxConnected) {
          setConnectionStatus('websocket');
          setLoading(false);
        }
      };

      ws.onmessage = (event) => {
        try {
          const rawData = JSON.parse(event.data);
          if (rawData.data) {
            const ticker: BinanceTickerData = rawData.data;
            const price = parseFloat(ticker.c);
            const open = parseFloat(ticker.o);
            const change24h = open > 0 ? ((price - open) / open) * 100 : 0;

            console.log(`[Binance WS] ${ticker.s}: $${trimTrailingZeros(ticker.c)}`);

            updateTicker(
              {
                price: trimTrailingZeros(ticker.c),
                change24h,
                volume24h: parseFloat(ticker.q),
                high24h: trimTrailingZeros(ticker.h),
                low24h: trimTrailingZeros(ticker.l),
              },
              'Binance',
              ticker.s,
            );
          }
        } catch (error) {
          console.error('Error parsing Binance message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('Binance WebSocket error:', error);
        setConnectionStatus('error');
      };

      ws.onclose = () => {
        console.log('Binance WebSocket disconnected');
        binanceConnected = false;
        // Reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connectBinance();
        }, 3000);
      };
    };

    // Connect to OKX WebSocket
    const connectOKX = () => {
      const ws = new WebSocket('wss://ws.okx.com/ws/v5/public');
      okxWsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ OKX WebSocket connected directly');

        // Subscribe to ticker channels
        const subscribeMsg = {
          op: 'subscribe',
          args: OKX_COINS.map((coin) => ({
            channel: 'tickers',
            instId: coin.symbol,
          })),
        };

        ws.send(JSON.stringify(subscribeMsg));
        okxConnected = true;
        if (binanceConnected) {
          setConnectionStatus('websocket');
          setLoading(false);
        }
      };

      ws.onmessage = (event) => {
        try {
          const message: OKXTickerData = JSON.parse(event.data);
          if (message.data && message.data.length > 0) {
            const tickerData = message.data[0];
            const open24h = parseFloat(tickerData.open24h);
            const last = parseFloat(tickerData.last);
            const changePercent = open24h > 0 ? ((last - open24h) / open24h) * 100 : 0;

            console.log(`[OKX WS] ${tickerData.instId}: $${tickerData.last}`);

            updateTicker(
              {
                price: tickerData.last,
                change24h: changePercent,
                volume24h: parseFloat(tickerData.volCcy24h),
                high24h: tickerData.high24h,
                low24h: tickerData.low24h,
              },
              'OKX',
              tickerData.instId,
            );
          }
        } catch (error) {
          console.error('Error parsing OKX message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('OKX WebSocket error:', error);
        setConnectionStatus('error');
      };

      ws.onclose = () => {
        console.log('OKX WebSocket disconnected');
        okxConnected = false;
        // Reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connectOKX();
        }, 3000);
      };
    };

    // Initialize connections
    connectBinance();
    connectOKX();

    // Cleanup on unmount
    return () => {
      if (binanceWsRef.current) {
        binanceWsRef.current.close();
      }
      if (okxWsRef.current) {
        okxWsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      clearInterval(intervalId);
    };
  }, []);

  if (loading) {
    return (
      <section className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <h2 className="mb-2 text-3xl font-bold">{t('loadingTitle')}</h2>
          <p className="text-muted-foreground">{t('loadingSubtitle')}</p>
        </div>
        <div className="space-y-12">
          {/* Binance Skeleton */}
          <div>
            <h3 className="mb-4 text-xl font-semibold">{t('binance')}</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {BINANCE_COINS.map((coin) => (
                <div key={coin.symbol} className="space-y-3 rounded-lg border p-4">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          </div>
          {/* OKX Skeleton */}
          <div>
            <h3 className="mb-4 text-xl font-semibold">{t('okx')}</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {OKX_COINS.map((coin) => (
                <div key={coin.symbol} className="space-y-3 rounded-lg border p-4">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
      <div className="mb-8 text-center">
        <h2 className="mb-2 text-3xl font-bold">{t('title')}</h2>
        <div className="flex items-center justify-center gap-2">
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>

      <div className="space-y-12">
        {/* Binance Tickers */}
        <div>
          <div className="mb-4 flex items-center gap-3">
            <Image
              src="/exchange-logos/binance.png"
              alt="Binance"
              width={32}
              height={32}
              className="rounded-full"
            />
            <h3 className="text-xl font-semibold">{t('binance')}</h3>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {binanceTickers.map((ticker, index) => {
              const tickerId = `${ticker.exchange}-${ticker.symbol}`;
              return (
                <TickerCard
                  key={tickerId}
                  ticker={ticker}
                  index={index}
                  onVisibilityChange={(visible) =>
                    handleVisibilityChange(tickerId, visible)
                  }
                />
              );
            })}
          </div>
        </div>

        {/* OKX Tickers */}
        <div>
          <div className="mb-4 flex items-center gap-3">
            <Image
              src="/exchange-logos/okx.svg"
              alt="OKX"
              width={32}
              height={32}
              className="rounded-full"
            />
            <h3 className="text-xl font-semibold">{t('okx')}</h3>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {okxTickers.map((ticker, index) => {
              const tickerId = `${ticker.exchange}-${ticker.symbol}`;
              return (
                <TickerCard
                  key={tickerId}
                  ticker={ticker}
                  index={index}
                  onVisibilityChange={(visible) =>
                    handleVisibilityChange(tickerId, visible)
                  }
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
