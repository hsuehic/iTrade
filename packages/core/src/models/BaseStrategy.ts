import { EventEmitter } from 'events';

import { IStrategy } from '../interfaces';
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

  constructor(
    public readonly name: string,
    parameters: StrategyParameters = {}
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

  protected setParameter(key: string, value: any): void {
    this._parameters[key] = value;
  }

  protected validateParameters(requiredParams: string[]): void {
    const missing = requiredParams.filter(
      (param) => !(param in this._parameters)
    );
    if (missing.length > 0) {
      throw new Error(
        `Missing required parameters for strategy ${this.name}: ${missing.join(', ')}`
      );
    }
  }

  protected ensureInitialized(): void {
    if (!this._isInitialized) {
      throw new Error(`Strategy ${this.name} is not initialized`);
    }
  }
}
