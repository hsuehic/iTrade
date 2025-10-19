import { EventEmitter } from 'events';
import { Decimal } from 'decimal.js';
import { IStrategy, StrategyStateSnapshot, StrategyRecoveryContext } from '../interfaces';
import { StrategyParameters, StrategyResult, Order, Position, Ticker, OrderBook, Trade, Kline } from '../types';
export declare abstract class BaseStrategy extends EventEmitter implements IStrategy {
    readonly name: string;
    protected _parameters: StrategyParameters;
    protected _isInitialized: boolean;
    protected _strategyId?: number;
    protected _currentPosition: Decimal;
    protected _averagePrice?: Decimal;
    protected _lastSignal?: string;
    protected _lastSignalTime?: Date;
    protected _stateVersion: string;
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
    /**
     * Save current strategy state - override in derived classes for custom state
     */
    saveState(): Promise<StrategyStateSnapshot>;
    /**
     * Restore strategy state from snapshot
     */
    restoreState(snapshot: StrategyStateSnapshot): Promise<void>;
    /**
     * Set recovery context for strategy restart
     */
    setRecoveryContext(context: StrategyRecoveryContext): Promise<void>;
    /**
     * Get state schema version for compatibility checking
     */
    getStateVersion(): string;
    /**
     * Override to provide custom internal state data
     */
    protected getInternalState(): Promise<Record<string, unknown>>;
    /**
     * Override to restore custom internal state
     */
    protected setInternalState(_state: Record<string, unknown>): Promise<void>;
    /**
     * Override to provide technical indicator data for state persistence
     */
    protected getIndicatorData(): Promise<Record<string, unknown>>;
    /**
     * Override to restore technical indicator data
     */
    protected setIndicatorData(_data: Record<string, unknown>): Promise<void>;
    /**
     * Override to handle recovery context setup
     */
    protected onRecoveryContextSet(_context: StrategyRecoveryContext): Promise<void>;
    /**
     * Update current position
     */
    protected updatePosition(position: Decimal, averagePrice?: Decimal): void;
    /**
     * Record trading signal
     */
    protected recordSignal(signal: string): void;
    /**
     * Get current position
     */
    protected getCurrentPosition(): Decimal;
    /**
     * Get average price
     */
    protected getAveragePrice(): Decimal | undefined;
    /**
     * Get last signal
     */
    protected getLastSignal(): {
        signal?: string;
        time?: Date;
    };
    /**
     * Set strategy ID (usually called by StrategyManager)
     */
    setStrategyId(id: number): void;
    /**
     * Get strategy ID
     */
    getStrategyId(): number | undefined;
}
//# sourceMappingURL=BaseStrategy.d.ts.map