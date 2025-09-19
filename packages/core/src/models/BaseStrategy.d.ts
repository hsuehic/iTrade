import { EventEmitter } from 'events';
import { IStrategy } from '../interfaces';
import { StrategyParameters, StrategyResult, Order, Position, Ticker, OrderBook, Trade, Kline } from '../types';
export declare abstract class BaseStrategy extends EventEmitter implements IStrategy {
    readonly name: string;
    protected _parameters: StrategyParameters;
    protected _isInitialized: boolean;
    constructor(name: string, parameters?: StrategyParameters);
    get parameters(): StrategyParameters;
    initialize(parameters: StrategyParameters): Promise<void>;
    abstract analyze(marketData: {
        ticker?: Ticker;
        orderbook?: OrderBook;
        trades?: Trade[];
        klines?: Kline[];
    }): Promise<StrategyResult>;
    onOrderFilled(order: Order): Promise<void>;
    onPositionChanged(position: Position): Promise<void>;
    cleanup(): Promise<void>;
    protected onInitialize(): Promise<void>;
    protected onCleanup(): Promise<void>;
    protected getParameter<T>(key: string, defaultValue?: T): T;
    protected setParameter(key: string, value: any): void;
    protected validateParameters(requiredParams: string[]): void;
    protected ensureInitialized(): void;
}
//# sourceMappingURL=BaseStrategy.d.ts.map