/**
 * Supported cryptocurrency exchanges
 */
export enum SupportedExchange {
  BINANCE = 'binance',
  OKX = 'okx',
  COINBASE = 'coinbase',
}

/**
 * Array of all supported exchange values
 */
export const SUPPORTED_EXCHANGES = Object.values(SupportedExchange);

/**
 * Type for exchange string literals
 */
export type ExchangeName = SupportedExchange | (typeof SUPPORTED_EXCHANGES)[number];

/**
 * Check if a string is a valid exchange name
 */
export function isValidExchange(exchange: string): exchange is ExchangeName {
  return SUPPORTED_EXCHANGES.includes(exchange as SupportedExchange);
}

/**
 * Get display name for an exchange
 */
export function getExchangeDisplayName(exchange: ExchangeName): string {
  const displayNames: Record<SupportedExchange, string> = {
    [SupportedExchange.BINANCE]: 'Binance',
    [SupportedExchange.OKX]: 'OKX',
    [SupportedExchange.COINBASE]: 'Coinbase',
  };
  return displayNames[exchange as SupportedExchange] || exchange;
}
