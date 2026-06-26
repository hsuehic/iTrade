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

const OKX_COINS = COMMON_COINS.map((base) => {
  const display = `${base}/USDT`;
  const swapSymbol = `${base}-USDT-SWAP`;
  const spotSymbol = `${base}-USDT`;
  const instIds =
    base === 'APT' || base === 'WLD' ? [swapSymbol, spotSymbol] : [swapSymbol];

  return {
    display,
    base,
    instIds,
  };
});

// Create lookup maps for precise matching between API symbols and Display symbols
const BINANCE_SYMBOL_MAP = new Map(BINANCE_COINS.map((c) => [c.symbol, c.display]));
const OKX_SYMBOL_MAP = new Map(
  OKX_COINS.flatMap((coin) => coin.instIds.map((instId) => [instId, coin.display])),
);

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
  if (priceStr.includes('.')) {
    let trimmed = priceStr.replace(/(\.\d*?)0+$/, '$1');
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
  const binanceReconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const okxReconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const okxRestIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const okxRestFallbackRef = useRef(false);
  const binanceRestIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const binanceRestFallbackRef = useRef(false);

  // Data buffers for throttling
  const latestBinanceDataRef = useRef<Map<string, TickerData>>(new Map());
  const latestOkxDataRef = useRef<Map<string, TickerData>>(new Map());

  // Track visible cards (kept for potential future use)
  const visibleCardsRef = useRef<Set<string>>(new Set());

  const handleVisibilityChange = useCallback((tickerId: string, visible: boolean) => {
    if (visible) {
      visibleCardsRef.current.add(tickerId);
    } else {
      visibleCardsRef.current.delete(tickerId);
    }
  }, []);

  useEffect(() => {
    let binanceConnected = false;
    let okxConnected = false;

    const updateConnectionState = () => {
      if (binanceConnected || okxConnected) {
        setConnectionStatus('websocket');
        setLoading(false);
      }
    };

    const updateTicker = (
      tickerData: Partial<TickerData>,
      exchange: 'Binance' | 'OKX',
      symbol: string,
    ) => {
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

      if (exchange === 'Binance') {
        latestBinanceDataRef.current.set(displaySymbol, fullTickerData);
      } else {
        latestOkxDataRef.current.set(displaySymbol, fullTickerData);
      }
    };

    // ─── Binance REST fallback ────────────────────────────────────────────
    const fetchBinanceTickers = async () => {
      try {
        const symbols = BINANCE_COINS.map((c) => `"${c.symbol}"`).join(',');
        const res = await fetch(
          `https://fapi.binance.com/fapi/v1/ticker/24hr?symbols=[${symbols}]`,
          { cache: 'no-store' },
        );
        if (!res.ok) throw new Error(`Binance REST failed: ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error('Unexpected Binance REST shape');

        for (const ticker of data) {
          const open = parseFloat(ticker.openPrice);
          const last = parseFloat(ticker.lastPrice);
          const change24h = open > 0 ? ((last - open) / open) * 100 : 0;
          updateTicker(
            {
              price: trimTrailingZeros(ticker.lastPrice),
              change24h,
              volume24h: parseFloat(ticker.quoteVolume),
              high24h: trimTrailingZeros(ticker.highPrice),
              low24h: trimTrailingZeros(ticker.lowPrice),
            },
            'Binance',
            ticker.symbol,
          );
        }
      } catch (error) {
        console.warn('[Binance] REST fallback failed:', error);
      }
    };

    const startBinanceRestFallback = () => {
      if (binanceRestIntervalRef.current) return;
      binanceRestFallbackRef.current = true;
      binanceConnected = true;
      updateConnectionState();
      fetchBinanceTickers();
      binanceRestIntervalRef.current = setInterval(fetchBinanceTickers, 15000);
    };

    // ─── OKX REST fallback ────────────────────────────────────────────────
    const fetchOkxTicker = async (instId: string) => {
      try {
        const res = await fetch(
          `https://www.okx.com/api/v5/market/ticker?instId=${instId}`,
          { cache: 'no-store' },
        );
        if (!res.ok) throw new Error(`OKX REST failed: ${res.status}`);
        const data = await res.json();
        if (data.code !== '0' || !Array.isArray(data.data) || data.data.length === 0) {
          throw new Error('OKX REST payload invalid');
        }
        return data.data[0];
      } catch (error) {
        console.warn('[OKX] REST fetch failed:', error);
        // Try the Next.js proxy as final fallback
        try {
          const proxyRes = await fetch(
            `/api/proxy/okx/tickers?instId=${encodeURIComponent(instId)}`,
            { cache: 'no-store' },
          );
          if (!proxyRes.ok) return null;
          const data = await proxyRes.json();
          if (data.code !== '0' || !Array.isArray(data.data) || data.data.length === 0) {
            return null;
          }
          return data.data[0];
        } catch {
          return null;
        }
      }
    };

    const fetchOkxTickers = async () => {
      try {
        const responses = await Promise.all(
          OKX_COINS.flatMap((coin) => coin.instIds.map((id) => fetchOkxTicker(id))),
        );
        for (const tickerData of responses) {
          if (!tickerData) continue;
          const open24h = parseFloat(tickerData.open24h);
          const last = parseFloat(tickerData.last);
          const changePercent = open24h > 0 ? ((last - open24h) / open24h) * 100 : 0;
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
        console.warn('[OKX] REST tickers fetch failed:', error);
      }
    };

    const startOkxRestFallback = () => {
      if (okxRestIntervalRef.current) return;
      okxRestFallbackRef.current = true;
      okxConnected = true;
      updateConnectionState();
      fetchOkxTickers();
      okxRestIntervalRef.current = setInterval(fetchOkxTickers, 15000);
    };

    // ─── Throttled flush loop (1 s) ───────────────────────────────────────
    const flushUpdates = () => {
      if (latestBinanceDataRef.current.size > 0) {
        const updates = new Map(latestBinanceDataRef.current);
        latestBinanceDataRef.current.clear();
        setBinanceTickers((prev) => {
          let changed = false;
          const next = prev.map((t) => {
            const u = updates.get(t.symbol);
            if (u) {
              changed = true;
              return u;
            }
            return t;
          });
          return changed ? next : prev;
        });
      }

      if (latestOkxDataRef.current.size > 0) {
        const updates = new Map(latestOkxDataRef.current);
        latestOkxDataRef.current.clear();
        setOkxTickers((prev) => {
          let changed = false;
          const next = prev.map((t) => {
            const u = updates.get(t.symbol);
            if (u) {
              changed = true;
              return u;
            }
            return t;
          });
          return changed ? next : prev;
        });
      }
    };

    const intervalId = setInterval(flushUpdates, 1000);

    // ─── Safety timeout: stop showing skeleton after 8 s ─────────────────
    const loadingTimeoutId = setTimeout(() => {
      setLoading(false);
      setConnectionStatus('error');
    }, 8000);

    // ─── Binance Futures WebSocket ─────────────────────────────────────────
    // Primary: direct exchange (port 443). Fallback: itrade proxy, then REST.
    const connectBinance = (endpointIndex = 0, retryCount = 0) => {
      if (binanceRestFallbackRef.current) return;

      const streams = BINANCE_COINS.map((c) => `${c.symbol.toLowerCase()}@ticker`).join(
        '/',
      );
      const BINANCE_WS_ENDPOINTS = [
        `wss://fstream.binance.com:443/market/stream?streams=${streams}`,
      ];
      const url = BINANCE_WS_ENDPOINTS[endpointIndex];
      const ws = new WebSocket(url);
      binanceWsRef.current = ws;
      let opened = false;

      ws.onopen = () => {
        opened = true;
        console.log(
          `✅ Binance Futures WebSocket connected (${endpointIndex === 0 ? 'direct' : 'proxy'})`,
        );
        binanceConnected = true;
        updateConnectionState();
      };

      ws.onmessage = (event) => {
        try {
          const rawData = JSON.parse(event.data as string);
          if (!rawData.data) return;
          const ticker: BinanceTickerData = rawData.data;
          const price = parseFloat(ticker.c);
          const open = parseFloat(ticker.o);
          const change24h = open > 0 ? ((price - open) / open) * 100 : 0;
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
        } catch (error) {
          console.error('[Binance] WS parse error:', error);
        }
      };

      ws.onerror = () => {
        console.warn(`[Binance] WebSocket error (endpoint ${endpointIndex})`);
      };

      ws.onclose = () => {
        binanceConnected = false;
        // Reconnect same endpoint on normal disconnect
        if (opened) {
          binanceReconnectTimeoutRef.current = setTimeout(
            () => connectBinance(endpointIndex, 0),
            3000,
          );
          return;
        }
        // Retry same endpoint
        if (retryCount < 2) {
          binanceReconnectTimeoutRef.current = setTimeout(
            () => connectBinance(endpointIndex, retryCount + 1),
            3000,
          );
          return;
        }
        // Try next endpoint
        if (endpointIndex < BINANCE_WS_ENDPOINTS.length - 1) {
          binanceReconnectTimeoutRef.current = setTimeout(
            () => connectBinance(endpointIndex + 1, 0),
            3000,
          );
          return;
        }
        // All WS endpoints exhausted — switch to REST
        console.warn('[Binance] All WS endpoints failed, falling back to REST');
        startBinanceRestFallback();
      };
    };

    // ─── OKX WebSocket ────────────────────────────────────────────────────
    // Primary: direct exchange (port 443). Fallback: itrade proxy, then REST.
    const OKX_WS_ENDPOINTS = [
      'wss://ws.okx.com:443/ws/v5/public',
      'wss://wsaws.okx.com:443/ws/v5/public',
    ];

    const connectOKX = (endpointIndex = 0, retryCount = 0) => {
      if (okxRestFallbackRef.current) return;

      const url = OKX_WS_ENDPOINTS[endpointIndex];
      const ws = new WebSocket(url);
      okxWsRef.current = ws;
      let opened = false;

      ws.onopen = () => {
        opened = true;
        console.log(
          `✅ OKX WebSocket connected (${endpointIndex === 0 ? 'primary' : 'AWS'})`,
        );

        const subscribeMsg = {
          op: 'subscribe',
          args: OKX_COINS.flatMap((coin) =>
            coin.instIds.map((instId) => ({ channel: 'tickers', instId })),
          ),
        };
        ws.send(JSON.stringify(subscribeMsg));
        okxConnected = true;
        updateConnectionState();
      };

      ws.onmessage = (event) => {
        try {
          const message: OKXTickerData = JSON.parse(event.data as string);
          if (!message.data || message.data.length === 0) return;
          const tickerData = message.data[0];
          const open24h = parseFloat(tickerData.open24h);
          const last = parseFloat(tickerData.last);
          const changePercent = open24h > 0 ? ((last - open24h) / open24h) * 100 : 0;
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
        } catch (error) {
          console.error('[OKX] WS parse error:', error);
        }
      };

      ws.onerror = () => {
        console.warn('[OKX] WebSocket error');
        okxConnected = false;
      };

      ws.onclose = () => {
        okxConnected = false;

        // Reconnect same endpoint if it was open (normal disconnect)
        if (opened) {
          okxReconnectTimeoutRef.current = setTimeout(
            () => connectOKX(endpointIndex, 0),
            3000,
          );
          return;
        }

        // Retry same endpoint up to 2 times
        if (retryCount < 2) {
          okxReconnectTimeoutRef.current = setTimeout(
            () => connectOKX(endpointIndex, retryCount + 1),
            3000,
          );
          return;
        }

        // Try next endpoint
        if (endpointIndex < OKX_WS_ENDPOINTS.length - 1) {
          okxReconnectTimeoutRef.current = setTimeout(
            () => connectOKX(endpointIndex + 1, 0),
            3000,
          );
          return;
        }

        // All WS endpoints exhausted — switch to REST
        console.warn('[OKX] All WS endpoints failed, falling back to REST');
        startOkxRestFallback();
      };
    };

    connectBinance(0);
    connectOKX(0);

    return () => {
      binanceWsRef.current?.close();
      okxWsRef.current?.close();
      if (binanceReconnectTimeoutRef.current)
        clearTimeout(binanceReconnectTimeoutRef.current);
      if (okxReconnectTimeoutRef.current) clearTimeout(okxReconnectTimeoutRef.current);
      if (okxRestIntervalRef.current) clearInterval(okxRestIntervalRef.current);
      if (binanceRestIntervalRef.current) clearInterval(binanceRestIntervalRef.current);
      okxRestFallbackRef.current = false;
      binanceRestFallbackRef.current = false;
      clearInterval(intervalId);
      clearTimeout(loadingTimeoutId);
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
                <div key={coin.display} className="space-y-3 rounded-lg border p-4">
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
