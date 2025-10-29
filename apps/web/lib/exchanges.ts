/**
 * Supported exchanges configuration
 */

export const SUPPORTED_EXCHANGES = [
  {
    id: 'binance',
    name: 'Binance',
    description: 'Most popular',
    symbolFormat: 'BTC/USDT (Spot), BTC/USDT:USDT (Futures)',
    symbolExample: 'BTC/USDT',
    color: '#F3BA2F', // Binance yellow
    iconEmoji: '🟡',
    logoUrl: '/logos/binance.png', // Square PNG logo
    supportsFutures: true,
    futuresFormat: 'BTC/USDT:USDT', // Perpetual futures (unified format)
  },
  {
    id: 'coinbase',
    name: 'Coinbase',
    description: 'US-based',
    symbolFormat: 'BTC/USDC (Spot), BTC/USDC:USDC (Perp)',
    symbolExample: 'BTC/USDC',
    color: '#0052FF', // Coinbase blue
    iconEmoji: '🔵',
    logoUrl: '/logos/coinbase.png', // Square PNG logo
    supportsFutures: true,
    futuresFormat: 'BTC/USDC:USDC', // Perpetual (USDC-based)
  },
  {
    id: 'okx',
    name: 'OKX',
    description: 'Global',
    symbolFormat: 'BTC/USDT (Spot), BTC/USDT:USDT (Swap)',
    symbolExample: 'BTC/USDT',
    color: '#000000', // OKX black
    iconEmoji: '⚫',
    logoUrl: '/logos/okx.png', // Square PNG logo
    supportsFutures: true,
    futuresFormat: 'BTC/USDT:USDT', // Perpetual swap (unified format)
  },
] as const;

export type ExchangeId = (typeof SUPPORTED_EXCHANGES)[number]['id'];
export type ExchangeInfo = (typeof SUPPORTED_EXCHANGES)[number];

/**
 * Get exchange information by ID
 */
export function getExchangeInfo(exchangeId: string): ExchangeInfo | undefined {
  return SUPPORTED_EXCHANGES.find((ex) => ex.id === exchangeId);
}

/**
 * Get symbol format hint for an exchange
 */
export function getSymbolFormatHint(exchangeId: string): string {
  const exchange = getExchangeInfo(exchangeId);
  return exchange?.symbolFormat || 'e.g., BTC/USDT, ETH/USD';
}

/**
 * Get default symbol for an exchange
 */
export function getDefaultSymbol(exchangeId: string): string {
  const exchange = getExchangeInfo(exchangeId);
  return exchange?.symbolExample || 'BTC/USDT';
}

/**
 * Get exchange color
 */
export function getExchangeColor(exchangeId: string): string {
  const exchange = getExchangeInfo(exchangeId);
  return exchange?.color || '#666666';
}

/**
 * Get exchange icon emoji
 */
export function getExchangeIcon(exchangeId: string): string {
  const exchange = getExchangeInfo(exchangeId);
  return exchange?.iconEmoji || '💱';
}

/**
 * Get exchange logo URL
 */
export function getExchangeLogoUrl(exchangeId: string): string | undefined {
  const exchange = getExchangeInfo(exchangeId);
  return exchange?.logoUrl;
}

export const SUPPORTED_BASE_CURRENCIES = [
  'BTC',
  'ETH',
  'SOL',
  'LTC',
  'XRP',
  'DOGE',
  'WLD',
  'APT',
  'ARB',
  'OP',
  'OKB',
  'ADA',
  'DOT',
  'LINK',
  'SUI',
  'UNI',
  'FIL',
] as const;

export const SUPPORTED_QUOTE_CURRENCIES = {
  binance: ['USDT'],
  okx: ['USDT'],
  coinbase: ['USDC'],
} as const;

export interface TradingPair {
  symbol: string;
  base: string;
  quote: string;
  name: string;
  type: 'spot' | 'perpetual';
  exchange: ExchangeId;
}

/**
 * Common trading pairs with crypto icons
 * Format:
 * - Spot: BTC/USDT, BTC/USD
 * - Perpetual: BTC/USDT:USDT (Binance/OKX), BTC/USDC:USDC (Coinbase)
 * Backend will normalize to exchange-specific format:
 * - Binance: BTCUSDT (spot), BTCUSDT (perpetual)
 * - OKX: BTC-USDT (spot), BTC-USDT-SWAP (perpetual)
 * - Coinbase: BTC-USD (spot), BTC-PERP-INTX (perpetual with USDC)
 */
