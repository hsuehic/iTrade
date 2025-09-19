// Base classes
export { BaseExchange } from './base/BaseExchange';

// Exchange implementations
export { BinanceExchange } from './binance/BinanceExchange';

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
} from '@crypto-trading/core';
