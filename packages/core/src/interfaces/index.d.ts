import { EventEmitter } from 'events';

import { Decimal } from 'decimal.js';

import { Order, OrderSide, OrderType, TimeInForce, Ticker, OrderBook, Trade, Kline, AccountInfo, Balance, Position, ExchangeCredentials, ExchangeInfo, StrategyParameters, StrategyResult, BacktestConfig, BacktestResult, RiskLimits, RiskMetrics } from '../types';
export interface IExchange extends EventEmitter {
    readonly name: string;
    readonly isConnected: boolean;
    connect(credentials: ExchangeCredentials): Promise<void>;
    disconnect(): Promise<void>;
    getTicker(symbol: string): Promise<Ticker>;
    getOrderBook(symbol: string, limit?: number): Promise<OrderBook>;
    getTrades(symbol: string, limit?: number): Promise<Trade[]>;
    getKlines(symbol: string, interval: string, startTime?: Date, endTime?: Date, limit?: number): Promise<Kline[]>;
    subscribeToTicker(symbol: string): Promise<void>;
    subscribeToOrderBook(symbol: string): Promise<void>;
    subscribeToTrades(symbol: string): Promise<void>;
    subscribeToKlines(symbol: string, interval: string): Promise<void>;
    unsubscribe(symbol: string, type: 'ticker' | 'orderbook' | 'trades' | 'klines'): Promise<void>;
    createOrder(symbol: string, side: OrderSide, type: OrderType, quantity: Decimal, price?: Decimal, stopPrice?: Decimal, timeInForce?: TimeInForce, clientOrderId?: string): Promise<Order>;
    cancelOrder(symbol: string, orderId: string, clientOrderId?: string): Promise<Order>;
    getOrder(symbol: string, orderId: string, clientOrderId?: string): Promise<Order>;
    getOpenOrders(symbol?: string): Promise<Order[]>;
    getOrderHistory(symbol?: string, limit?: number): Promise<Order[]>;
    getAccountInfo(): Promise<AccountInfo>;
    getBalances(): Promise<Balance[]>;
    getPositions(): Promise<Position[]>;
    getExchangeInfo(): Promise<ExchangeInfo>;
    getSymbols(): Promise<string[]>;
}
export interface IStrategy {
    readonly name: string;
    readonly parameters: StrategyParameters;
    initialize(parameters: StrategyParameters): Promise<void>;
    analyze(marketData: {
        ticker?: Ticker;
        orderbook?: OrderBook;
        trades?: Trade[];
        klines?: Kline[];
    }): Promise<StrategyResult>;
    onOrderFilled(order: Order): Promise<void>;
    onPositionChanged(position: Position): Promise<void>;
    cleanup(): Promise<void>;
}
export interface ITradingEngine extends EventEmitter {
    readonly isRunning: boolean;
    readonly strategies: Map<string, IStrategy>;
    start(): Promise<void>;
    stop(): Promise<void>;
    addStrategy(name: string, strategy: IStrategy): void;
    removeStrategy(name: string): void;
    getStrategy(name: string): IStrategy | undefined;
    onMarketData(symbol: string, data: Ticker | OrderBook | Trade | Kline): Promise<void>;
    executeOrder(strategyName: string, symbol: string, side: OrderSide, quantity: Decimal, type: OrderType, price?: Decimal, stopPrice?: Decimal): Promise<Order>;
    getPositions(): Promise<Position[]>;
    getPosition(symbol: string): Promise<Position | undefined>;
}
export interface IDataManager {
    saveKlines(symbol: string, interval: string, klines: Kline[]): Promise<void>;
    getKlines(symbol: string, interval: string, startTime: Date, endTime: Date): Promise<Kline[]>;
    saveTrades(symbol: string, trades: Trade[]): Promise<void>;
    getTrades(symbol: string, startTime: Date, endTime: Date, limit?: number): Promise<Trade[]>;
    cacheTicker(symbol: string, ticker: Ticker): Promise<void>;
    getCachedTicker(symbol: string): Promise<Ticker | undefined>;
    cacheOrderBook(symbol: string, orderbook: OrderBook): Promise<void>;
    getCachedOrderBook(symbol: string): Promise<OrderBook | undefined>;
    validateData(data: Kline[] | Trade[]): boolean;
    cleanData(data: Kline[] | Trade[]): Kline[] | Trade[];
}
export interface IBacktestEngine {
    runBacktest(strategy: IStrategy, config: BacktestConfig, dataManager: IDataManager): Promise<BacktestResult>;
    calculateMetrics(trades: Trade[], initialBalance: Decimal): BacktestResult;
    generateReport(result: BacktestResult): string;
    simulateMarketData(symbol: string, startTime: Date, endTime: Date, timeframe: string): AsyncGenerator<Kline>;
}
export interface IRiskManager {
    readonly limits: RiskLimits;
    checkOrderRisk(order: Order, currentPositions: Position[], balances: Balance[]): Promise<boolean>;
    checkPositionRisk(position: Position, limits: RiskLimits): Promise<boolean>;
    calculateRiskMetrics(positions: Position[], balances: Balance[]): Promise<RiskMetrics>;
    updateLimits(limits: Partial<RiskLimits>): void;
    getLimits(): RiskLimits;
    liquidateAllPositions(): Promise<void>;
    stopAllTrading(): Promise<void>;
}
export interface IPortfolioManager {
    getPortfolioValue(): Promise<Decimal>;
    getPositions(): Promise<Position[]>;
    getBalances(): Promise<Balance[]>;
    updatePosition(symbol: string, side: 'long' | 'short', size: Decimal, price: Decimal): Promise<void>;
    closePosition(symbol: string): Promise<void>;
    getUnrealizedPnl(): Promise<Decimal>;
    getRealizedPnl(period?: {
        start: Date;
        end: Date;
    }): Promise<Decimal>;
    calculateSharpeRatio(period: {
        start: Date;
        end: Date;
    }): Promise<Decimal>;
    calculateMaxDrawdown(period: {
        start: Date;
        end: Date;
    }): Promise<Decimal>;
    getPerformanceMetrics(period: {
        start: Date;
        end: Date;
    }): Promise<{
        totalReturn: Decimal;
        annualizedReturn: Decimal;
        volatility: Decimal;
        sharpeRatio: Decimal;
        maxDrawdown: Decimal;
    }>;
}
export interface ILogger {
    debug(message: string, metadata?: Record<string, unknown>): void;
    info(message: string, metadata?: Record<string, unknown>): void;
    warn(message: string, metadata?: Record<string, unknown>): void;
    error(message: string, error?: Error, metadata?: Record<string, unknown>): void;
    logTrade(order: Order): void;
    logStrategy(strategyName: string, action: string, metadata?: Record<string, unknown>): void;
    logRisk(event: string, metadata?: Record<string, unknown>): void;
}
export interface IConfig {
    get<T = unknown>(key: string, defaultValue?: T): T;
    set(key: string, value: unknown): void;
    has(key: string): boolean;
    getExchangeConfig(exchangeName: string): ExchangeCredentials;
    getStrategyConfig(strategyName: string): StrategyParameters;
    getRiskConfig(): RiskLimits;
    isDevelopment(): boolean;
    isProduction(): boolean;
    isTesting(): boolean;
}
//# sourceMappingURL=index.d.ts.map