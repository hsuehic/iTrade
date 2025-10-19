import { EventEmitter } from 'events';
import { ITradingEngine, IStrategy, IExchange, IRiskManager, IPortfolioManager, ILogger, ExecuteOrderParameters } from '../interfaces';
import { Order, Position, Ticker, OrderBook, Trade, Kline, DataType } from '../types';
export declare class TradingEngine extends EventEmitter implements ITradingEngine {
    private riskManager;
    private portfolioManager;
    private logger;
    private _isRunning;
    private readonly _strategies;
    private readonly _exchanges;
    private _eventBus;
    private subscriptionManager;
    constructor(riskManager: IRiskManager, portfolioManager: IPortfolioManager, logger: ILogger);
    get isRunning(): boolean;
    get strategies(): Map<string, IStrategy>;
    start(): Promise<void>;
    stop(): Promise<void>;
    addStrategy(name: string, strategy: IStrategy): Promise<void>;
    removeStrategy(name: string): Promise<void>;
    getStrategy(name: string): IStrategy | undefined;
    addExchange(name: string, exchange: IExchange): void;
    removeExchange(name: string): void;
    /**
     * Process ticker data (recommended)
     */
    onTicker(symbol: string, ticker: Ticker, exchangeName?: string): Promise<void>;
    /**
     * Process order book data (recommended)
     */
    onOrderBook(symbol: string, orderbook: OrderBook, exchangeName?: string): Promise<void>;
    /**
     * Process trades data (recommended)
     */
    onTrades(symbol: string, trades: Trade[], exchangeName?: string): Promise<void>;
    /**
     * Process kline data (recommended)
     */
    onKline(symbol: string, kline: Kline, exchangeName?: string): Promise<void>;
    /**
     * @deprecated Use specific methods like onTicker, onOrderBook, onTrades, onKline instead.
     * This method is kept for backward compatibility.
     */
    onMarketData(symbol: string, data: any, exchangeName?: string): Promise<void>;
    /**
     * Type guard for Ticker
     */
    private isTicker;
    /**
     * Type guard for OrderBook
     */
    private isOrderBook;
    /**
     * Type guard for Kline
     */
    private isKline;
    /**
     * Type guard for Trade
     */
    private isTrade;
    executeOrder(params: ExecuteOrderParameters): Promise<Order>;
    getPositions(): Promise<Position[]>;
    getPosition(symbol: string): Promise<Position | undefined>;
    private executeStrategySignal;
    private findExchangeForSymbol;
    private setupEventListeners;
    private setupExchangeListeners;
    private notifyStrategiesOrderFilled;
    /**
     * Auto-subscribe to strategy data
     */
    private subscribeStrategyData;
    /**
     * Auto-unsubscribe strategy data
     */
    private unsubscribeStrategyData;
    /**
     * Subscribe to specific data type
     */
    private subscribeData;
    /**
     * Unsubscribe from specific data type
     */
    private unsubscribeData;
    /**
     * Subscribe via WebSocket
     */
    private subscribeViaWebSocket;
    /**
     * Subscribe via REST polling
     */
    private subscribeViaREST;
    /**
     * Determine subscription method
     */
    private determineSubscriptionMethod;
    /**
     * Get target exchanges based on config
     */
    private getTargetExchanges;
    /**
     * Normalize data config
     */
    private normalizeDataConfig;
    /**
     * Get polling interval for REST
     */
    private getPollingInterval;
    /**
     * Get subscription statistics
     */
    getSubscriptionStats(): {
        total: number;
        byType: Record<DataType, number>;
        byMethod: Record<"websocket" | "rest", number>;
        byExchange: Record<string, number>;
    };
}
//# sourceMappingURL=TradingEngine.d.ts.map