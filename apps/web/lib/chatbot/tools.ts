/**
 * Chatbot tool definitions for Gemini function calling.
 *
 * Each tool corresponds to an existing iTrade API endpoint.
 * The handler functions fetch real user data server-side (already authenticated via cookie).
 */
import { SchemaType, type Tool } from '@google/generative-ai';

// ─── Tool schema definitions (sent to Gemini) ────────────────────────────────

export const CHATBOT_TOOLS: Tool[] = [
  {
    functionDeclarations: [
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
    ],
  },
];

// ─── Tool handler types ────────────────────────────────────────────────────────

export type ToolName =
  | 'get_account_balance'
  | 'get_pnl_summary'
  | 'get_strategy_analytics'
  | 'get_top_tokens'
  | 'get_orders';

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
      // Return only the bySymbol ranking, limited
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

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
