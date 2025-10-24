import { Decimal } from 'decimal.js';

// Re-export subscription types
export * from './subscription';

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
  interval: string;
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
  clientOrderId?: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: Decimal;
  price?: Decimal;
  stopPrice?: Decimal;
  status: OrderStatus;
  timeInForce: TimeInForce;
  timestamp: Date;
  updateTime?: Date;
  executedQuantity?: Decimal;
  cummulativeQuoteQuantity?: Decimal;
  fills?: OrderFill[];
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
}

// Account Types
export interface AccountInfo {
  balances: Balance[];
  canTrade: boolean;
  canWithdraw: boolean;
  canDeposit: boolean;
  updateTime: Date;
}

// Strategy Types
export interface StrategyParameters {
  symbol?: string; // Trading symbol
  exchange?: string; // supported  exchange
  subscription?: import('./subscription').SubscriptionConfig; // Auto-subscription configuration
  [key: string]: unknown; // Allow additional custom parameters
}

export interface StrategyResult {
  action: 'buy' | 'sell' | 'hold';
  quantity?: Decimal;
  price?: Decimal;
  stopLoss?: Decimal;
  takeProfit?: Decimal;
  confidence?: number;
  reason?: string;
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
