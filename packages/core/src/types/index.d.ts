import { Decimal } from 'decimal.js';
export * from './subscription';
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
    exchange?: string;
}
export interface OrderBook {
    symbol: string;
    timestamp: Date;
    bids: Array<[Decimal, Decimal]>;
    asks: Array<[Decimal, Decimal]>;
    exchange?: string;
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
    exchange?: string;
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
    exchange?: string;
}
export declare enum OrderType {
    MARKET = "MARKET",
    LIMIT = "LIMIT",
    STOP_LOSS = "STOP_LOSS",
    STOP_LOSS_LIMIT = "STOP_LOSS_LIMIT",
    TAKE_PROFIT = "TAKE_PROFIT",
    TAKE_PROFIT_LIMIT = "TAKE_PROFIT_LIMIT"
}
export declare enum OrderSide {
    BUY = "BUY",
    SELL = "SELL"
}
export declare enum OrderStatus {
    NEW = "NEW",
    PARTIALLY_FILLED = "PARTIALLY_FILLED",
    FILLED = "FILLED",
    CANCELED = "CANCELED",
    REJECTED = "REJECTED",
    EXPIRED = "EXPIRED"
}
export declare enum TimeInForce {
    GTC = "GTC",// Good Till Cancel
    IOC = "IOC",// Immediate or Cancel
    FOK = "FOK"
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
export interface AccountInfo {
    balances: Balance[];
    canTrade: boolean;
    canWithdraw: boolean;
    canDeposit: boolean;
    updateTime: Date;
}
export interface StrategyParameters {
    symbol?: string;
    exchange?: string;
    subscription?: import('./subscription').SubscriptionConfig;
    [key: string]: any;
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
    equity: Array<{
        timestamp: Date;
        value: Decimal;
    }>;
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
    ttl?: number;
    maxSize?: number;
    checkPeriod?: number;
}
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
export declare enum LogLevel {
    DEBUG = "debug",
    INFO = "info",
    WARN = "warn",
    ERROR = "error"
}
export interface LogEntry {
    level: LogLevel;
    message: string;
    timestamp: Date;
    metadata?: Record<string, unknown>;
}
export interface RiskAlert {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    timestamp?: Date;
    data?: Record<string, unknown>;
}
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
//# sourceMappingURL=index.d.ts.map