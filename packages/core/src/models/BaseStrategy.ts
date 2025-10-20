import { EventEmitter } from 'events';

import { Decimal } from 'decimal.js';

import { IStrategy, StrategyStateSnapshot, StrategyRecoveryContext } from '../interfaces';
import {
  StrategyParameters,
  StrategyResult,
  Order,
  Position,
  Ticker,
  OrderBook,
  Trade,
  Kline,
} from '../types';

export abstract class BaseStrategy extends EventEmitter implements IStrategy {
  protected _parameters: StrategyParameters = {};
  protected _isInitialized = false;

  // 🆕 State Management Properties
  protected _strategyId?: number;
  protected _currentPosition = new Decimal(0);
  protected _averagePrice?: Decimal;
  protected _lastSignal?: string;
  protected _lastSignalTime?: Date;
  protected _stateVersion = '1.0.0'; // Override in subclasses if needed

  constructor(
    public readonly name: string,
    parameters: StrategyParameters = {},
  ) {
    super();
    this._parameters = { ...parameters };
  }

  public get parameters(): StrategyParameters {
    return { ...this._parameters };
  }

  public async initialize(parameters: StrategyParameters): Promise<void> {
    this._parameters = { ...parameters };
    await this.onInitialize();
    this._isInitialized = true;
    this.emit('initialized', this.name);
  }

  public abstract analyze(marketData: {
    ticker?: Ticker;
    orderbook?: OrderBook;
    trades?: Trade[];
    klines?: Kline[];
  }): Promise<StrategyResult>;

  public async onOrderFilled(order: Order): Promise<void> {
    this.emit('orderFilled', order);
    // Override in derived classes for custom order handling
  }

  public async onPositionChanged(position: Position): Promise<void> {
    this.emit('positionChanged', position);
    // Override in derived classes for custom position handling
  }

  public async cleanup(): Promise<void> {
    this._isInitialized = false;
    await this.onCleanup();
    this.emit('cleanup', this.name);
  }

  // Protected methods for derived classes to override
  protected async onInitialize(): Promise<void> {
    // Override in derived classes for custom initialization
  }

  protected async onCleanup(): Promise<void> {
    // Override in derived classes for custom cleanup
  }

  // Utility methods for derived strategies
  protected getParameter<T>(key: string, defaultValue?: T): T {
    const value = this._parameters[key];
    return value !== undefined ? (value as T) : (defaultValue as T);
  }

  protected setParameter(key: string, value: unknown): void {
    this._parameters[key] = value;
  }

  protected validateParameters(requiredParams: string[]): void {
    const missing = requiredParams.filter((param) => !(param in this._parameters));
    if (missing.length > 0) {
      throw new Error(
        `Missing required parameters for strategy ${this.name}: ${missing.join(', ')}`,
      );
    }
  }

  protected ensureInitialized(): void {
    if (!this._isInitialized) {
      throw new Error(`Strategy ${this.name} is not initialized`);
    }
  }

  // 🆕 State Management Methods Implementation

  /**
   * Save current strategy state - override in derived classes for custom state
   */
  public async saveState(): Promise<StrategyStateSnapshot> {
    return {
      strategyId: this._strategyId,
      internalState: await this.getInternalState(),
      indicatorData: await this.getIndicatorData(),
      lastSignal: this._lastSignal,
      signalTime: this._lastSignalTime,
      currentPosition: this._currentPosition.toString(),
      averagePrice: this._averagePrice?.toString(),
    };
  }

  /**
   * Restore strategy state from snapshot
   */
  public async restoreState(snapshot: StrategyStateSnapshot): Promise<void> {
    this._strategyId = snapshot.strategyId;
    this._lastSignal = snapshot.lastSignal;
    this._lastSignalTime = snapshot.signalTime;

    if (snapshot.currentPosition) {
      this._currentPosition = new Decimal(snapshot.currentPosition);
    }

    if (snapshot.averagePrice) {
      this._averagePrice = new Decimal(snapshot.averagePrice);
    }

    // Restore custom state and indicators
    await this.setInternalState(snapshot.internalState);
    await this.setIndicatorData(snapshot.indicatorData);

    this.emit('stateRestored', { strategyId: this._strategyId, snapshot });
  }

  /**
   * Set recovery context for strategy restart
   */
  public async setRecoveryContext(context: StrategyRecoveryContext): Promise<void> {
    this._strategyId = context.strategyId;

    if (context.savedState) {
      await this.restoreState(context.savedState);
    }

    // Handle open orders and position recovery
    if (context.totalPosition) {
      this._currentPosition = new Decimal(context.totalPosition);
    }

    await this.onRecoveryContextSet(context);
    this.emit('recoveryContextSet', context);
  }

  /**
   * Get state schema version for compatibility checking
   */
  public getStateVersion(): string {
    return this._stateVersion;
  }

  // 🔧 Protected methods for derived classes to override

  /**
   * Override to provide custom internal state data
   */
  protected async getInternalState(): Promise<Record<string, unknown>> {
    return {
      isInitialized: this._isInitialized,
      lastAnalysisTime: new Date(),
      // Add more internal state as needed
    };
  }

  /**
   * Override to restore custom internal state
   */
  protected async setInternalState(_state: Record<string, unknown>): Promise<void> {
    // Derived classes should implement custom state restoration
    // Base implementation is intentionally minimal
  }

  /**
   * Override to provide technical indicator data for state persistence
   */
  protected async getIndicatorData(): Promise<Record<string, unknown>> {
    return {
      // Override in derived classes to save indicator state
      // e.g., moving averages, RSI values, price history, etc.
    };
  }

  /**
   * Override to restore technical indicator data
   */
  protected async setIndicatorData(_data: Record<string, unknown>): Promise<void> {
    // Override in derived classes to restore indicator state
  }

  /**
   * Override to handle recovery context setup
   */
  protected async onRecoveryContextSet(_context: StrategyRecoveryContext): Promise<void> {
    // Override in derived classes for custom recovery logic
  }

  // 🔧 Position and Signal Management Helpers

  /**
   * Update current position
   */
  protected updatePosition(position: Decimal, averagePrice?: Decimal): void {
    this._currentPosition = position;
    if (averagePrice) {
      this._averagePrice = averagePrice;
    }
    this.emit('positionUpdated', {
      position: position.toString(),
      averagePrice: averagePrice?.toString(),
    });
  }

  /**
   * Record trading signal
   */
  protected recordSignal(signal: string): void {
    this._lastSignal = signal;
    this._lastSignalTime = new Date();
    this.emit('signalRecorded', { signal, time: this._lastSignalTime });
  }

  /**
   * Get current position
   */
  protected getCurrentPosition(): Decimal {
    return this._currentPosition;
  }

  /**
   * Get average price
   */
  protected getAveragePrice(): Decimal | undefined {
    return this._averagePrice;
  }

  /**
   * Get last signal
   */
  protected getLastSignal(): { signal?: string; time?: Date } {
    return {
      signal: this._lastSignal,
      time: this._lastSignalTime,
    };
  }

  /**
   * Set strategy ID (usually called by StrategyManager)
   */
  public setStrategyId(id: number): void {
    this._strategyId = id;
  }

  /**
   * Get strategy ID
   */
  public getStrategyId(): number | undefined {
    return this._strategyId;
  }
}
