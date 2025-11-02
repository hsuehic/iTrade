/**
 * Subscription configuration types
 */

export type SubscriptionMethod = 'websocket' | 'rest' | 'auto';
export type DataType = 'ticker' | 'orderbook' | 'trades' | 'klines';

/**
 * Ticker subscription configuration
 */
export interface TickerSubscriptionConfig {
  enabled: boolean;
  pollInterval?: number; // REST polling interval in milliseconds
}

/**
 * OrderBook subscription configuration
 */
export interface OrderBookSubscriptionConfig {
  enabled: boolean;
  depth?: number; // Order book depth
  pollInterval?: number; // REST polling interval in milliseconds
}

/**
 * Trades subscription configuration
 */
export interface TradesSubscriptionConfig {
  enabled: boolean;
  limit?: number; // Number of trades to fetch
  pollInterval?: number; // REST polling interval in milliseconds
}

/**
 * Klines subscription configuration
 */
export interface KlinesSubscriptionConfig {
  enabled: boolean;
  interval?: string; // Kline interval ('1m', '5m', '1h', etc.)
  limit?: number; // Number of klines to fetch
  pollInterval?: number; // REST polling interval in milliseconds
}

/**
 * Overall subscription configuration for a strategy
 * TODO: support multiple symbols * multiple exchanges  per subscription
 */
export interface SubscriptionConfig {
  // Ticker subscription
  ticker?: boolean | TickerSubscriptionConfig;

  // OrderBook subscription
  orderbook?: boolean | OrderBookSubscriptionConfig;

  // Trades subscription
  trades?: boolean | TradesSubscriptionConfig;

  // Klines subscription
  klines?: boolean | KlinesSubscriptionConfig;

  // Subscription method
  method?: SubscriptionMethod;

  // Target exchange(s)
  // - Single exchange: 'binance'
  // - Multiple exchanges: ['binance', 'okx', 'coinbase']
  // - All exchanges: undefined or []
  exchange?: string | string[];
}

/**
 * Valid parameter types for subscriptions
 */
export type SubscriptionParamValue = string | number | boolean | undefined;

/**
 * Internal subscription key for tracking subscriptions
 */
export interface SubscriptionKey {
  exchange: string;
  symbol: string;
  type: DataType;
  params?: Record<string, SubscriptionParamValue>;
}

/**
 * Internal subscription information
 */
export interface SubscriptionInfo {
  key: SubscriptionKey;
  refCount: number;
  strategies: Set<string>;
  timerId?: NodeJS.Timeout;
  method: 'websocket' | 'rest';
}

/**
 * Default subscription configurations
 */
export const DEFAULT_TICKER_CONFIG: TickerSubscriptionConfig = {
  enabled: true,
  pollInterval: 1000, // 1 second
};

export const DEFAULT_ORDERBOOK_CONFIG: OrderBookSubscriptionConfig = {
  enabled: true,
  depth: 20,
  pollInterval: 500, // 0.5 seconds
};

export const DEFAULT_TRADES_CONFIG: TradesSubscriptionConfig = {
  enabled: true,
  limit: 10,
  pollInterval: 1000, // 1 second
};

export const DEFAULT_KLINES_CONFIG: KlinesSubscriptionConfig = {
  enabled: true,
  interval: '1m',
  limit: 1,
  pollInterval: 60000, // 1 minute
};
