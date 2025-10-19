/**
 * Subscription configuration types
 */
/**
 * Default subscription configurations
 */
export const DEFAULT_TICKER_CONFIG = {
    enabled: true,
    interval: 1000, // 1 second
};
export const DEFAULT_ORDERBOOK_CONFIG = {
    enabled: true,
    depth: 20,
    interval: 500, // 0.5 seconds
};
export const DEFAULT_TRADES_CONFIG = {
    enabled: true,
    limit: 10,
    interval: 1000, // 1 second
};
export const DEFAULT_KLINES_CONFIG = {
    enabled: true,
    interval: '1m',
    limit: 1,
    pollInterval: 60000, // 1 minute
};
//# sourceMappingURL=subscription.js.map