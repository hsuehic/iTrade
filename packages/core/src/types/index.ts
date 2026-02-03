import { Decimal } from 'decimal.js';

// Re-export subscription types
export * from './subscription';

// Re-export strategy types
export * from './strategy-types';

// Strategy Health Status
export interface StrategyHealthStatus {
  status: 'healthy' | 'unhealthy' | 'initializing' | 'stopped';
  message: string;
  timestamp: Date;
  lastSignal?: string;
  currentPosition?: Decimal;
}

// Initial Data Configuration Types

/**
 * Supported kline/candlestick intervals
 * Shared across all exchanges (Binance, OKX, Coinbase)
 */
export type KlineInterval =
  | '1m' // 1 minute
  | '3m' // 3 minutes
  | '5m' // 5 minutes
  | '15m' // 15 minutes
  | '30m' // 30 minutes
  | '1h' // 1 hour
  | '2h' // 2 hours
  | '4h' // 4 hours
  | '6h' // 6 hours
  | '8h' // 8 hours
  | '12h' // 12 hours
  | '1d' // 1 day
  | '3d' // 3 days
  | '1w' // 1 week
  | '1M'; // 1 month

/**
 * Initial data configuration for strategy initialization
 * Defines what historical and current data to load before strategy starts
 */
export interface InitialDataConfig {
  // Historical kline data
  // Format: { "interval": limit }
  // Example: { "15m": 20, "1h": 10 } - fetches 20 bars of 15m and 10 bars of 1h
  klines?: Partial<Record<KlineInterval, number>>;

  // Account data
  fetchPositions?: boolean; // Fetch current positions for the symbol
  fetchOpenOrders?: boolean; // Fetch open orders for the symbol
  fetchBalance?: boolean; // Fetch account balance
  fetchAccountInfo?: boolean; // Fetch full account info

  // Market data snapshot
  fetchTicker?: boolean; // Fetch current ticker
  fetchOrderBook?: {
    enabled: boolean;
    depth?: number; // Order book depth (default: 20)
  };
}

export interface InitialDataResult {
  // Historical data
  klines?: Partial<Record<KlineInterval, Kline[]>>; // interval -> klines[]

  // Account data
  positions?: Position[];
  openOrders?: Order[];
  balance?: Balance[];
  accountInfo?: AccountInfo;

  // Market data
  ticker?: Ticker;
  orderBook?: OrderBook;

  // Metadata
  symbol: string;
  exchange: string;
  timestamp: Date;
}

// Market Data Types
export interface Ticker {
  symbol: string;
  price: Decimal;
  volume: Decimal;
  timestamp: Date;
  bid?: Decimal;
  ask?: Decimal;
  high24h?: Decimal;
  low24h?: Decimal;
  change24h?: Decimal;
  exchange?: string; // 交易所名称，用于区分多交易所数据
}

export interface OrderBook {
  symbol: string;
  timestamp: Date;
  bids: Array<[Decimal, Decimal]>; // [price, quantity]
  asks: Array<[Decimal, Decimal]>; // [price, quantity]
  exchange?: string; // 交易所名称，用于区分多交易所数据
}

export enum TradeMode {
  CASH = 'cash',
  ISOLATED = 'isolated',
  CROSS = 'cross',
}
export interface Trade {
  id: string;
  symbol: string;
  price: Decimal;
  quantity: Decimal;
  side: 'buy' | 'sell';
  timestamp: Date;
  takerOrderId?: string;
  makerOrderId?: string;
  exchange?: string; // 交易所名称，用于区分多交易所数据
}

export interface Kline {
  symbol: string;
  interval: KlineInterval;
  openTime: Date;
  closeTime: Date;
  open: Decimal;
  high: Decimal;
  low: Decimal;
  close: Decimal;
  volume: Decimal;
  quoteVolume: Decimal;
  trades: number;
  takerBuyBaseVolume?: Decimal;
  takerBuyQuoteVolume?: Decimal;
  isClosed?: boolean; // Whether the kline is closed (true) or still forming (false)
  exchange?: string; // 交易所名称，用于区分多交易所数据
}

