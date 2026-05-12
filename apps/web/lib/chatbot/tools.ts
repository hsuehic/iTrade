/**
 * Chatbot tool definitions for Gemini function calling.
 *
 * Each tool corresponds to an existing iTrade API endpoint or an external exchange API.
 * The handler functions fetch real user data server-side (already authenticated via cookie).
 */
import { SchemaType, type Tool } from '@google/generative-ai';

// ─── Tool schema definitions (sent to Gemini) ────────────────────────────────

export const CHATBOT_TOOLS: Tool[] = [
  {
    functionDeclarations: [
      // ── Performance & portfolio tools ────────────────────────────────────
      {
        name: 'get_account_balance',
        description:
          'Get the current account balance summary and historical balance data. ' +
          'Use this for questions about current balance, earnings over a period, or balance changes. ' +
          'Supports periods: 1h, 1d, 7d, 1w, 1m, 30d, 90d, 1y.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            exchange: {
              type: SchemaType.STRING,
              description:
                'Exchange name (e.g. "binance", "okx", "coinbase"). Use "all" for all exchanges.',
            },
            period: {
              type: SchemaType.STRING,
              description:
                'Time period: 1h, 1d, 7d, 1w, 1m, 30d, 90d, 1y. Default: 1m for monthly.',
            },
            align: {
              type: SchemaType.STRING,
              description:
                '"calendar" for calendar-aligned periods (default), "rolling" for rolling windows.',
            },
          },
          required: [],
        },
      },
      {
        name: 'get_pnl_summary',
        description:
          'Get PnL (profit and loss) data. For overall PnL or for a specific strategy. ' +
          'Returns realizedPnl, unrealizedPnl, totalPnl.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            strategyId: {
              type: SchemaType.NUMBER,
              description:
                'Optional strategy ID. Omit to get overall PnL across all strategies.',
            },
          },
          required: [],
        },
      },
      {
        name: 'get_strategy_analytics',
        description:
          'Get analytics and performance rankings for all trading strategies. ' +
          'Use this for questions about most/least profitable strategies, strategy rankings, ' +
          'or performance grouped by exchange or symbol.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            limit: {
              type: SchemaType.NUMBER,
              description: 'Number of top strategies to return. Default: 10.',
            },
          },
          required: [],
        },
      },
      {
        name: 'get_top_tokens',
        description:
          'Get the most profitable trading tokens/symbols ranked by PnL. ' +
          'Use this for questions about most profitable crypto, best performing assets, or token ranking.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            limit: {
              type: SchemaType.NUMBER,
              description: 'Number of top tokens to return. Default: 10.',
            },
          },
          required: [],
        },
      },
      {
        name: 'get_orders',
        description:
          'Get recent trading orders. Useful for reviewing trade history, filled orders, ' +
          'or orders for a specific token/exchange.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            exchange: {
              type: SchemaType.STRING,
              description: 'Filter by exchange name.',
            },
            symbol: {
              type: SchemaType.STRING,
              description: 'Filter by trading symbol (e.g., "BTC/USDT").',
            },
            status: {
              type: SchemaType.STRING,
              description: 'Filter by status: filled, open, canceled.',
            },
            startDate: {
              type: SchemaType.STRING,
              description: 'Start date in ISO format (e.g., "2025-04-01").',
            },
            endDate: {
              type: SchemaType.STRING,
              description: 'End date in ISO format (e.g., "2025-04-30").',
            },
            pageSize: {
              type: SchemaType.NUMBER,
              description: 'Number of orders to return. Default: 20.',
            },
          },
          required: [],
        },
      },

      // ── Strategy management tools ─────────────────────────────────────────
      {
        name: 'list_strategies',
        description:
          "Get the user's existing trading strategies. Use this before creating a new strategy " +
          'to check for duplicates, or when the user asks to see their strategies.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            status: {
              type: SchemaType.STRING,
              description: 'Filter by status: running, stopped, paused. Omit for all.',
            },
            exchange: {
              type: SchemaType.STRING,
              description: 'Filter by exchange name.',
            },
          },
          required: [],
        },
      },
      {
        name: 'get_strategy_types',
        description:
          'Get all available strategy types with their parameter definitions and default values. ' +
          'ALWAYS call this before proposing any strategy so you have accurate parameter schemas and defaults. ' +
          'Returns types like SpreadGridStrategy, MovingAverageStrategy, etc.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {},
          required: [],
        },
      },

      // ── Market data tools ─────────────────────────────────────────────────
      {
        name: 'get_market_data',
        description:
          'Get live market ticker data for a trading symbol from OKX, Binance, or both. ' +
          'Returns current price, 24h change, 24h high/low/volume, and volatility metrics. ' +
          'Also returns suggested strategy parameters derived from the market data (suggestedBasePrice, suggestedStepPercent). ' +
          'ALWAYS call this when creating a strategy so parameters reflect the current market price.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            symbol: {
              type: SchemaType.STRING,
              description:
                'Trading pair in standard format, e.g. "BTC/USDT", "ETH/USDT". ' +
                'For futures use "BTC/USDT:USDT".',
            },
            exchange: {
              type: SchemaType.STRING,
              description:
                'Which exchange to fetch from: "binance", "okx", or "all" (default). ' +
                '"all" returns data from both exchanges for comparison.',
            },
          },
          required: ['symbol'],
        },
      },
      {
        name: 'get_available_symbols',
        description:
          'Get available trading pairs from the iTrade database (seeded symbols). ' +
          'Use this to validate whether a symbol/exchange combination is supported, ' +
          'or to suggest symbols when the user is unsure what to trade.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            exchange: {
              type: SchemaType.STRING,
              description:
                'Filter by exchange: "binance", "okx", "coinbase". Omit for all.',
            },
            query: {
              type: SchemaType.STRING,
              description: 'Search term to filter symbols (e.g., "BTC", "ETH").',
            },
            type: {
              type: SchemaType.STRING,
              description: 'Filter by type: "spot" or "futures". Omit for all.',
            },
          },
          required: [],
        },
      },
    ],
  },
];