export const COMMON_TRADING_PAIRS = [
  // Spot pairs (USDT-based - Binance/OKX)
  {
    symbol: 'BTC/USDT',
    base: 'BTC',
    quote: 'USDT',
    name: 'Bitcoin',
    type: 'spot',
    exchange: 'binance,okx',
  },
  {
    symbol: 'ETH/USDT',
    base: 'ETH',
    quote: 'USDT',
    name: 'Ethereum',
    type: 'spot',
    exchange: 'binance,okx',
  },
  {
    symbol: 'BNB/USDT',
    base: 'BNB',
    quote: 'USDT',
    name: 'BNB',
    type: 'spot',
    exchange: 'binance,okx',
  },
  {
    symbol: 'SOL/USDT',
    base: 'SOL',
    quote: 'USDT',
    name: 'Solana',
    type: 'spot',
    exchange: 'binance,okx',
  },

  // Spot pairs (USDC-based - Coinbase)
  {
    symbol: 'BTC/USDC',
    base: 'BTC',
    quote: 'USDC',
    name: 'Bitcoin',
    type: 'spot',
    exchange: 'coinbase',
  },
  {
    symbol: 'ETH/USDC',
    base: 'ETH',
    quote: 'USDC',
    name: 'Ethereum',
    type: 'spot',
    exchange: 'coinbase',
  },

  // Perpetual contracts - USDT-based (Binance/OKX)
  {
    symbol: 'BTC/USDT:USDT',
    base: 'BTC',
    quote: 'USDT',
    name: 'Bitcoin Perp',
    type: 'perpetual',
    exchange: 'binance,okx',
  },
  {
    symbol: 'ETH/USDT:USDT',
    base: 'ETH',
    quote: 'USDT',
    name: 'Ethereum Perp',
    type: 'perpetual',
    exchange: 'binance,okx',
  },
  {
    symbol: 'SOL/USDT:USDT',
    base: 'SOL',
    quote: 'USDT',
    name: 'Solana Perp',
    type: 'perpetual',
    exchange: 'binance,okx',
  },

  // Perpetual contracts - USDC-based (Coinbase)
  {
    symbol: 'BTC/USDC:USDC',
    base: 'BTC',
    quote: 'USDC',
    name: 'Bitcoin Perp',
    type: 'perpetual',
    exchange: 'coinbase',
  },
  {
    symbol: 'ETH/USDC:USDC',
    base: 'ETH',
    quote: 'USDC',
    name: 'Ethereum Perp',
    type: 'perpetual',
    exchange: 'coinbase',
  },
] as const;

/**
 * Get crypto icon URL from local public directory
 */
export function getCryptoIconUrl(symbol: string): string {
  const symbolLower = symbol.toLowerCase();
  // Using local crypto icons stored in /public/crypto-icons/
  return `/crypto-icons/${symbolLower}@2x.png`;
}

/**
 * Extract base currency from trading pair
 */
export function extractBaseCurrency(symbol: string): string {
  const parts = symbol.split('/');
  return parts[0] || symbol;
}

/**
 * Get trading pairs for a specific exchange
 */
export function getTradingPairsForExchange(exchangeId: ExchangeId): TradingPair[] {
  const quoteCurrencies = SUPPORTED_QUOTE_CURRENCIES[exchangeId];
  const perpetualPairs = quoteCurrencies.reduce((pre, quote) => {
    return [
      ...pre,
      ...SUPPORTED_BASE_CURRENCIES.map((base) => {
        return {
          type: 'perpetual' as const,
          exchange: exchangeId,
          symbol: `${base}/${quote}:${quote}`,
          name: `${base} Perp`,
          base,
          quote,
        };
      }),
    ];
  }, [] as TradingPair[]);
  const spotPairs = quoteCurrencies.reduce((acc, quote) => {
    return [
      ...acc,
      ...SUPPORTED_BASE_CURRENCIES.map((base) => {
        return {
          type: 'spot' as const,
          exchange: exchangeId,
          symbol: `${base}/${quote}`,
          name: `${base}`,
          base,
          quote,
        };
      }),
    ];
  }, [] as TradingPair[]);
  return [...perpetualPairs, ...spotPairs];
}

/**
 * Get default trading pair for an exchange (preferably perpetual)
 */
export function getDefaultTradingPair(exchangeId: ExchangeId): string {
  const exchangePairs = getTradingPairsForExchange(exchangeId);

  // First try to find a perpetual BTC pair
  const btcPerp = exchangePairs.find(
    (pair) => pair.base === 'BTC' && pair.type === 'perpetual',
  );
  if (btcPerp) return btcPerp.symbol;

  // Then try any perpetual pair
  const anyPerp = exchangePairs.find((pair) => pair.type === 'perpetual');
  if (anyPerp) return anyPerp.symbol;

  // Finally fall back to any BTC pair or first available
  const btcSpot = exchangePairs.find((pair) => pair.base === 'BTC');
  if (btcSpot) return btcSpot.symbol;

  return exchangePairs[0]?.symbol || 'BTC/USDT';
}

/**
 * Normalize symbol to exchange-specific format
 * This mirrors the backend normalizeSymbol logic
 */
export function normalizeSymbolForExchange(symbol: string, exchangeId: string): string {
  const upperSymbol = symbol.toUpperCase();

  switch (exchangeId.toLowerCase()) {
    case 'binance':
      // Binance: BTCUSDT for both spot and perpetual
      if (upperSymbol.includes(':')) {
        const [pair] = upperSymbol.split(':');
        return pair.replace('/', '').replace('-', '');
      }
      if (upperSymbol.includes('_PERP') || upperSymbol.includes('_SWAP')) {
        return upperSymbol.replace('/', '').replace('-', '');
      }
      return upperSymbol.replace('/', '').replace('-', '');

    case 'okx':
      // OKX: BTC-USDT (spot), BTC-USDT-SWAP (perpetual)
      if (upperSymbol.includes(':')) {
        const [pair] = upperSymbol.split(':');
        const base = pair.replace('/', '-');
        return `${base}-SWAP`;
      }
      if (upperSymbol.includes('-SWAP') || upperSymbol.includes('-FUTURES')) {
        return upperSymbol.replace('/', '-');
      }
      return upperSymbol.replace('/', '-');

    case 'coinbase':
      // Coinbase: BTC-USD (spot), BTC-PERP-INTX (perpetual)
      if (upperSymbol.includes(':')) {
        const [pair] = upperSymbol.split(':');
        const base = pair.split('/')[0];
        return `${base}-PERP-INTX`;
      }
      if (upperSymbol.includes('-PERP-INTX') || upperSymbol.includes('-PERP')) {
        return upperSymbol;
      }
      return upperSymbol.replace('/', '-');

    default:
      return symbol;
  }
}
