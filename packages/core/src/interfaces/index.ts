import { EventEmitter } from 'events';

import { Decimal } from 'decimal.js';

import {
  Order,
  OrderSide,
  OrderType,
  TimeInForce,
  Ticker,
  OrderBook,
  Trade,
  Kline,
  AccountInfo,
  Balance,
  Position,
  ExchangeCredentials,
  ExchangeInfo,
  SymbolInfo,
  StrategyParameters,
  StrategyAnalyzeResult,
  BacktestConfig,
  BacktestResult,
  RiskLimits,
  RiskMetrics,
  InitialDataResult,
  StrategyConfig,
  StrategyRuntimeContext,
  TradeMode,
} from '../types';

// Exchange Interface
export interface IExchange extends EventEmitter {
  readonly name: string;
  readonly isConnected: boolean;

  // Connection Management
  connect(credentials: ExchangeCredentials): Promise<void>;
  disconnect(): Promise<void>;

  // Market Data
  getTicker(symbol: string): Promise<Ticker>;
  getOrderBook(symbol: string, limit?: number): Promise<OrderBook>;
  getTrades(symbol: string, limit?: number): Promise<Trade[]>;
  getKlines(
    symbol: string,
    interval: string,
    startTime?: Date,
    endTime?: Date,
    limit?: number,
  ): Promise<Kline[]>;

  // WebSocket Subscriptions
  subscribeToTicker(symbol: string): Promise<void>;
  subscribeToOrderBook(symbol: string, depth?: number): Promise<void>;
  subscribeToTrades(symbol: string): Promise<void>;
  subscribeToKlines(symbol: string, interval: string): Promise<void>;
  subscribeToUserData(): Promise<void>;
  unsubscribe(
    symbol: string,
    type: 'ticker' | 'orderbook' | 'trades' | 'klines',
  ): Promise<void>;

  // Trading
  createOrder(
    symbol: string,
    side: OrderSide,
    type: OrderType,
    quantity: Decimal,
    price?: Decimal, // Limit price for the order
    timeInForce?: TimeInForce,
    clientOrderId?: string,
    options?: {
      tradeMode?: TradeMode;
      leverage?: number;
    },
  ): Promise<Order>;

  cancelOrder(symbol: string, orderId: string, clientOrderId?: string): Promise<Order>;
  getOrder(symbol: string, orderId: string, clientOrderId?: string): Promise<Order>;
  getOpenOrders(symbol?: string): Promise<Order[]>;
  getOrderHistory(symbol?: string, limit?: number): Promise<Order[]>;

  // Account
  getAccountInfo(): Promise<AccountInfo>;
  getBalances(): Promise<Balance[]>;
  getPositions(): Promise<Position[]>;

  // Exchange Info
  getExchangeInfo(): Promise<ExchangeInfo>;
  getSymbols(): Promise<string[]>;
  getSymbolInfo(symbol: string): Promise<SymbolInfo>;
}

// Strategy State Management Types
export interface StrategyStateSnapshot {
  strategyId?: number;
  strategyType?: string;
  stateVersion?: string;
  timestamp?: Date;
  internalState: Record<string, unknown>;
  indicatorData: Record<string, unknown>;
  lastSignal?: string;
  signalTime?: Date;
  currentPosition: string; // Decimal as string
  averagePrice?: string; // Decimal as string
}

export interface StrategyRecoveryContext {
  recovered?: boolean;
  message?: string;
  metrics?: Record<string, unknown>;
  strategyId?: number;
  savedState?: StrategyStateSnapshot;
  openOrders?: Array<{
    orderId: string;
    status: string;
    executedQuantity: string;
    remainingQuantity: string;
  }>;
  totalPosition?: string;
  lastExecutionTime?: Date;
}

export interface MarketDataUpdate {
  exchangeName?: string;
  symbol?: string;
  // Market Data
  ticker?: Ticker;
  orderbook?: OrderBook;
  trades?: Trade[];
  klines?: Kline[];
}

export interface AccountDataUpdate {
  exchangeName?: string;
  // Account Data
  positions?: Position[];
  orders?: Order[];
  balances?: Balance[];
}

export type DataUpdate = MarketDataUpdate & AccountDataUpdate;

// Strategy Interface
export interface IStrategy<TParams extends StrategyParameters = StrategyParameters> {
  /** Strategy type/class name (e.g., "MovingAverageStrategy") - accessed via getter */
  readonly strategyType: string;

