import { EventEmitter } from 'events';

import { Decimal } from 'decimal.js';

import { ITradingEngine, IStrategy, IExchange, IRiskManager, IPortfolioManager, ILogger } from '../interfaces';
import { Order, OrderSide, OrderType, Position } from '../types';
export declare class TradingEngine extends EventEmitter implements ITradingEngine {
    private riskManager;
    private portfolioManager;
    private logger;
    private _isRunning;
    private readonly _strategies;
    private readonly _exchanges;
    private _eventBus;
    constructor(riskManager: IRiskManager, portfolioManager: IPortfolioManager, logger: ILogger);
    get isRunning(): boolean;
    get strategies(): Map<string, IStrategy>;
    start(): Promise<void>;
    stop(): Promise<void>;
    addStrategy(name: string, strategy: IStrategy): void;
    removeStrategy(name: string): void;
    getStrategy(name: string): IStrategy | undefined;
    addExchange(name: string, exchange: IExchange): void;
    removeExchange(name: string): void;
    onMarketData(symbol: string, data: any): Promise<void>;
    executeOrder(strategyName: string, symbol: string, side: OrderSide, quantity: Decimal, type: OrderType, price?: Decimal, stopPrice?: Decimal): Promise<Order>;
    getPositions(): Promise<Position[]>;
    getPosition(symbol: string): Promise<Position | undefined>;
    private executeStrategySignal;
    private findExchangeForSymbol;
    private setupEventListeners;
    private setupExchangeListeners;
    private notifyStrategiesOrderFilled;
}
//# sourceMappingURL=TradingEngine.d.ts.map