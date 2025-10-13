/**
 * Exchange-related utility functions
 * Centralized exchange symbol normalization logic
 */

export type ExchangeId = 'binance' | 'okx' | 'coinbase';

/**
 * Normalize symbol to exchange-specific format
 * This is the single source of truth for symbol normalization
 *
 * @param symbol - Trading pair symbol (e.g., 'BTC/USDT', 'BTC/USDT:USDT')
 * @param exchangeId - Exchange identifier
 * @returns Normalized symbol in exchange-specific format
 *
 * @example
 * normalizeSymbol('BTC/USDT', 'binance') // Returns: 'BTCUSDT'
 * normalizeSymbol('BTC/USDT:USDT', 'binance') // Returns: 'BTCUSDT' (perpetual)
 * normalizeSymbol('BTC/USDT', 'okx') // Returns: 'BTC-USDT'
 * normalizeSymbol('BTC/USDT:USDT', 'okx') // Returns: 'BTC-USDT-SWAP' (perpetual)
 * normalizeSymbol('BTC/USDC', 'coinbase') // Returns: 'BTC-USDC'
 * normalizeSymbol('BTC/USDC:USDC', 'coinbase') // Returns: 'BTC-USDC-INTX' (perpetual)
 */
export function normalizeSymbol(symbol: string, exchangeId: string): string {
  if (!symbol) return symbol;

  const upperSymbol = symbol.toUpperCase();
  const exchange = exchangeId.toLowerCase();

  switch (exchange) {
    case 'binance':
      // Binance: BTCUSDT for both spot and perpetual
      if (upperSymbol.includes(':')) {
        const [pair] = upperSymbol.split(':');
        return pair.replace(/\//g, '').replace(/-/g, '');
      }
      if (upperSymbol.includes('_PERP') || upperSymbol.includes('_SWAP')) {
        return upperSymbol.replace(/\//g, '').replace(/-/g, '');
      }
      return upperSymbol.replace(/\//g, '').replace(/-/g, '');

    case 'okx':
      // OKX: BTC-USDT (spot), BTC-USDT-SWAP (perpetual)
      if (upperSymbol.includes(':')) {
        const [pair] = upperSymbol.split(':');
        const base = pair.replace(/\//g, '-');
        return `${base}-SWAP`;
      }
      if (upperSymbol.includes('-SWAP') || upperSymbol.includes('-FUTURES')) {
        return upperSymbol.replace(/\//g, '-');
      }
      return upperSymbol.replace(/\//g, '-');

    case 'coinbase':
      // Coinbase: BTC-USDC (spot), BTC-USDC-INTX (perpetual)
      // Default quote coin is USDC
      if (upperSymbol.includes(':')) {
        const [pair] = upperSymbol.split(':');
        // BTC/USDC:USDC -> BTC-USDC-INTX
        return pair.replace(/\//g, '-') + '-INTX';
      }
      if (upperSymbol.includes('-INTX')) {
        return upperSymbol;
      }
      return upperSymbol.replace(/\//g, '-');

    default:
      // Unknown exchange, return as-is
      return symbol;
  }
}

/**
 * Get both original and normalized symbol
 * Useful for API responses
 */
export function getSymbolVariants(symbol: string, exchangeId: string) {
  return {
    symbol, // Original format
    normalizedSymbol: normalizeSymbol(symbol, exchangeId),
    marketType: detectMarketType(symbol),
  };
}

/**
 * Market types
 */
export type MarketType = 'spot' | 'futures' | 'perpetual' | 'margin';

/**
 * Detect market type from symbol format
 *
 * @param symbol - Trading pair symbol
 * @returns Market type
 *
 * @example
 * detectMarketType('BTC/USDT') // Returns: 'spot'
 * detectMarketType('BTC/USDT:USDT') // Returns: 'perpetual'
 * detectMarketType('BTCUSDT_PERP') // Returns: 'perpetual'
 */
export function detectMarketType(symbol: string): MarketType {
  if (!symbol) return 'spot';

  const upperSymbol = symbol.toUpperCase();

  // 包含 : 表示衍生品 (CCXT unified format)
  if (upperSymbol.includes(':')) {
    return 'perpetual';
  }

  // 包含 _PERP, _SWAP 等后缀
  if (upperSymbol.includes('_PERP') || upperSymbol.includes('_SWAP')) {
    return 'perpetual';
  }

  // 包含 -SWAP (OKX format)
  if (upperSymbol.includes('-SWAP')) {
    return 'perpetual';
  }

  // 包含 -INTX (Coinbase perpetual)
  if (upperSymbol.includes('-INTX')) {
    return 'perpetual';
  }

  // 包含 FUTURES
  if (upperSymbol.includes('FUTURES')) {
    return 'futures';
  }

  // 默认是现货
  return 'spot';
}

/**
 * Check if symbol is for futures/perpetual market
 */
export function isFuturesMarket(
  symbolOrMarketType: string | MarketType
): boolean {
  const marketType =
    typeof symbolOrMarketType === 'string' &&
    (symbolOrMarketType === 'spot' ||
      symbolOrMarketType === 'futures' ||
      symbolOrMarketType === 'perpetual' ||
      symbolOrMarketType === 'margin')
      ? (symbolOrMarketType as MarketType)
      : detectMarketType(symbolOrMarketType);

  return marketType === 'futures' || marketType === 'perpetual';
}
