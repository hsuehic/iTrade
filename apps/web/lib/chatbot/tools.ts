/**
 * Chatbot tool definitions — Vercel AI SDK + Zod.
 *
 * Each tool corresponds to an iTrade API endpoint or an external exchange API.
 * Use createChatbotTools(baseUrl, cookie) to get a tools object ready for generateText().
 */
import { tool } from 'ai';
import { z } from 'zod';

// ─── Null-safe parameter helper ────────────────────────────────────────────────
//
// Some LLMs (especially smaller/open-source models) send `null` as the args for
// tools that have no required parameters, rather than an empty object `{}`.
// Zod's z.object() rejects null, causing AI_InvalidToolArgumentsError at runtime.
//
// This helper coerces null → {} before Zod validates, so the tool still executes.

function nullSafe<T extends z.ZodRawShape>(shape: T) {
  return z.preprocess((v) => (v == null ? {} : v), z.object(shape));
}

// ─── Internal fetch helper ─────────────────────────────────────────────────────

async function fetchInternal(
  baseUrl: string,
  path: string,
  params: Record<string, string | number | boolean | undefined>,
  cookie: string,
  extraHeaders?: Record<string, string>,
): Promise<unknown> {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }
  const res = await fetch(url.toString(), {
    headers: { cookie, ...extraHeaders },
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }
  return res.json();
}

// ─── Market data helpers ───────────────────────────────────────────────────────

/** Convert "BTC/USDT" → "BTCUSDT" for Binance spot, "BTC/USDT:USDT" → "BTCUSDT" */
function toBinanceSymbol(symbol: string): string {
  const base = symbol.split(':')[0];
  return base.replace('/', '');
}

/** Convert "BTC/USDT" → "BTC-USDT" for OKX spot, "BTC/USDT:USDT" → "BTC-USDT-SWAP" */
function toOKXSymbol(symbol: string): string {
  if (symbol.includes(':')) {
    const base = symbol.split(':')[0];
    return base.replace('/', '-') + '-SWAP';
  }
  return symbol.replace('/', '-');
}

interface TickerResult {
  symbol: string;
  exchange: string;
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  suggestedBasePrice: number;
  suggestedStepPercent: number;
  volatility24hPct: number;
}

async function fetchBinanceTicker(symbol: string): Promise<TickerResult | null> {
  try {
    const binanceSymbol = toBinanceSymbol(symbol);
    const res = await fetch(
      `https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSymbol}`,
      { next: { revalidate: 5 } },
    );
    if (!res.ok) return null;
    const d = await res.json();
    const price = parseFloat(d.lastPrice);
    const high = parseFloat(d.highPrice);
    const low = parseFloat(d.lowPrice);
    const volatility = high > 0 ? ((high - low) / price) * 100 : 2;
    const suggestedStep =
      Math.round(Math.max(1, Math.min(5, volatility * 0.3)) * 10) / 10;
    return {
      symbol,
      exchange: 'binance',
      price,
      change24h: parseFloat(d.priceChangePercent),
      volume24h: parseFloat(d.quoteVolume),
      high24h: high,
      low24h: low,
      suggestedBasePrice: Math.round(price),
      suggestedStepPercent: suggestedStep,
      volatility24hPct: Math.round(volatility * 10) / 10,
    };
  } catch {
    return null;
  }
}

async function fetchOKXTicker(symbol: string): Promise<TickerResult | null> {
  try {
    const okxSymbol = toOKXSymbol(symbol);
    const res = await fetch(
      `https://www.okx.com/api/v5/market/ticker?instId=${okxSymbol}`,
      { next: { revalidate: 5 } },
    );
    if (!res.ok) return null;
    const result = await res.json();
    if (result.code !== '0' || !result.data?.[0]) return null;
    const d = result.data[0];
    const price = parseFloat(d.last);
    const high = parseFloat(d.high24h);
    const low = parseFloat(d.low24h);
    const volatility = high > 0 ? ((high - low) / price) * 100 : 2;
    const suggestedStep =
      Math.round(Math.max(1, Math.min(5, volatility * 0.3)) * 10) / 10;
    return {
      symbol,
      exchange: 'okx',
      price,
      change24h:
        parseFloat(d.open24h) > 0
          ? ((price - parseFloat(d.open24h)) / parseFloat(d.open24h)) * 100
          : 0,
      volume24h: parseFloat(d.volCcy24h),
      high24h: high,
      low24h: low,
      suggestedBasePrice: Math.round(price),
      suggestedStepPercent: suggestedStep,
      volatility24hPct: Math.round(volatility * 10) / 10,
    };
  } catch {
    return null;
  }
}

// ─── Tool factory ──────────────────────────────────────────────────────────────

/**
 * Create all chatbot tools with the user's session context injected.
 * Pass the result directly to generateText({ tools }).
 */