// ─── Tool handler types ────────────────────────────────────────────────────────

export type ToolName =
  | 'get_account_balance'
  | 'get_pnl_summary'
  | 'get_strategy_analytics'
  | 'get_top_tokens'
  | 'get_orders'
  | 'list_strategies'
  | 'get_strategy_types'
  | 'get_market_data'
  | 'get_available_symbols';

export interface ToolArgs {
  get_account_balance: { exchange?: string; period?: string; align?: string };
  get_pnl_summary: { strategyId?: number };
  get_strategy_analytics: { limit?: number };
  get_top_tokens: { limit?: number };
  get_orders: {
    exchange?: string;
    symbol?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    pageSize?: number;
  };
  list_strategies: { status?: string; exchange?: string };
  get_strategy_types: Record<string, never>;
  get_market_data: { symbol: string; exchange?: string };
  get_available_symbols: { exchange?: string; query?: string; type?: string };
}

// ─── Tool handlers (call internal APIs with the user's session cookie) ─────────

async function fetchInternal(
  baseUrl: string,
  path: string,
  params: Record<string, string | number | boolean | undefined>,
  cookie: string,
): Promise<unknown> {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }
  const res = await fetch(url.toString(), {
    headers: { cookie },
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }
  return res.json();
}

// ─── Market data helpers ──────────────────────────────────────────────────────

/** Convert "BTC/USDT" → "BTCUSDT" for Binance spot, "BTC/USDT:USDT" → "BTCUSDT" */
function toBinanceSymbol(symbol: string): string {
  const base = symbol.split(':')[0]; // strip ":USDT" futures suffix
  return base.replace('/', '');
}

