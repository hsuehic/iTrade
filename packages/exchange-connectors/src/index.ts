// Base classes
export { BaseExchange } from './base/BaseExchange';
export { MarketDataExchange } from './base/MarketDataExchange';

// Exchange implementations
export { BinanceExchange } from './binance/BinanceExchange';
export { CoinbaseExchange } from './coinbase/CoinbaseExchange';

// Re-export types from core for convenience
export type {
  IExchange,
  ExchangeCredentials,
  ExchangeInfo,
  Order,
  OrderSide,
  OrderType,
  OrderStatus,
  TimeInForce,
  Ticker,
  OrderBook,
  Trade,
  Kline,
  AccountInfo,
  Balance,
  Position,
} from '@itrade/core';
