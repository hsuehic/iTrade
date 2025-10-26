import { EventEmitter } from 'events';

import { Decimal } from 'decimal.js';

import {
  DataUpdate,
  IStrategy,
  StrategyStateSnapshot,
  StrategyRecoveryContext,
  ILogger,
} from '../interfaces';
import {
  StrategyParameters,
  StrategyResult,
  Order,
  Position,
  Balance,
  Ticker,
  OrderBook,
  Trade,
  Kline,
} from '../types';
import { ConsoleLogger } from './ConsoleLogger';

export abstract class BaseStrategy extends EventEmitter implements IStrategy {
  protected _parameters: StrategyParameters;
  protected _isInitialized = false;
  protected _exchangeName?: string;
  protected _symbol?: string;
  protected _quote: string;
  protected _base: string;
  protected _settlement?: string;

  // 🆕 State Management Properties
  protected _strategyId?: number;
  protected _strategyName?: string; // User-defined name from database
  protected _currentPosition = new Decimal(0);
  protected _averagePrice?: Decimal;
  protected _lastSignal?: string;
  protected _lastSignalTime?: Date;
  protected _stateVersion = '1.0.0'; // Override in subclasses if needed
  protected _logger: ILogger;

  constructor(
    public readonly strategyType: string, // Strategy class name (e.g., "MovingAverageStrategy")
    parameters: StrategyParameters,
  ) {
    super();
    this._parameters = { ...parameters };
    const { strategyId, strategyName, exchange, symbol, logger } = parameters;
    this._logger = logger ? logger : new ConsoleLogger();
    this._strategyId = strategyId; // Initialize strategyId from parameters
    this._strategyName = strategyName; // Initialize user-defined name from parameters
    this._exchangeName = Array.isArray(exchange) ? exchange[0] : exchange;
    this._symbol = symbol;
    const parts = symbol.split(/[/:]/).filter(Boolean);
    this._quote = parts[0];
    this._base = parts[1];
    this._settlement = parts.length > 2 ? parts[2] : undefined;
  }

  public get parameters(): StrategyParameters {
    return { ...this._parameters };
  }

  public async initialize(parameters: StrategyParameters): Promise<void> {
    this._parameters = { ...parameters };
    await this.onInitialize();
    this._isInitialized = true;
    this.emit('initialized', this.strategyType);
  }

  public abstract analyze(marketData: DataUpdate): Promise<StrategyResult>;

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
    this.emit('cleanup', this.strategyType);
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
        `Missing required parameters for strategy ${this.strategyType}: ${missing.join(', ')}`,
      );
    }
  }

  protected async ensureInitialized(): Promise<void> {
    if (!this._isInitialized) {
      await this.initialize(this._parameters);
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

  // Strategy Name (user-defined)
  public get strategyName(): string | undefined {
    return this._strategyName;
  }

  public setStrategyName(name: string): void {
    this._strategyName = name;
  }

  public setStrategyId(id: number): void {
    this._strategyId = id;
  }

  public getStrategyId(): number | undefined {
    return this._strategyId;
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
}