/** Convert "BTC/USDT" → "BTC-USDT" for OKX spot, "BTC/USDT:USDT" → "BTC-USDT-SWAP" */
function toOKXSymbol(symbol: string): string {
  if (symbol.includes(':')) {
    // Futures/perpetual: BTC/USDT:USDT → BTC-USDT-SWAP
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
    // Suggest step = 30% of daily range, clamped to [1, 5]
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

// ─── Main executeToolCall ──────────────────────────────────────────────────────

export async function executeToolCall(
  toolName: ToolName,
  args: Record<string, unknown>,
  baseUrl: string,
  cookie: string,
): Promise<unknown> {
  switch (toolName) {
    case 'get_account_balance': {
      const typedArgs = args as ToolArgs['get_account_balance'];
      return fetchInternal(
        baseUrl,
        '/api/analytics/account',
        {
          exchange: typedArgs.exchange || 'all',
          period: typedArgs.period || '1m',
          align: typedArgs.align || 'calendar',
        },
        cookie,
      );
    }

    case 'get_pnl_summary': {
      const typedArgs = args as ToolArgs['get_pnl_summary'];
      return fetchInternal(
        baseUrl,
        '/api/analytics/pnl',
        { strategyId: typedArgs.strategyId },
        cookie,
      );
    }

    case 'get_strategy_analytics': {
      const typedArgs = args as ToolArgs['get_strategy_analytics'];
      return fetchInternal(
        baseUrl,
        '/api/analytics/strategies',
        { limit: typedArgs.limit || 10 },
        cookie,
      );
    }

    case 'get_top_tokens': {
      const typedArgs = args as ToolArgs['get_top_tokens'];
      const data = (await fetchInternal(
        baseUrl,
        '/api/analytics/strategies',
        { limit: 50 },
        cookie,
      )) as { bySymbol?: unknown[] };
      const limit = typedArgs.limit || 10;
      return {
        topTokens: (data.bySymbol || []).slice(0, limit),
      };
    }

    case 'get_orders': {
      const typedArgs = args as ToolArgs['get_orders'];
      return fetchInternal(
        baseUrl,
        '/api/orders',
        {
          exchange: typedArgs.exchange,
          symbol: typedArgs.symbol,
          status: typedArgs.status,
          startDate: typedArgs.startDate,
          endDate: typedArgs.endDate,
          pageSize: typedArgs.pageSize || 20,
          sortBy: 'timestamp',
          sortOrder: 'DESC',
        },
        cookie,
      );
    }

    case 'list_strategies': {
      const typedArgs = args as ToolArgs['list_strategies'];
      return fetchInternal(
        baseUrl,
        '/api/strategies',
        {
          status: typedArgs.status,
          exchange: typedArgs.exchange,
        },
        cookie,
      );
    }

    case 'get_strategy_types': {
      return fetchInternal(baseUrl, '/api/strategies/config', {}, cookie);
    }

    case 'get_market_data': {
      const typedArgs = args as ToolArgs['get_market_data'];
      const { symbol, exchange = 'all' } = typedArgs;

      if (exchange === 'binance') {
        const result = await fetchBinanceTicker(symbol);
        if (!result) throw new Error(`No data found for ${symbol} on Binance`);
        return result;
      }

      if (exchange === 'okx') {
        const result = await fetchOKXTicker(symbol);
        if (!result) throw new Error(`No data found for ${symbol} on OKX`);
        return result;
      }

      // "all" — fetch from both in parallel, return whichever succeeds
      const [binance, okx] = await Promise.all([
        fetchBinanceTicker(symbol),
        fetchOKXTicker(symbol),
      ]);

      const results = [binance, okx].filter(Boolean);
      if (results.length === 0) {
        throw new Error(
          `Could not fetch market data for ${symbol} from any exchange. ` +
            `Try a different symbol format (e.g., "BTC/USDT" for spot).`,
        );
      }

      // Return combined result; use the first successful one as the primary
      const primary = results[0]!;
      return {
        primary,
        all: results,
        // Cross-exchange price comparison
        priceComparison:
          results.length > 1
            ? {
                binancePrice: binance?.price,
                okxPrice: okx?.price,
                spreadPct:
                  binance && okx
                    ? Math.abs(((binance.price - okx.price) / okx.price) * 100).toFixed(4)
                    : null,
              }
            : null,
      };
    }

    case 'get_available_symbols': {
      const typedArgs = args as ToolArgs['get_available_symbols'];
      const data = (await fetchInternal(
        baseUrl,
        '/api/trading-pairs',
        {},
        cookie,
      )) as Array<{
        symbol: string;
        exchange: string;
        name: string;
        type: string;
        baseAsset: string;
        quoteAsset: string;
      }>;

      let filtered = data;

      if (typedArgs.exchange) {
        filtered = filtered.filter(
          (s) => s.exchange.toLowerCase() === typedArgs.exchange!.toLowerCase(),
        );
      }

      if (typedArgs.type) {
        filtered = filtered.filter(
          (s) => s.type?.toLowerCase() === typedArgs.type!.toLowerCase(),
        );
      }

      if (typedArgs.query) {
        const q = typedArgs.query.toLowerCase();
        filtered = filtered.filter(
          (s) =>
            s.symbol.toLowerCase().includes(q) ||
            s.name?.toLowerCase().includes(q) ||
            s.baseAsset?.toLowerCase().includes(q),
        );
      }

      return {
        symbols: filtered.slice(0, 50), // cap at 50 to keep context manageable
        total: filtered.length,
      };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
