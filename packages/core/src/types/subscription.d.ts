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
    interval?: number;
}
/**
 * OrderBook subscription configuration
 */
export interface OrderBookSubscriptionConfig {
    enabled: boolean;
    depth?: number;
    interval?: number;
}
/**
 * Trades subscription configuration
 */
export interface TradesSubscriptionConfig {
    enabled: boolean;
    limit?: number;
    interval?: number;
}
/**
 * Klines subscription configuration
 */
export interface KlinesSubscriptionConfig {
    enabled: boolean;
    interval?: string;
    limit?: number;
    pollInterval?: number;
}
/**
 * Overall subscription configuration for a strategy
 */
export interface SubscriptionConfig {
    ticker?: boolean | TickerSubscriptionConfig;
    orderbook?: boolean | OrderBookSubscriptionConfig;
    trades?: boolean | TradesSubscriptionConfig;
    klines?: boolean | KlinesSubscriptionConfig;
    method?: SubscriptionMethod;
    exchange?: string;
}
/**
 * Internal subscription key for tracking subscriptions
 */
export interface SubscriptionKey {
    exchange: string;
    symbol: string;
    type: DataType;
    params?: Record<string, any>;
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
export declare const DEFAULT_TICKER_CONFIG: TickerSubscriptionConfig;
export declare const DEFAULT_ORDERBOOK_CONFIG: OrderBookSubscriptionConfig;
export declare const DEFAULT_TRADES_CONFIG: TradesSubscriptionConfig;
export declare const DEFAULT_KLINES_CONFIG: KlinesSubscriptionConfig;
//# sourceMappingURL=subscription.d.ts.map