  /** User-defined strategy name (optional, e.g., "MA_1") */
  readonly strategyName?: string;

  /** Get complete configuration (parameters + context) */
  readonly config: StrategyConfig<TParams>;

  /** Get runtime context */
  readonly context: StrategyRuntimeContext;

  /**
   * Analyze market/account data and return trading signals
   *
   * @param dataUpdate - Market data (ticker, orderbook, klines) or account data (orders, positions)
   * @returns Single result or array of results for multiple simultaneous actions
   *          - StrategyOrderResult: Place buy/sell order
   *          - StrategyCancelOrderResult: Cancel existing order
   *          - StrategyHoldResult: Do nothing
   *
   * @example
   * // Single result
   * return { action: 'buy', quantity: new Decimal(100), price: new Decimal(50000) };
   *
   * @example
   * // Multiple results (e.g., TP order + next entry order)
   * return [
   *   { action: 'sell', quantity: new Decimal(100), price: new Decimal(51000), reason: 'take_profit' },
   *   { action: 'buy', quantity: new Decimal(100), price: new Decimal(49000), reason: 'next_entry' }
   * ];
   *
   * @example
   * // Cancel order
   * return { action: 'cancel', clientOrderId: 'E123...', reason: 'replace_with_better_price' };
   */
  analyze(dataUpdate: DataUpdate): Promise<StrategyAnalyzeResult>;

  // Order lifecycle callbacks
  onOrderCreated?(order: Order): Promise<void>; // Called when order is created from strategy signal
  onOrderFilled(order: Order): Promise<void>; // Called when order is filled

  // 🆕 Strategy Name Management (optional - implemented in BaseStrategy)
  setStrategyName?(name: string): void; // Set user-defined strategy name from database

  // 🆕 Strategy ID Management (optional - implemented in BaseStrategy)
  setStrategyId?(id: number): void; // Set strategy ID from database
  getStrategyId?(): number | undefined; // Get strategy ID

  // 🆕 State Management Methods (optional - implemented in BaseStrategy)
  saveState?(): Promise<StrategyStateSnapshot>;
  loadState?(snapshot: StrategyStateSnapshot): Promise<StrategyRecoveryContext>;
  setRecoveryContext?(context: StrategyRecoveryContext): Promise<void>;
  getStateVersion?(): string; // For state schema versioning

  // 🆕 Initial Data Processing (required - implemented in BaseStrategy)
  /**
   * Process initial data loaded by TradingEngine before strategy starts receiving real-time updates
   * This method is called after initial data (klines, positions, orders, etc.) is loaded
   * and before real-time subscriptions begin.
   *
   * Default implementation in BaseStrategy does nothing - derived classes should override
   * if they need to process initial data (e.g., populate buffers, set initial positions, etc.)
   *
   * @param initialData - The loaded initial data containing klines, positions, orders, etc.
   */
  processInitialData(initialData: InitialDataResult): void;

  cleanup?(): Promise<void>;
}

export interface ExecuteOrderParameters {
  strategyName: string;
  strategyId?: number; // 🆕 Strategy ID for order tracking (optional)
  symbol: string;
  side: OrderSide;
  quantity: Decimal;
  type: OrderType;
  price?: Decimal; // Limit price for the main/initial order
  tradeMode?: TradeMode; // Trading mode for margin/futures
  leverage?: number; // Leverage multiplier
  clientOrderId?: string; // 🆕 Client order ID from strategy signal metadata (optional)

  // Note: Stop loss and take profit should be implemented as separate orders
}

// Trading Engine Interface
export interface ITradingEngine extends EventEmitter {
  readonly isRunning: boolean;
  readonly strategies: Map<string, IStrategy>;

  // Engine Management
  start(): Promise<void>;
  stop(): Promise<void>;

  // Strategy Management
  addStrategy(name: string, strategy: IStrategy): void;
  removeStrategy(name: string): void;
  getStrategy(name: string): IStrategy | undefined;

  // Exchange Management
  addExchange(name: string, exchange: IExchange): Promise<void>;
  removeExchange(name: string): void;

  // Market Data Handling
  onMarketData(symbol: string, data: Ticker | OrderBook | Trade | Kline): Promise<void>;

  // Order Management
  executeOrder(params: ExecuteOrderParameters): Promise<Order>;

  // Position Management
  getPositions(): Promise<Position[]>;
  getPosition(symbol: string): Promise<Position | undefined>;
}

