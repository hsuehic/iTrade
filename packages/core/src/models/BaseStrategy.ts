import { EventEmitter } from 'events';

import { Decimal } from 'decimal.js';

import { DataUpdate, IStrategy, ILogger } from '../interfaces';
import {
  StrategyParameters,
  StrategyConfig,
  StrategyRuntimeContext,
  StrategyAnalyzeResult,
  Order,
  Position,
  Balance,
  AccountInfo,
  Kline,
  Ticker,
  OrderBook,
  Trade,
  SignalType,
  InitialDataResult,
  InitialDataConfig,
  SubscriptionConfig,
  StrategyPerformance,
  createEmptyPerformance,
} from '../types';
import { ConsoleLogger } from './ConsoleLogger';
import { PerformanceTracker } from '../utils/PerformanceTracker';

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

  // 🆕 订单序列号（用于生成唯一 clientOrderId）
  protected orderSequence: number = 0;

  /** Captured async init promise so the engine can await it (see initialize()). */
  private _initializePromise: Promise<void> | null = null;

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
      initialDataConfig,
      loadedInitialData,
      performance,
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
      initialDataConfig,
      loadedInitialData,
      performance:
        performance ||
        createEmptyPerformance(
          symbol,
          Array.isArray(exchange) ? exchange[0] : exchange,
          strategyId,
          strategyName,
        ),
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

    // indicate that strategy is initialized, is ready to use. you need to override this method in your strategy, and set this._initialized to true, and emit 'initialized' event.
    // The constructor can't await, so we capture the promise for initialize() to await later.
    this._initializePromise = this.onInitialize().catch((error) => {
      this._logger.error(`[${this.strategyType}] onInitialize failed`, error as Error);
    });
  }

  /**
   * 🆕 Await the strategy's asynchronous initialization.
   *
   * The base constructor fires `onInitialize()` (fire-and-forget, since a
   * constructor cannot await). This method lets the engine deterministically
   * wait for that initialization to complete before processing initial data or
   * subscriptions. It is idempotent and safe to call any number of times.
   */
  public async initialize(): Promise<void> {
    if (this._initializePromise) {
      await this._initializePromise;
    }
  }

  public get config(): StrategyConfig<TParams> {
    return {
      type: this._strategyType,
      parameters: this.cloneParameters(),
      ...this.context,
    };
  }

  public get parameters(): TParams {
    return this.cloneParameters();
  }

  public get context(): StrategyRuntimeContext {
    // Defensive shallow-copy of primitive properties; the `performance` and
    // nested configs share references (deep-cloning Decimal trees here would
    // be expensive and is not required — callers must treat the returned
    // `performance` as immutable). This at least prevents callers from
    // reassigning the top-level fields we own.
    return {
      ...this._context,
      performance: { ...this._context.performance },
      initialDataConfig: { ...this._context.initialDataConfig },
      subscription: { ...this._context.subscription },
    };
  }

  /**
   * Defensive copy of parameters so external callers cannot mutate the
   * strategy's live `_parameters` by writing into the returned object.
   */
  private cloneParameters(): TParams {
    return { ...this._parameters };
  }

  /**
   * 🆕 生成唯一的 clientOrderId
   * OKX要求: 字母数字字符, 最大长度32字符
   *
   * Format: `{prefix}{strategyId}D{sequence}D{ms}` where prefix is E/S/T.
   * Collision resistance notes (fixed vs the previous second-based design):
   *  - Uses millisecond timestamps (`Date.now()`), not whole seconds, so two
   *    orders generated in the same second no longer collide.
   *  - `orderSequence` is per-instance; on restart it resets to 0, so a fresh
   *    instance with the same strategyId and same first-generation ms could
   *    still collide. To eliminate that we also guard with the exchange-side
   *    dedup only when absolutely needed — strategies that need durable
   *    uniqueness across restarts should persist and restore `orderSequence`
   *    in `processInitialData` via the exported `restoreOrderSequence()`.
   */
  protected generateClientOrderId(type: SignalType): string {
    this.orderSequence++;
    // 使用毫秒时间戳（不是秒），避免同一秒内重复
    const ms = Date.now();
    const strategyId = this.getStrategyId() ?? 0;
    // 主订单格式: E{strategyId}D{sequence}D{ms} , 止盈订单: T{strategyId}D{sequence}D{ms}
    const typePrefix =
      type === SignalType.Entry ? 'E' : type === SignalType.StopLoss ? 'S' : 'T';
    // Truncate strategyId to keep the whole string <= 32 chars while staying
    // parseable by the engine's /^[ETS](\d+)D/ enrichment regex.
    const idPart = String(strategyId).slice(0, 13);
    const seqPart = String(this.orderSequence).slice(0, 8);
    return `${typePrefix}${idPart}D${seqPart}D${ms}`.slice(0, 32);
  }

  /**
   * 🆕 Restore the per-instance order sequence from persisted state so that
   * auto-generated `clientOrderId`s don't collide after a restart. Strategies
   * that keep their own monotonically-increasing counter should call this in
   * `processInitialData` with the last known sequence value.
   */
  protected restoreOrderSequence(lastSequence: number): void {
    this.orderSequence = Math.max(this.orderSequence, lastSequence);
  }

  /**
   * Analyze market/account data and return trading signals
   *
   * Subclasses must implement this method to define their trading logic.
   * Can return a single result or an array of results for multiple
   * simultaneous actions (e.g., place TP order + place next entry order).
   *
   * @param marketData - Market data (ticker, orderbook, klines) or account data (orders, positions)
   * @returns Single result or array of results
   */
  public abstract analyze(marketData: DataUpdate): Promise<StrategyAnalyzeResult>;

  /**
   * Called when an order is created from this strategy's signal
   * Override this method to track orders generated by the strategy
   */
  public async onOrderCreated(order: Order): Promise<void> {
    this.emit('orderCreated', order);
    this._logger.debug(
      `[${this.strategyType}:${this._strategyId}] Order created: ${order.clientOrderId} (${order.side} ${order.quantity.toString()} @ ${order.price?.toString() || 'MARKET'})`,
    );
  }

  public async onOrderFilled(order: Order): Promise<void> {
    this.emit('orderFilled', order);

    // Only update performance counters (counts/status)
    // Volume/Fees/Position updates are handled in onTradeExecuted via partial fills
    if (
      order.strategyId !== undefined &&
      this._strategyId !== undefined &&
      order.strategyId !== this._strategyId
    ) {
      return;
    }

    if (order.symbol === this._symbol && order.exchange === this._exchangeName) {
      this._context.performance = PerformanceTracker.updateWithOrder(
        this._context.performance,
        order,
      );
    }
  }

  /**
   * 🆕 Called when a trade execution (fill) occurs
   * Handles both partial fills and final fills
   */
  public async onTradeExecuted(trade: Trade): Promise<void> {
    this.emit('tradeExecuted', trade);

    if (
      trade.strategyId !== undefined &&
      this._strategyId !== undefined &&
      trade.strategyId !== this._strategyId
    ) {
      return;
    }

    if (trade.symbol === this._symbol && trade.exchange === this._exchangeName) {
      // Update internal position state incrementally
      const quantity = trade.quantity;
      if (String(trade.side).toLowerCase() === 'buy') {
        this._currentPosition = this._currentPosition.plus(quantity);
      } else if (String(trade.side).toLowerCase() === 'sell') {
        this._currentPosition = this._currentPosition.minus(quantity);
      }

      // Update average price using a TRUE volume-weighted average across the
      // whole position (additive on buys, unchanged on sells, reset on flat).
      // Previously this just set `_averagePrice = trade.price`, which is wrong
      // for multi-batch entries: after two buys at different prices the "average"
      // silently became the LAST fill's price, so downstream PnL/TP math went
      // stale whenever the last fill differed from the weighted midpoint.
      this._averagePrice = this.computeAveragePrice(trade);

      this._logger.info(
        `[${this.strategyType}:${this._strategyId}] Position updated to ${this._currentPosition.toString()} (via ${trade.side} ${quantity}) @ avg ${this._averagePrice?.toString() ?? 'N/A'}`,
      );

      // Update performance metrics (Volume, Fees, PnL)
      this._context.performance = PerformanceTracker.updateWithTrade(
        this._context.performance,
        trade,
      );
    }
  }

  public async onPositionUpdate(position: Position): Promise<void> {
    this.emit('positionUpdate', position);
    if (position.symbol === this._symbol && position.exchange === this._exchangeName) {
      this._currentPosition =
        position.side === 'long' ? position.quantity : position.quantity.neg();
      this._averagePrice = position.avgPrice;
      this._logger.debug(
        `[${this.strategyType}:${this._strategyId}] External position update: ${this._currentPosition.toString()} @ ${this._averagePrice?.toString()}`,
      );

      // 🆕 Update performance metrics
      this._context.performance = PerformanceTracker.updateWithPosition(
        this._context.performance,
        position,
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
    this._isInitialized = true;
    this.emit('initialized', this.strategyType);
  }

  protected async onCleanup(): Promise<void> {
    // Override in derived classes for custom cleanup
  }

  /**
   * 🆕 Public lifecycle entry point (implements `IStrategy.cleanup`).
   *
   * The engine drives strategy shutdown through the optional `cleanup?()` on
   * `IStrategy` — NOT the protected `onCleanup()`. Without a public bridge here,
   * every subclass's `onCleanup()` override was dead code: `TradingEngine.stop()`
   * checks `strategy.cleanup?.()` and would call the interface, but BaseStrategy
   * never wired it to `onCleanup`, so subclass cleanup never ran. This bridge
   * fixes that gap and is idempotent.
   */
  public async cleanup(): Promise<void> {
    await this.onCleanup();
    this._isInitialized = false;
  }

  // Utility methods for derived strategies
  protected getParameter<K extends keyof TParams>(key: K): TParams[K] {
    return this._parameters[key];
  }

  protected setParameter<K extends keyof TParams>(key: K, value: TParams[K]): void {
    this._parameters[key] = value;
  }

  // 🆕 State Management Methods Implementation

  /**
   * Save current strategy state - override in derived classes for custom state
   */

  /**
   * Process initial data loaded by TradingEngine
   * This is called after initial data (klines, positions, orders, etc.) is loaded
   * and before real-time subscriptions begin.
   *
   * Default implementation does nothing - derived classes should override if they need
   * to process initial data (e.g., populate buffers, set initial positions, etc.)
   *
   * @param initialData - The loaded initial data containing klines, positions, orders, etc.
   */
  public async processInitialData(
    initialData: InitialDataResult,
  ): Promise<StrategyAnalyzeResult> {
    // Default implementation: log and do nothing
    this._logger.debug(
      `[${this.strategyType}] processInitialData called, method not overridden in derived class:`,
    );
    this._logger.debug(JSON.stringify(initialData, null, 2));
    // Derived classes should override this to process initial data
    // Example: Load klines into buffers, set initial positions, etc.
    return { action: 'hold' };
  }

  /**
   * 🆕 Get Initial Data Configuration
   * TradingEngine calls this method to determine what initial data to load
   * before the strategy starts.
   *
   * Default implementation returns the config from context.
   * Derived classes can override this to provide dynamic configuration
   * based on strategy parameters.
   *
   * ⚠️ IMPORTANT: StrategyLoader.loadInitialDataForStrategy() calls this method
   * (NOT context.initialDataConfig) to determine what data to fetch. Any code
   * that needs the strategy's initial data config must go through this method,
   * not read context.initialDataConfig directly — otherwise dynamic overrides
   * (e.g. fetchOrderBook when basePrice=0) will be silently bypassed by stale
   * DB-stored config. This mirrors the same pattern fixed for subscription
   * config in subscribeStrategyData (commit 83e3497).
   *
   * @returns InitialDataConfig - Configuration for initial data loading
   */
  public getInitialDataConfig(): InitialDataConfig {
    return this._context.initialDataConfig || {};
  }

  /**
   * 🆕 Get Subscription Configuration
   * TradingEngine calls this method to determine what real-time data
   * subscriptions to set up for this strategy.
   *
   * Default implementation returns the config from context.
   * Derived classes can override this to provide dynamic configuration
   * based on strategy parameters.
   *
   * @returns SubscriptionConfig - Configuration for real-time subscriptions
   */
  public getSubscriptionConfig(): SubscriptionConfig {
    return this._context.subscription || {};
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

  /**
   * 🆕 Set the strategy id (from database). Implements the optional
   * `IStrategy.setStrategyId` contract that was previously missing — callers
   * relying on the interface would hit `undefined is not a function`.
   */
  public setStrategyId(id: number): void {
    this._strategyId = id;
    this._context.strategyId = id;
    this._context.performance.strategyId = id;
  }

  public getStrategyName(): string | undefined {
    return this._strategyName;
  }

  /**
   * 🆕 Set the user-defined strategy name (from database). Implements the
   * optional `IStrategy.setStrategyName` contract that was previously missing.
   */
  public setStrategyName(name: string): void {
    this._strategyName = name;
    this._context.strategyName = name;
    this._context.performance.strategyName = name;
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

  /**
   * Compute a volume-weighted average price for the whole position after a trade.
   *
   * Semantics (trade's position is `this._currentPosition`, already updated by
   * the caller before this runs; `oldPos` is the position BEFORE this trade):
   *  - No previous average → opening a position from flat: avg = fill price.
   *  - Trade reduces an existing position (same direction) → remaining shares
   *    keep their entry cost, avg unchanged.
   *  - Position went fully flat → avg resets to undefined.
   *  - Trade flips the position side (e.g. +2 long then sell 3 → net -1 short):
   *    the leftover is a fresh opposing-direction position, so avg resets to the
   *    fill price. A naive mixed-volume weighted average is WRONG here — it
   *    would blend the old long entry cost with the new short entry, which has
   *    no meaning for a single average entry price.
   *  - Trade adds to a position in the SAME direction → true volume-weighted
   *    average of the running cost plus this fill.
   *
   * Mirrors the same weighted-average semantics as `PerformanceTracker.updateWithTrade`
   * (single source of truth for average entry price).
   */
  private computeAveragePrice(trade: Trade): Decimal | undefined {
    const quantity = trade.quantity;
    const fillPrice = trade.price;
    const isBuy = String(trade.side).toLowerCase() === 'buy';
    const current = this._currentPosition; // already updated by caller
    const oldPos = isBuy ? current.minus(quantity) : current.plus(quantity);

    if (quantity.lte(0) || !fillPrice || fillPrice.lte(0)) return this._averagePrice;
    // Opening a fresh position (either side) from flat.
    if (!this._averagePrice || oldPos.eq(0)) return fillPrice;
    // Full close → no position remains, no average.
    if (current.eq(0)) return undefined;
    // Flipping the side (current and oldPos have opposite signs) — the leftover
    // is a NEW opposing-direction position opened at this fill price. Must be
    // checked BEFORE the reduce branch below, because |current| < |oldPos| can
    // also hold across a flip (e.g. +2 → -1: |−1| < |2|).
    if (current.mul(oldPos).lt(0)) return fillPrice;
    // Reducing an existing position (same side, |current| < |oldPos|) — the
    // remaining shares keep their entry cost.
    if (current.abs().lt(oldPos.abs())) return this._averagePrice;
    // Adding to a position in the SAME direction → weighted average.
    const totalCost = this._averagePrice
      .times(oldPos.abs())
      .plus(fillPrice.times(quantity).abs());
    const newPos = oldPos.abs().plus(quantity.abs());
    if (newPos.lte(0)) return undefined;
    return totalCost.div(newPos);
  }

  /**
   * 🆕 Get current performance metrics
   */
  public getPerformance(): StrategyPerformance {
    // Update time metrics before returning
    this._context.performance = PerformanceTracker.updateTimeMetrics(
      this._context.performance,
    );
    return this._context.performance;
  }

  /**
   * 🆕 Get performance summary for quick display
   */
  public getPerformanceSummary() {
    return PerformanceTracker.getSummary(this._context.performance);
  }
}
