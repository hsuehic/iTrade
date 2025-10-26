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
  StrategyConfig,
  StrategyRuntimeContext,
  StrategyResult,
  Order,
  Position,
  Balance,
  AccountInfo,
  Kline,
  Ticker,
  OrderBook,
  Trade,
  StrategyHealthStatus,
} from '../types';
import { ConsoleLogger } from './ConsoleLogger';

export abstract class BaseStrategy<
    TParams extends StrategyParameters = StrategyParameters,
  >
  extends EventEmitter
  implements IStrategy<TParams>
{
  protected _parameters: TParams;
  protected _context: StrategyRuntimeContext;
  private _strategyType: string;
  protected _isInitialized = false;
  protected _exchangeName: string;
  protected _symbol: string;
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

  public get strategyType(): string {
    return this._strategyType;
  }

  constructor(config: StrategyConfig<TParams>) {
    super();

    // Extract all fields from config
    const {
      type,
      parameters,
      symbol,
      exchange,
      strategyId,
      strategyName,
      logger,
      subscription,
      initialData,
      loadedInitialData,
    } = config;

    this._strategyType = type;
    this._parameters = parameters;
    this._context = {
      symbol,
      exchange,
      strategyId,
      strategyName,
      logger,
      subscription,
      initialData,
      loadedInitialData,
    };

    this._logger = logger || new ConsoleLogger();
    this._strategyId = strategyId;
    this._strategyName = strategyName;
    this._exchangeName = Array.isArray(exchange) ? exchange[0] : exchange;
    this._symbol = symbol;

    const parts = symbol.split(/[/:]/).filter(Boolean);
    this._quote = parts[0];
    this._base = parts[1];
    this._settlement = parts.length > 2 ? parts[2] : undefined;
  }

  public get config(): StrategyConfig<TParams> {
    return {
      type: this._strategyType,
      parameters: { ...this._parameters },
      ...this._context,
    };
  }

  public get parameters(): TParams {
    return { ...this._parameters };
  }

  public get context(): StrategyRuntimeContext {
    return { ...this._context };
  }

  public async initialize(config: StrategyConfig<TParams>): Promise<void> {
    const {
      type,
      parameters,
      symbol,
      exchange,
      strategyId,
      strategyName,
      logger,
      subscription,
      initialData,
      loadedInitialData,
    } = config;

    if (type) {
      this._strategyType = type;
    }
    this._parameters = parameters;
    this._context = {
      symbol,
      exchange,
      strategyId,
      strategyName,
      logger,
      subscription,
      initialData,
      loadedInitialData,
    };

    await this.onInitialize();
    this._isInitialized = true;
    this.emit('initialized', this.strategyType);
  }

  public abstract analyze(marketData: DataUpdate): Promise<StrategyResult>;

  public async onOrderFilled(order: Order): Promise<void> {
    this.emit('orderFilled', order);
    // Default implementation: update position
    if (order.symbol === this._symbol && order.exchange === this._exchangeName) {
      const filledQuantity = order.executedQuantity || new Decimal(0);
      if (order.side === ('buy' as any)) {
        this._currentPosition = this._currentPosition.plus(filledQuantity);
      } else if (order.side === ('sell' as any)) {
        this._currentPosition = this._currentPosition.minus(filledQuantity);
      }
      this._averagePrice = order.averagePrice;
      this._logger.debug(
        `[${this.strategyType}:${this._strategyId}] Position updated: ${this._currentPosition.toString()} @ ${this._averagePrice?.toString()}`,
      );
    }
  }

  public async onPositionUpdate(position: Position): Promise<void> {
    this.emit('positionUpdate', position);
    if (
      position.symbol === this._symbol &&
      (position as any).exchange === this._exchangeName
    ) {
      this._currentPosition = position.quantity;
      this._averagePrice = position.avgPrice;
      this._logger.debug(
        `[${this.strategyType}:${this._strategyId}] External position update: ${this._currentPosition.toString()} @ ${this._averagePrice?.toString()}`,
      );
    }
  }

  public async onBalanceUpdate(balance: Balance): Promise<void> {
    this.emit('balanceUpdate', balance);
    // Default implementation: log balance changes
    this._logger.debug(
      `[${this.strategyType}:${this._strategyId}] Balance update for ${balance.asset}: Free ${balance.free.toString()}, Locked ${balance.locked.toString()}`,
    );
  }

  public async onAccountUpdate(accountInfo: AccountInfo): Promise<void> {
    this.emit('accountUpdate', accountInfo);
    // Default implementation: log account info changes
    this._logger.debug(
      `[${this.strategyType}:${this._strategyId}] Account update: Can trade: ${accountInfo.canTrade}`,
    );
  }

  public async onKlineUpdate(kline: Kline): Promise<void> {
    this.emit('klineUpdate', kline);
    // Default implementation: no-op
  }

  public async onTickerUpdate(ticker: Ticker): Promise<void> {
    this.emit('tickerUpdate', ticker);
    // Default implementation: no-op
  }

  public async onOrderBookUpdate(orderBook: OrderBook): Promise<void> {
    this.emit('orderBookUpdate', orderBook);
    // Default implementation: no-op
  }

  public async onTradeUpdate(trade: Trade): Promise<void> {
    this.emit('tradeUpdate', trade);
    // Default implementation: no-op
  }

  protected async onInitialize(): Promise<void> {
    // Override in derived classes for custom initialization
  }

  protected async onCleanup(): Promise<void> {
    // Override in derived classes for custom cleanup
  }

  // Utility methods for derived strategies
  protected getParameter<K extends keyof TParams>(key: K): TParams[K] {
    return this._parameters[key];
  }

  protected setParameter<K extends keyof TParams>(key: K, value: TParams[K]): void {
    this._parameters[key] = value;
  }

  protected validateParameters(requiredParams: (keyof TParams)[]): void {
    const missing = requiredParams.filter((param) => !(param in this._parameters));
    if (missing.length > 0) {
      throw new Error(
        `Missing required parameters for strategy ${this.strategyType}: ${missing.map(String).join(', ')}`,
      );
    }
  }

  protected async ensureInitialized(): Promise<void> {
    if (!this._isInitialized) {
      await this.initialize(this.config);
    }
  }

  // 🆕 State Management Methods Implementation

  /**
   * Save current strategy state - override in derived classes for custom state
   */
  public async saveState(): Promise<StrategyStateSnapshot> {
    const state: StrategyStateSnapshot = {
      strategyId: this._strategyId,
      strategyType: this.strategyType,
      stateVersion: this._stateVersion,
      timestamp: new Date(),
      internalState: {},
      indicatorData: {},
      lastSignal: this._lastSignal,
      signalTime: this._lastSignalTime,
      currentPosition: this._currentPosition.toString(),
      averagePrice: this._averagePrice?.toString(),
    };
    // Derived classes should populate internalState and indicatorData
    return state;
  }

  /**
   * Load strategy state for recovery - override in derived classes for custom state
   */
  public async loadState(
    snapshot: StrategyStateSnapshot,
  ): Promise<StrategyRecoveryContext> {
    this._strategyId = snapshot.strategyId;
    this._lastSignal = snapshot.lastSignal;
    this._lastSignalTime = snapshot.signalTime;
    this._currentPosition = new Decimal(snapshot.currentPosition || 0);
    this._averagePrice = snapshot.averagePrice
      ? new Decimal(snapshot.averagePrice)
      : undefined;
    this._stateVersion = snapshot.stateVersion || '1.0.0';

    // Derived classes should use snapshot.internalState and snapshot.indicatorData
    return {
      recovered: true,
      message: `State loaded for ${this.strategyType}:${this._strategyId} (version ${this._stateVersion})`,
      metrics: {
        recoveryTime: new Date(),
        lastSignal: this._lastSignal,
        currentPosition: this._currentPosition,
      },
    };
  }

  /**
   * Get current health status of the strategy
   */
  public getHealthStatus() {
    return {
      status: this._isInitialized ? ('healthy' as const) : ('initializing' as const),
      message: this._isInitialized ? 'Strategy is running' : 'Strategy is initializing',
      timestamp: new Date(),
      lastSignal: this._lastSignal,
      currentPosition: this._currentPosition,
    };
  }

  public getStrategyId(): number | undefined {
    return this._strategyId;
  }

  public getStrategyName(): string | undefined {
    return this._strategyName;
  }

  public getSymbol(): string {
    return this._symbol;
  }

  public getExchangeName(): string {
    return this._exchangeName;
  }

  public getQuoteAsset(): string {
    return this._quote;
  }

  public getBaseAsset(): string {
    return this._base;
  }

  public getSettlementAsset(): string | undefined {
    return this._settlement;
  }

  public isInitialized(): boolean {
    return this._isInitialized;
  }

  public getLogger(): ILogger {
    return this._logger;
  }

  protected getLastSignal(): string | undefined {
    return this._lastSignal;
  }

  protected setLastSignal(signal: string): void {
    this._lastSignal = signal;
    this._lastSignalTime = new Date();
  }

  protected getCurrentPosition(): Decimal {
    return this._currentPosition;
  }

  protected getAveragePrice(): Decimal | undefined {
    return this._averagePrice;
  }
}