// Order Types
export enum OrderType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
  STOP_LOSS = 'STOP_LOSS',
  STOP_LOSS_LIMIT = 'STOP_LOSS_LIMIT',
  TAKE_PROFIT = 'TAKE_PROFIT',
  TAKE_PROFIT_LIMIT = 'TAKE_PROFIT_LIMIT',
}

export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum OrderStatus {
  NEW = 'NEW',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  FILLED = 'FILLED',
  CANCELED = 'CANCELED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

export enum TimeInForce {
  GTC = 'GTC', // Good Till Cancel
  IOC = 'IOC', // Immediate or Cancel
  FOK = 'FOK', // Fill or Kill
}

export interface Order {
  id: string;
  clientOrderId?: string; // Optional: may not be present for orders not created by our system
  userId?: string; // Owning user for authorization and scoping
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: Decimal;
  price?: Decimal; // Limit price for the order
  stopPrice?: Decimal; // Trigger price for stop orders (STOP_LOSS, TAKE_PROFIT, etc.)
  status: OrderStatus;
  timeInForce: TimeInForce;
  timestamp: Date;
  updateTime?: Date;
  executedQuantity?: Decimal;
  cummulativeQuoteQuantity?: Decimal;
  fills?: OrderFill[];

  // 🆕 Strategy and exchange association (application layer only, not sent to exchange API)
  exchange?: string; // Exchange name (e.g., 'binance', 'okx', 'coinbase')
  strategyId?: number; // Strategy ID for database association
  strategyType?: string; // Strategy type/class (e.g., "MovingAverage", "RSI") - for analytics
  strategyName?: string; // User-defined strategy name (e.g., "MA_1") - for display and logging

  // Futures/Margin specific fields (from exchange responses)
  realizedPnl?: Decimal;
  unrealizedPnl?: Decimal;
  averagePrice?: Decimal;
  commission?: Decimal;
  commissionAsset?: string;
}

export interface OrderFill {
  id: string;
  price: Decimal;
  quantity: Decimal;
  commission: Decimal;
  commissionAsset: string;
  timestamp: Date;
}

// Position and Balance Types
export interface Balance {
  asset: string;
  free: Decimal;
  locked: Decimal;
  saving?: Decimal;
  total: Decimal;
}

export interface Position {
  symbol: string;
  side: 'long' | 'short';
  quantity: Decimal;
  avgPrice: Decimal;
  markPrice: Decimal;
  unrealizedPnl: Decimal;
  leverage: Decimal;
  timestamp: Date;
  // Optional: Market value of the position (quantity * markPrice)
  marketValue?: Decimal;
  // Optional: Position value in USD (from exchange, e.g., OKX's notionalUsd)
  notionalUsd?: string;
}

// Account Types
export interface AccountInfo {
  balances: Balance[];
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
  updateTime: Date;
  totalEquity?: Decimal; // Total equity in USD (or reference currency)
}

export enum SignalType {
  Entry = 'entry',
  TakeProfit = 'take_profit',
  StopLoss = 'stop_loss',
  TrailingStop = 'trailing_stop',
}

export interface SignalMetaData {
  signalType: SignalType;
  timestamp?: number;
  clientOrderId?: string;
  parentOrderId?: string;
  entryPrice?: string;
  takeProfitPrice?: string;
  profitRatio?: number;
}

/**
 * Strategy Result Types
 *
 * A strategy can return:
 * - StrategyOrderResult: Place a buy/sell order
 * - StrategyCancelOrderResult: Cancel an existing order
 * - StrategyHoldResult: Do nothing (hold)
 *
 * analyze() can return a single result or an array of results
 * when multiple actions need to be taken simultaneously
 * (e.g., place TP order + place next entry order)
 */
export type StrategyResult =
  | StrategyOrderResult
  | StrategyCancelOrderResult
  | StrategyHoldResult;

/**
 * Result type for analyze() method - can be single or array
 * Use array when strategy needs to return multiple signals at once
 */
export type StrategyAnalyzeResult = StrategyResult | StrategyResult[];

/**
 * Order placement result - buy or sell
 */
export interface StrategyOrderResult {
  action: 'buy' | 'sell';
  clientOrderId: string;
  symbol?: string;
  quantity?: Decimal;
  price?: Decimal; // Limit price for the main/initial order
  confidence?: number;
  reason?: string;

  // Trading mode and leverage (for futures/margin)
  tradeMode?: TradeMode; // cash=spot, isolated/cross=margin/futures
  leverage?: number; // Leverage multiplier (e.g., 1, 2, 5, 10)
  metadata?: SignalMetaData;
}

/**
 * Cancel order result - request to cancel an existing order
 */
export interface StrategyCancelOrderResult {
  action: 'cancel';
  /** Order ID to cancel (exchange order ID) */
  orderId?: string;
  /** Client order ID to cancel (strategy-generated ID) */
  clientOrderId?: string;
  /** Symbol of the order to cancel */
  symbol?: string;
  /** Reason for cancellation */
  reason?: string;
}

/**
 * Hold result - do nothing
 */
export interface StrategyHoldResult {
  action: 'hold';
  reason?: string;
}

/**
 * Type guard: Check if result is an order (buy/sell)
 */
export function isOrderResult(value: StrategyResult): value is StrategyOrderResult {
  return value.action === 'buy' || value.action === 'sell';
}

/**
 * Type guard: Check if result is a cancel order
 */
export function isCancelOrderResult(
  value: StrategyResult,
): value is StrategyCancelOrderResult {
  return value.action === 'cancel';
}

/**
 * Type guard: Check if result is a hold
 */
export function isHoldResult(value: StrategyResult): value is StrategyHoldResult {
  return value.action === 'hold';
}

/**
 * Type guard: Check if result is actionable (buy, sell, or cancel)
 */
export function isActionableResult(
  value: StrategyResult,
): value is StrategyOrderResult | StrategyCancelOrderResult {
  return value.action !== 'hold';
}

/**
 * Normalize analyze result to array format
 * Utility function for TradingEngine to process results uniformly
 */
export function normalizeAnalyzeResult(result: StrategyAnalyzeResult): StrategyResult[] {
  return Array.isArray(result) ? result : [result];
}

// Exchange Types
export interface ExchangeCredentials {
  apiKey: string;
  secretKey: string;
  passphrase?: string;
  sandbox?: boolean;
}

export interface ExchangeInfo {
  name: string;
  symbols: string[];
  tradingFees: {
    maker: Decimal;
    taker: Decimal;
  };
  minTradeSize: {
    [symbol: string]: Decimal;
  };
}

// Symbol/Product Precision Information
export interface SymbolInfo {
  symbol: string; // Unified format (e.g., BTC/USDT)
  nativeSymbol: string; // Exchange-specific format (e.g., BTCUSDT, BTC-USDT)
  baseAsset: string; // e.g., BTC
  quoteAsset: string; // e.g., USDT
  pricePrecision: number; // Number of decimal places for price
  quantityPrecision: number; // Number of decimal places for quantity
  minQuantity: Decimal; // Minimum order quantity
  maxQuantity?: Decimal; // Maximum order quantity (optional)
  minNotional: Decimal; // Minimum order value (quantity * price)
  stepSize: Decimal; // Quantity increment (e.g., 0.01)
  tickSize: Decimal; // Price increment (e.g., 0.01)
  status: 'active' | 'inactive' | 'pre_trading' | 'post_trading';
  market: 'spot' | 'futures' | 'swap' | 'option';

  // Contract-based instruments (SWAP/FUTURES/OPTIONS)
  // For derivatives, order size is in contracts, not base currency
  contractValue?: Decimal; // Value of 1 contract in base currency (e.g., 0.01 BTC for BTC-USDT-SWAP)
  contractMultiplier?: Decimal; // Contract multiplier (usually 1 for crypto)
}

// Event Types
export interface MarketDataEvent {
  type: 'ticker' | 'orderbook' | 'trade' | 'kline';
  symbol: string;
  data: Ticker | OrderBook | Trade | Kline;
  timestamp: Date;
}

export interface OrderEvent {
  type: 'order_update' | 'order_fill';
  order: Order;
  timestamp: Date;
}

export interface AccountEvent {
  type: 'balance_update' | 'position_update';
  data: Balance[] | Position[];
  timestamp: Date;
}

// Backtest Types
export interface BacktestConfig {
  startDate: Date;
  endDate: Date;
  initialBalance: Decimal;
  commission: Decimal;
  slippage?: Decimal;
  symbols: string[];
  timeframe: string;
}

export interface BacktestResult {
  totalReturn: Decimal;
  annualizedReturn: Decimal;
  sharpeRatio: Decimal;
  maxDrawdown: Decimal;
  winRate: Decimal;
  profitFactor: Decimal;
  totalTrades: number;
  avgTradeDuration: number;
  equity: Array<{ timestamp: Date; value: Decimal }>;
  trades: BacktestTrade[];
}

export interface BacktestTrade {
  symbol: string;
  side: OrderSide;
  entryPrice: Decimal;
  exitPrice: Decimal;
  quantity: Decimal;
  entryTime: Date;
  exitTime: Date;
  pnl: Decimal;
  commission: Decimal;
  duration: number;
}

// Risk Management Types
export interface RiskLimits {
  maxPositionSize: Decimal;
  maxDailyLoss: Decimal;
  maxDrawdown: Decimal;
  maxOpenPositions: number;
  maxLeverage: Decimal;
}

export interface RiskMetrics {
  currentDrawdown: Decimal;
  dailyPnl: Decimal;
  openPositions: number;
  totalExposure: Decimal;
  leverage: Decimal;
}

// Data Management Types
export interface DataSource {
  type: 'file' | 'database' | 'cache';
  location: string;
  options?: Record<string, unknown>;
}

export interface DataQueryOptions {
  symbol?: string;
  interval?: string;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  sort?: 'asc' | 'desc';
}

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  maxSize?: number; // Maximum number of items
  checkPeriod?: number; // Cleanup interval in milliseconds
}