export function createChatbotTools(
  baseUrl: string,
  cookie: string,
  extraHeaders?: Record<string, string>,
) {
  // Partial helper so every fetchInternal call gets the forwarded host headers
  const fetch = (
    path: string,
    params: Record<string, string | number | boolean | undefined>,
  ) => fetchInternal(baseUrl, path, params, cookie, extraHeaders);

  return {
    // ── Performance & portfolio ──────────────────────────────────────────────

    get_account_balance: tool({
      description:
        'Get the current account balance summary and historical balance data. ' +
        'Use this for questions about current balance, earnings over a period, balance changes, OR to chart balance history. ' +
        'Returns: summary (totalBalance, balanceChange), exchanges[], and chartData[] ready for line chart rendering. ' +
        'chartData format: [{date: "YYYY-MM-DD", binance: number, okx: number, ...}]. ' +
        'Supports periods: 1h, 1d, 7d, 1w, 1m, 30d, 90d, 1y.',
      parameters: nullSafe({
        exchange: z
          .string()
          .optional()
          .describe(
            'Exchange name (e.g. "binance", "okx"). Use "all" for all exchanges.',
          ),
        period: z
          .string()
          .optional()
          .describe('Time period: 1h, 1d, 7d, 1w, 1m, 30d, 90d, 1y. Default: 1m.'),
        align: z
          .string()
          .optional()
          .describe(
            '"calendar" for calendar-aligned periods (default), "rolling" for rolling windows.',
          ),
      }),
      execute: async ({ exchange, period, align }) =>
        fetch('/api/analytics/account', {
          exchange: exchange ?? 'all',
          period: period ?? '1m',
          align: align ?? 'calendar',
        }),
    }),

    get_pnl_summary: tool({
      description:
        'Get PnL (profit and loss) data. For overall PnL or for a specific strategy. ' +
        'Returns realizedPnl, unrealizedPnl, totalPnl.',
      parameters: nullSafe({
        strategyId: z
          .number()
          .optional()
          .describe(
            'Optional strategy ID. Omit to get overall PnL across all strategies.',
          ),
      }),
      execute: async ({ strategyId }) => fetch('/api/analytics/pnl', { strategyId }),
    }),

    get_strategy_analytics: tool({
      description:
        'Get analytics and performance rankings for all trading strategies. ' +
        'Use this for questions about most/least profitable strategies, strategy rankings, ' +
        'or performance grouped by exchange or symbol.',
      parameters: nullSafe({
        limit: z
          .number()
          .optional()
          .describe('Number of top strategies to return. Default: 10.'),
      }),
      execute: async ({ limit }) =>
        fetch('/api/analytics/strategies', { limit: limit ?? 10 }),
    }),

    get_top_tokens: tool({
      description:
        'Get the most profitable trading tokens/symbols ranked by PnL. ' +
        'Use this for questions about most profitable crypto, best performing assets, or token ranking.',
      parameters: nullSafe({
        limit: z
          .number()
          .optional()
          .describe('Number of top tokens to return. Default: 10.'),
      }),
      execute: async ({ limit }) => {
        const data = (await fetch('/api/analytics/strategies', { limit: 50 })) as {
          bySymbol?: unknown[];
        };
        return { topTokens: (data.bySymbol ?? []).slice(0, limit ?? 10) };
      },
    }),

    get_orders: tool({
      description:
        'Get recent trading orders. Useful for reviewing trade history, filled orders, ' +
        'or orders for a specific token/exchange.',
      parameters: nullSafe({
        exchange: z.string().optional().describe('Filter by exchange name.'),
        symbol: z
          .string()
          .optional()
          .describe('Filter by trading symbol (e.g., "BTC/USDT").'),
        status: z
          .string()
          .optional()
          .describe('Filter by status: filled, open, canceled.'),
        startDate: z
          .string()
          .optional()
          .describe('Start date in ISO format (e.g., "2025-04-01").'),
        endDate: z
          .string()
          .optional()
          .describe('End date in ISO format (e.g., "2025-04-30").'),
        pageSize: z
          .number()
          .optional()
          .describe('Number of orders to return. Default: 20.'),
      }),
      execute: async ({ exchange, symbol, status, startDate, endDate, pageSize }) =>
        fetch('/api/orders', {
          exchange,
          symbol,
          status,
          startDate,
          endDate,
          pageSize: pageSize ?? 20,
          sortBy: 'timestamp',
          sortOrder: 'DESC',
        }),
    }),

    // ── Strategy management ──────────────────────────────────────────────────

    list_strategies: tool({
      description:
        "Get the user's existing trading strategies. Use this before creating a new strategy " +
        'to check for duplicates, or when the user asks to see their strategies.',
      parameters: nullSafe({
        status: z
          .string()
          .optional()
          .describe('Filter by status: running, stopped, paused. Omit for all.'),
        exchange: z.string().optional().describe('Filter by exchange name.'),
      }),
      execute: async ({ status, exchange }) =>
        fetch('/api/strategies', { status, exchange }),
    }),

    get_strategy_types: tool({
      description:
        'Get all available strategy types with their parameter definitions and default values. ' +
        'ALWAYS call this before proposing any strategy so you have accurate parameter schemas and defaults. ' +
        'Returns types like SpreadGridStrategy, MovingAverageStrategy, etc.',
      parameters: nullSafe({}),
      execute: async () => fetch('/api/strategies/config', {}),
    }),

    // ── Market data ──────────────────────────────────────────────────────────

    get_market_data: tool({
      description:
        'Get live market ticker data for a trading symbol from OKX, Binance, or both. ' +
        'Returns current price, 24h change, 24h high/low/volume, and volatility metrics. ' +
        'Also returns suggested strategy parameters derived from the market data (suggestedBasePrice, suggestedStepPercent). ' +
        'ALWAYS call this when creating a strategy so parameters reflect the current market price.',
      parameters: z.object({
        symbol: z
          .string()
          .describe(
            'Trading pair in standard format, e.g. "BTC/USDT", "ETH/USDT". ' +
              'For futures use "BTC/USDT:USDT".',
          ),
        exchange: z
          .string()
          .optional()
          .describe(
            'Which exchange to fetch from: "binance", "okx", or "all" (default). ' +
              '"all" returns data from both exchanges for comparison.',
          ),
      }),
      execute: async ({ symbol, exchange = 'all' }) => {
        // Always fetch both exchanges in parallel regardless of the requested exchange.
        // Cloud hosts (GCE, AWS, etc.) are often IP-blocked by Binance, so we fall back
        // to OKX transparently rather than failing hard on the requested exchange.
        const [binance, okx] = await Promise.all([
          fetchBinanceTicker(symbol),
          fetchOKXTicker(symbol),
        ]);

        // Pick the preferred result, fall back to whichever is available
        let preferred: TickerResult | null = null;
        if (exchange === 'binance') {
          preferred = binance ?? okx;
        } else if (exchange === 'okx') {
          preferred = okx ?? binance;
        } else {
          preferred = binance ?? okx;
        }

        if (!preferred) {
          throw new Error(
            `Could not fetch market data for ${symbol} from any exchange. ` +
              `Try a different symbol format (e.g., "BTC/USDT" for spot).`,
          );
        }

        const results = [binance, okx].filter(Boolean) as TickerResult[];

        return {
          primary: preferred,
          // Surface which exchange actually responded so the model knows
          note:
            exchange !== 'all' && preferred.exchange !== exchange
              ? `${exchange} was unreachable from the server; data is from ${preferred.exchange} instead.`
              : undefined,
          all: results,
          priceComparison:
            results.length > 1
              ? {
                  binancePrice: binance?.price,
                  okxPrice: okx?.price,
                  spreadPct:
                    binance && okx
                      ? Math.abs(((binance.price - okx.price) / okx.price) * 100).toFixed(
                          4,
                        )
                      : null,
                }
              : null,
        };
      },
    }),

    get_available_symbols: tool({
      description:
        'Get available trading pairs from the iTrade database (seeded symbols). ' +
        'Use this to validate whether a symbol/exchange combination is supported, ' +
        'or to suggest symbols when the user is unsure what to trade.',
      parameters: nullSafe({
        exchange: z
          .string()
          .optional()
          .describe('Filter by exchange: "binance", "okx", "coinbase". Omit for all.'),
        query: z
          .string()
          .optional()
          .describe('Search term to filter symbols (e.g., "BTC", "ETH").'),
        type: z
          .string()
          .optional()
          .describe('Filter by type: "spot" or "futures". Omit for all.'),
      }),
      execute: async ({ exchange, query, type }) => {
        const data = (await fetch('/api/trading-pairs', {})) as Array<{
          symbol: string;
          exchange: string;
          name: string;
          type: string;
          baseAsset: string;
          quoteAsset: string;
        }>;

        let filtered = data;

        if (exchange) {
          filtered = filtered.filter(
            (s) => s.exchange.toLowerCase() === exchange.toLowerCase(),
          );
        }
        if (type) {
          filtered = filtered.filter((s) => s.type?.toLowerCase() === type.toLowerCase());
        }
        if (query) {
          const q = query.toLowerCase();
          filtered = filtered.filter(
            (s) =>
              s.symbol.toLowerCase().includes(q) ||
              s.name?.toLowerCase().includes(q) ||
              s.baseAsset?.toLowerCase().includes(q),
          );
        }

        return {
          symbols: filtered.slice(0, 50),
          total: filtered.length,
        };
      },
    }),
  };
}

// Infer the tools type for use elsewhere
export type ChatbotTools = ReturnType<typeof createChatbotTools>;
