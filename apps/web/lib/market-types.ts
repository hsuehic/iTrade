/**
 * Market Module Types
 * Types and interfaces for the market data display
 */

export interface PerpetualTicker {
  symbol: string;
  displaySymbol: string;
  base: string;
  price: number;
  priceStr: string;
  change24h: number;
  changePrice24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  fundingRate: number;
  fundingTime: number;
  openInterest: number;
  markPrice: number;
  indexPrice: number;
  exchange: 'Binance' | 'OKX';
  priceHistory: number[];
  lastUpdate: number;
}

export interface MarketStats {
  totalVolume24h: number;
  totalOpenInterest: number;
  btcDominance: number;
  avgFundingRate: number;
  totalMarketCap?: number;
  tickersCount: number;
  gainersCount: number;
  losersCount: number;
}

export interface FundingRateData {
  symbol: string;
  base: string;
  fundingRate: number;
  nextFundingTime: number;
  exchange: string;
  predictedRate?: number;
}

// Binance WebSocket ticker response
export interface BinancePerpTicker {
  e: string; // Event type
  s: string; // Symbol
  c: string; // Close price
  o: string; // Open price
  h: string; // High price
  l: string; // Low price
  q: string; // Total traded quote asset volume
  P: string; // Price change percent
  p: string; // Price change
  r: string; // Funding rate
  T: number; // Next funding time
}

// Binance Mark Price Stream
export interface BinanceMarkPrice {
  e: string; // Event type
  s: string; // Symbol
  p: string; // Mark price
  i: string; // Index price
  r: string; // Funding rate
  T: number; // Next funding time
}

// OKX WebSocket ticker response
export interface OKXPerpTicker {
  instId: string;
  last: string;
  open24h: string;
  high24h: string;
  low24h: string;
  volCcy24h: string;
  vol24h: string;
}

// OKX Funding Rate response
export interface OKXFundingRate {
  instId: string;
  fundingRate: string;
  nextFundingRate: string;
  fundingTime: string;
}

// Price update for mini charts
export interface PriceUpdate {
  symbol: string;
  price: number;
  timestamp: number;
}

// Market filter options
export type MarketFilter = 'all' | 'gainers' | 'losers' | 'volume' | 'funding';
export type TimeFrame = '1h' | '4h' | '24h' | '7d';

// Color schemes for heatmap
export const HEATMAP_COLORS = {
  extremeGain: '#00C853', // Green +5%+
  strongGain: '#4CAF50', // Light green +3-5%
  moderateGain: '#81C784', // Pale green +1-3%
  slightGain: '#A5D6A7', // Very pale green +0-1%
  neutral: '#424242', // Gray
  slightLoss: '#EF9A9A', // Very pale red -0-1%
  moderateLoss: '#E57373', // Pale red -1-3%
  strongLoss: '#F44336', // Light red -3-5%
  extremeLoss: '#D50000', // Red -5%+
} as const;

/**
 * Get heatmap color based on price change percentage
 */
export function getHeatmapColor(change: number): string {
  if (change >= 5) return HEATMAP_COLORS.extremeGain;
  if (change >= 3) return HEATMAP_COLORS.strongGain;
  if (change >= 1) return HEATMAP_COLORS.moderateGain;
  if (change >= 0) return HEATMAP_COLORS.slightGain;
  if (change >= -1) return HEATMAP_COLORS.slightLoss;
  if (change >= -3) return HEATMAP_COLORS.moderateLoss;
  if (change >= -5) return HEATMAP_COLORS.strongLoss;
  return HEATMAP_COLORS.extremeLoss;
}

/**
 * Format large numbers for display
 */
export function formatLargeNumber(num: number): string {
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

/**
 * Format funding rate percentage
 */
export function formatFundingRate(rate: number): string {
  const percentage = rate * 100;
  const sign = percentage >= 0 ? '+' : '';
  return `${sign}${percentage.toFixed(4)}%`;
}

/**
 * Format price with appropriate decimals
 */
export function formatPrice(price: number): string {
  if (price >= 10000) return price.toFixed(0);
  if (price >= 100) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

/**
 * Supported perpetual symbols for each exchange
 */
export const PERPETUAL_SYMBOLS = {
  binance: [
    { symbol: 'BTCUSDT', base: 'BTC', name: 'Bitcoin' },
    { symbol: 'ETHUSDT', base: 'ETH', name: 'Ethereum' },
    { symbol: 'SOLUSDT', base: 'SOL', name: 'Solana' },
    { symbol: 'XRPUSDT', base: 'XRP', name: 'Ripple' },
    { symbol: 'DOGEUSDT', base: 'DOGE', name: 'Dogecoin' },
    { symbol: 'ADAUSDT', base: 'ADA', name: 'Cardano' },
    { symbol: 'AVAXUSDT', base: 'AVAX', name: 'Avalanche' },
    { symbol: 'LINKUSDT', base: 'LINK', name: 'Chainlink' },
    { symbol: 'DOTUSDT', base: 'DOT', name: 'Polkadot' },
    { symbol: 'MATICUSDT', base: 'MATIC', name: 'Polygon' },
    { symbol: 'LTCUSDT', base: 'LTC', name: 'Litecoin' },
    { symbol: 'WLDUSDT', base: 'WLD', name: 'Worldcoin' },
    { symbol: 'APTUSDT', base: 'APT', name: 'Aptos' },
    { symbol: 'OPUSDT', base: 'OP', name: 'Optimism' },
    { symbol: 'ARBUSDT', base: 'ARB', name: 'Arbitrum' },
    { symbol: 'SUIUSDT', base: 'SUI', name: 'Sui' },
    { symbol: 'INJUSDT', base: 'INJ', name: 'Injective' },
    { symbol: 'TIAUSDT', base: 'TIA', name: 'Celestia' },
    { symbol: 'SEIUSDT', base: 'SEI', name: 'Sei' },
    { symbol: 'NEARUSDT', base: 'NEAR', name: 'Near' },
  ],
  okx: [
    { symbol: 'BTC-USDT-SWAP', base: 'BTC', name: 'Bitcoin' },
    { symbol: 'ETH-USDT-SWAP', base: 'ETH', name: 'Ethereum' },
    { symbol: 'SOL-USDT-SWAP', base: 'SOL', name: 'Solana' },
    { symbol: 'XRP-USDT-SWAP', base: 'XRP', name: 'Ripple' },
    { symbol: 'DOGE-USDT-SWAP', base: 'DOGE', name: 'Dogecoin' },
    { symbol: 'ADA-USDT-SWAP', base: 'ADA', name: 'Cardano' },
    { symbol: 'AVAX-USDT-SWAP', base: 'AVAX', name: 'Avalanche' },
    { symbol: 'LINK-USDT-SWAP', base: 'LINK', name: 'Chainlink' },
    { symbol: 'DOT-USDT-SWAP', base: 'DOT', name: 'Polkadot' },
    { symbol: 'MATIC-USDT-SWAP', base: 'MATIC', name: 'Polygon' },
  ],
};
