// Base classes
export { BaseExchange } from './base/BaseExchange';
export { MarketDataExchange } from './base/MarketDataExchange';

// Exchange implementations
export { BinanceExchange } from './binance/BinanceExchange';
export { BinanceWebsocket } from './binance/BinanceWebsocket';
export type { BinanceWebsocketEventMap } from './binance/BinanceWebsocket';
export { CoinbaseExchange } from './coinbase/CoinbaseExchange';
export { CoinbaseAdvancedExchange } from './coinbase-adv/CoinbaseAdvancedExchange';
export { OKXExchange, type OKXCredentials } from './okx/OKXExchange';

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