// Portfolio Management Types
export interface PortfolioSnapshot {
  timestamp: Date;
  totalValue: Decimal;
  positions: Position[];
  balances: Balance[];
}

export interface PerformanceMetrics {
  totalReturn: Decimal;
  annualizedReturn: Decimal;
  sharpeRatio: Decimal;
  maxDrawdown: Decimal;
  winRate: Decimal;
  profitFactor: Decimal;
  volatility?: Decimal;
  averageWin?: Decimal;
  averageLoss?: Decimal;
}

export interface PositionSummary {
  symbol: string;
  side: 'long' | 'short';
  quantity: Decimal;
  avgEntryPrice: Decimal;
  unrealizedPnl: Decimal;
  realizedPnl: Decimal;
  currentPrice: Decimal;
  marketValue: Decimal;
}

// Logger Types
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

// Risk Management Types
export interface RiskAlert {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp?: Date;
  data?: Record<string, unknown>;
}

// Account Snapshot Types
export interface AccountSnapshot {
  id?: number;
  exchange: string;
  timestamp: Date;
  totalBalance: Decimal;
  availableBalance: Decimal;
  lockedBalance: Decimal;
  totalPositionValue: Decimal;
  unrealizedPnl: Decimal;
  positionCount: number;
  balances: Balance[];
  positions: Position[];
}
