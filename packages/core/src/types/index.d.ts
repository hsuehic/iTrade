import { Decimal } from 'decimal.js';
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
}
export interface OrderBook {
    symbol: string;
    timestamp: Date;
    bids: Array<[Decimal, Decimal]>;
    asks: Array<[Decimal, Decimal]>;
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
    size: Decimal;
    entryPrice: Decimal;
    markPrice: Decimal;
    unrealizedPnl: Decimal;
    percentage: Decimal;
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
    [key: string]: string | number | boolean | Decimal;
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
//# sourceMappingURL=index.d.ts.map