// Data Manager Interface
export interface IDataManager {
  // Historical Data
  saveKlines(symbol: string, interval: string, klines: Kline[]): Promise<void>;
  getKlines(
    symbol: string,
    interval: string,
    startTime: Date,
    endTime: Date,
    limit?: number,
  ): Promise<Kline[]>;

  saveTrades(symbol: string, trades: Trade[]): Promise<void>;
  getTrades(
    symbol: string,
    startTime: Date,
    endTime: Date,
    limit?: number,
  ): Promise<Trade[]>;

  // Real-time Data Cache
  cacheTicker?(symbol: string, ticker: Ticker): Promise<void>;
  getCachedTicker?(symbol: string): Promise<Ticker | undefined>;

  cacheOrderBook?(symbol: string, orderbook: OrderBook): Promise<void>;
  getCachedOrderBook?(symbol: string): Promise<OrderBook | undefined>;

  // Data Quality
  validateData(symbol: string, interval: string): Promise<boolean>;
  cleanData(symbol: string, interval: string): Promise<number>;

  // Utility methods
  getAvailableSymbols?(): Promise<string[]>;
  getAvailableIntervals?(symbol: string): Promise<string[]>;
}

// Backtesting Engine Interface
export interface IBacktestEngine {
  // Backtest Execution
  runBacktest(
    strategy: IStrategy,
    config: BacktestConfig,
    dataManager: IDataManager,
  ): Promise<BacktestResult>;

  // Performance Analysis
  calculateMetrics(trades: Trade[], initialBalance: Decimal): BacktestResult;
  generateReport(result: BacktestResult): string;

  // Data Simulation
  simulateMarketData(
    symbol: string,
    startTime: Date,
    endTime: Date,
    timeframe: string,
  ): AsyncGenerator<Kline>;
}

// Risk Manager Interface
export interface IRiskManager {
  readonly limits: RiskLimits;

  // Risk Checking
  checkOrderRisk(
    order: Order,
    currentPositions: Position[],
    balances: Balance[],
  ): Promise<boolean>;
  checkPositionRisk(position: Position, limits: RiskLimits): Promise<boolean>;

  // Risk Metrics
  calculateRiskMetrics(positions: Position[], balances: Balance[]): Promise<RiskMetrics>;

  // Risk Limits Management
  updateLimits(limits: Partial<RiskLimits>): void;
  getLimits(): RiskLimits;

  // Emergency Actions
  liquidateAllPositions(): Promise<void>;
  stopAllTrading(): Promise<void>;
}

// Portfolio Manager Interface
export interface IPortfolioManager {
  // Portfolio State
  getPortfolioValue(): Promise<Decimal>;
  getPositions(): Promise<Position[]>;
  getBalances(): Promise<Balance[]>;

  // Position Management
  updatePosition(
    symbol: string,
    side: OrderSide,
    size: Decimal,
    price: Decimal,
  ): Promise<void>;
  closePosition(symbol: string): Promise<void>;

  // Performance Tracking
  getUnrealizedPnl(): Promise<Decimal>;
  getRealizedPnl(period?: { start: Date; end: Date }): Promise<Decimal>;

  // Portfolio Analytics
  calculateSharpeRatio(period: { start: Date; end: Date }): Promise<Decimal>;
  calculateMaxDrawdown(period: { start: Date; end: Date }): Decimal;
  getPerformanceMetrics(period: { start: Date; end: Date }): Promise<{
    totalReturn: Decimal;
    annualizedReturn: Decimal;
    volatility: Decimal;
    sharpeRatio: Decimal;
    maxDrawdown: Decimal;
  }>;
}

// Logger Interface
export interface ILogger {
  debug(message: string, metadata?: Record<string, unknown>): void;
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, error?: Error, metadata?: Record<string, unknown>): void;

  // Trading specific logging
  logOrder(message: string, data: Record<string, unknown>): void;
  logTrade(message: string, data: Record<string, unknown>): void;
  logStrategy(message: string, data: Record<string, unknown>): void;
  logRisk(message: string, data: Record<string, unknown>): void;
}

// Configuration Interface
export interface IConfig {
  get<T = unknown>(key: string, defaultValue?: T): T;
  set(key: string, value: unknown): void;
  has(key: string): boolean;

  // Specific configuration getters
  getExchangeConfig(exchangeName: string): ExchangeCredentials;
  getStrategyConfig(strategyName: string): StrategyParameters;
  getRiskConfig(): RiskLimits;

  // Environment management
  isDevelopment(): boolean;
  isProduction(): boolean;
  isTesting(): boolean;
}
