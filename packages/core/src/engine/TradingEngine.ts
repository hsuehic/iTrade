import { EventEmitter } from 'events';

import { v4 as uuidv4 } from 'uuid';
import { Decimal } from 'decimal.js';

import {
  ITradingEngine,
  IStrategy,
  IExchange,
  IRiskManager,
  IPortfolioManager,
  ILogger,
  ExecuteOrderParameters,
  IDataManager,
} from '../interfaces';
import {
  Order,
  OrderSide,
  OrderType,
  OrderStatus,
  TimeInForce,
  Position,
  Balance,
  StrategyResult,
  StrategyAnalyzeResult,
  isOrderResult,
  isCancelOrderResult,
  isUpdateOrderResult,
  isHoldResult,
  normalizeAnalyzeResult,
  StrategyCancelOrderResult,
  StrategyUpdateOrderResult,
  Ticker,
  OrderBook,
  Trade,
  Kline,
  DataType,
  SymbolInfo,
  DEFAULT_TICKER_CONFIG,
  DEFAULT_ORDERBOOK_CONFIG,
  DEFAULT_TRADES_CONFIG,
  DEFAULT_KLINES_CONFIG,
  TickerSubscriptionConfig,
  OrderBookSubscriptionConfig,
  TradesSubscriptionConfig,
  KlinesSubscriptionConfig,
  SubscriptionParamValue,
  SignalType,
  SignalMetaData,
} from '../types';
import { EventBus } from '../events';
import { PrecisionUtils } from '../utils/PrecisionUtils';
import { loadInitialDataForStrategy } from '../utils/StrategyLoader';

import { SubscriptionCoordinator } from './SubscriptionCoordinator';

export class TradingEngine extends EventEmitter implements ITradingEngine {
  /**
   * 🆕 Upper bound on the pre-placement duplicate-exit reconciliation.
   *
   * The reconciliation runs ahead of EVERY exit (it is keyed on exit intent),
   * including stop-losses, so it must not be able to delay an exit by an
   * unbounded REST round-trip. On timeout the order is placed anyway — the same
   * outcome as a failed reconciliation (best-effort guard).
   */
  private static readonly DUPLICATE_EXIT_RECONCILE_TIMEOUT_MS = 3000;

  private _isRunning = false;
  private _isInitializing = false; // Track if engine is in initialization phase
  private readonly _strategies = new Map<string, IStrategy>();
  private readonly _exchanges = new Map<string, IExchange>();
  private readonly _strategiesWithLoadedInitialData = new Set<string>(); // Track which strategies have loaded initial data
  private _eventBus: EventBus;
  private subscriptionCoordinator: SubscriptionCoordinator;
  protected readonly _userId?: string;
  protected readonly _dataManager?: IDataManager;

  // 🆕 Performance Persistence Debounce Timers
  private readonly _performanceSaveTimers = new Map<number, NodeJS.Timeout>();

  // Account state tracking (keyed by exchange name)
  private readonly _positions = new Map<string, Position[]>();
  private readonly _orders = new Map<string, Order[]>();
  private readonly _balances = new Map<string, Balance[]>();
  private readonly _pendingAccountUpdates: Array<{
    positions?: Position[];
    orders?: Order[];
    balances?: Balance[];
    exchangeName?: string;
  }> = [];
  // 🆕 Serialize onAccountUpdate calls. WS order updates call onAccountUpdate
  // without await (fire-and-forget from exchange.on('orderUpdate')). Without
  // serialization, concurrent calls can interleave analyze() → strategy state
  // corruption (e.g. TP FILLED handler + delayed CANCELED handler racing on
  // the same strategy instance → duplicate entry orders — Strategy 467 bug).
  private _isProcessingAccountUpdate = false;

  // 🆕 Track which orders have been emitted as "created" to avoid duplicate OrderCreated events
  private readonly _emittedOrderCreated = new Set<string>();

  // 🆕 Track whether the engine has completed its startup pre-fill of
  // _emittedOrderCreated from the database. Until this is true, WS order
  // updates that arrive during reconnection (which re-push open orders) will
  // be treated as "new" and emit OrderCreated events → duplicate push
  // notifications on every restart/redeploy.
  private _emittedOrderCreatedPreFilled = false;
  private readonly _symbolInfoCache = new Map<
    string,
    { info: SymbolInfo; fetchedAt: number }
  >();
  private readonly _symbolInfoTtlMs = 30 * 60 * 1000;

  constructor(
    protected riskManager: IRiskManager,
    protected portfolioManager: IPortfolioManager,
    protected logger: ILogger,
    userId?: string,
    dataManager?: IDataManager,
  ) {
    super();
    this._eventBus = EventBus.getInstance();
    this.subscriptionCoordinator = new SubscriptionCoordinator(logger);
    this._userId = userId;
    this._dataManager = dataManager;
    this.setupEventListeners();
  }

  public get isRunning(): boolean {
    return this._isRunning;
  }

  public get eventBus(): EventBus {
    return this._eventBus;
  }

  public get strategies(): Map<string, IStrategy> {
    return new Map(this._strategies);
  }

  public async start(): Promise<void> {
    if (this._isRunning) {
      this.logger.warn('Trading engine is already running');
      return;
    }

    this._isInitializing = true;
    try {
      this.logger.info('Starting trading engine...');

      // Strategies are already initialized in their constructors

      // Connect to all exchanges and ensure they're ready
      for (const [name, exchange] of this._exchanges) {
        if (!exchange.isConnected) {
          this.logger.warn(`Exchange ${name} is not connected, attempting to connect...`);
          try {
            await exchange.connect({
              apiKey: '',
              secretKey: '',
              sandbox: false,
            });
          } catch (error) {
            this.logger.error(`Failed to connect exchange ${name}`, error as Error);
            // Continue with other exchanges
          }
        }
      }

      // ✅ Mark engine as running BEFORE loading initial data
      // This allows strategies to execute orders during initialization
      this._isRunning = true;

      // 🆕 Pre-fill _emittedOrderCreated with existing open orders from DB
      // so that WS reconnection replays (which re-push open orders) do NOT
      // trigger duplicate OrderCreated events → duplicate push notifications.
      // This is the root cause of "redelivery of push notifications on redeploy":
      // after restart, _emittedOrderCreated is empty, so the engine treats
      // every WS-replayed open order as "new" and emits OrderCreated.
      await this.preFillEmittedOrderCreated();

      // 🔄 Load initial data for all strategies that need it (before subscribing to real-time data)
      // This handles strategies added before engine.start() is called
      for (const [name, strategy] of this._strategies) {
        await this.prefetchSymbolInfoForStrategy(name, strategy);
        await this.loadInitialDataForStrategy(name, strategy);
      }

      // Auto-subscribe to all strategy data
      for (const [name, strategy] of this._strategies) {
        try {
          await this.subscribeStrategyData(name, strategy);
        } catch (error) {
          this.logger.error(
            `Failed to subscribe data for strategy ${name}`,
            error as Error,
          );
          // Continue with other strategies
        }
      }

      this._eventBus.emitEngineStarted();
      this.logger.info('Trading engine started successfully');
      await this.flushPendingAccountUpdates();
      this._isInitializing = false;
    } catch (error) {
      this._isRunning = false;
      this._isInitializing = false;
      this.logger.error('Failed to start trading engine', error as Error);
      this._eventBus.emitEngineError(error as Error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this._isRunning) {
      this.logger.warn('Trading engine is already stopped');
      return;
    }

    try {
      this.logger.info('Stopping trading engine...');

      // Cleanup all strategies
      for (const [name, strategy] of this._strategies) {
        try {
          // 🆕 Save final performance metrics before stopping
          await this.forceSaveStrategyPerformance(name, strategy);

          await strategy.cleanup?.();
        } catch (error) {
          this.logger.error(`Failed to cleanup strategy ${name}`, error as Error);
        }
      }

      // Clear all subscriptions
      await this.subscriptionCoordinator.clear();

      this._isRunning = false;
      this._eventBus.emitEngineStopped();
    } catch (error) {
      this.logger.error('Error stopping trading engine', error as Error);
      this._eventBus.emitEngineError(error as Error);
      throw error;
    }
  }

  public async addStrategy(name: string, strategy: IStrategy): Promise<void> {
    if (this._strategies.has(name)) {
      throw new Error(`Strategy ${name} already exists`);
    }

    this._strategies.set(name, strategy);
    this.logger.info(`Added strategy: ${name}`);

    await this.prefetchSymbolInfoForStrategy(name, strategy);

    // If engine is already running, load initial data and subscribe
    // (for strategies added dynamically after engine.start())
    if (this._isRunning) {
      this.logger.info(
        `🔧 [TRADING_ENGINE] Engine is running, initializing strategy: ${name}`,
      );

      // Load initial data first (before subscribing to real-time data)
      this.logger.debug(`🔧 [TRADING_ENGINE] Loading initial data for: ${name}`);
      await this.loadInitialDataForStrategy(name, strategy);

      // Then subscribe to real-time data
      this.logger.debug(`🔧 [TRADING_ENGINE] Subscribing to data for: ${name}`);
      await this.subscribeStrategyData(name, strategy);

      this.logger.info(
        `✅ [TRADING_ENGINE] Strategy initialized and subscribed: ${name}`,
      );
    } else {
      this.logger.info(
        `⏳ [TRADING_ENGINE] Engine not running yet, will initialize on engine.start(): ${name}`,
      );
    }
    // Otherwise, initial data will be loaded when engine.start() is called
  }

  public async removeStrategy(name: string): Promise<void> {
    if (!this._strategies.has(name)) {
      throw new Error(`Strategy ${name} does not exist`);
    }

    // Auto-unsubscribe strategy data
    await this.unsubscribeStrategyData(name);

    // Remove from strategies map
    this._strategies.delete(name);

    // Remove from loaded initial data tracking
    this._strategiesWithLoadedInitialData.delete(name);

    this.logger.info(`Removed strategy: ${name}`);
  }

  public getStrategy(name: string): IStrategy | undefined {
    return this._strategies.get(name);
  }

  public async addExchange(name: string, exchange: IExchange): Promise<void> {
    if (this._exchanges.has(name)) {
      throw new Error(`Exchange ${name} already exists`);
    }

    this._exchanges.set(name, exchange);
    this.setupExchangeListeners(exchange);

    // Auto-subscribe to user data if exchange has credentials
    if (exchange.isConnected) {
      try {
        await exchange.subscribeToUserData();
        this.logger.info(`✅ Subscribed to user data for exchange: ${name}`);
      } catch (error) {
        this.logger.warn(
          `Failed to subscribe to user data for ${name}: ${(error as Error).message}`,
        );
      }
    }

    this.logger.info(`Added exchange: ${name}`);
  }

  public removeExchange(name: string): void {
    const exchange = this._exchanges.get(name);
    if (!exchange) {
      throw new Error(`Exchange ${name} does not exist`);
    }

    exchange.removeAllListeners();
    this._exchanges.delete(name);
    this.logger.info(`Removed exchange: ${name}`);
  }

  /**
   * Process ticker data (recommended)
   */
  public async onTicker(
    symbol: string,
    ticker: Ticker,
    exchangeName?: string,
  ): Promise<void> {
    if (!this._isRunning) {
      return;
    }

    try {
      // Process ticker with all strategies
      for (const [strategyName, strategy] of this._strategies) {
        try {
          const result = await strategy.analyze({ ticker, exchangeName, symbol });
          await this.processStrategyResults(strategyName, symbol, result);
        } catch (error) {
          this.logger.error(`Error in strategy ${strategyName}`, error as Error);
          this._eventBus.emitStrategyError(strategyName, error as Error);
        }
      }
    } catch (error) {
      this.logger.error('Error processing ticker data', error as Error);
    }
  }

  /**
   * Process order book data (recommended)
   */
  public async onOrderBook(
    symbol: string,
    orderbook: OrderBook,
    exchangeName?: string,
  ): Promise<void> {
    if (!this._isRunning) {
      return;
    }

    try {
      // Process orderbook with all strategies
      for (const [strategyName, strategy] of this._strategies) {
        try {
          const result = await strategy.analyze({ orderbook, exchangeName, symbol });
          await this.processStrategyResults(strategyName, symbol, result);
        } catch (error) {
          this.logger.error(`Error in strategy ${strategyName}`, error as Error);
          this._eventBus.emitStrategyError(strategyName, error as Error);
        }
      }
    } catch (error) {
      this.logger.error('Error processing orderbook data', error as Error);
    }
  }

  /**
   * Process trades data (recommended)
   */
  public async onTrades(
    symbol: string,
    trades: Trade[],
    exchangeName?: string,
  ): Promise<void> {
    if (!this._isRunning) {
      return;
    }

    try {
      // Add exchange info to trades if provided
      if (exchangeName) {
        trades.forEach((trade) => {
          trade.exchange = exchangeName;
        });
      }

      // Process trades with all strategies
      for (const [strategyName, strategy] of this._strategies) {
        try {
          const result = await strategy.analyze({ trades, exchangeName, symbol });
          await this.processStrategyResults(strategyName, symbol, result);
        } catch (error) {
          this.logger.error(`Error in strategy ${strategyName}`, error as Error);
          this._eventBus.emitStrategyError(strategyName, error as Error);
        }
      }
    } catch (error) {
      this.logger.error('Error processing trades data', error as Error);
    }
  }

  /**
   * Process kline data (recommended)
   */
  public async onKline(
    symbol: string,
    kline: Kline,
    exchangeName?: string,
  ): Promise<void> {
    if (!this._isRunning) {
      return;
    }

    try {
      // Add exchange info to kline if provided
      if (exchangeName) {
        kline.exchange = exchangeName;
      }

      // Process kline with all strategies
      for (const [strategyName, strategy] of this._strategies) {
        try {
          const result = await strategy.analyze({
            klines: [kline],
            symbol,
            exchangeName,
          });
          await this.processStrategyResults(strategyName, symbol, result);
        } catch (error) {
          this.logger.error(`Error in strategy ${strategyName}`, error as Error);
          this._eventBus.emitStrategyError(strategyName, error as Error);
        }
      }
    } catch (error) {
      this.logger.error('Error processing kline data', error as Error);
    }
  }

  /**
   * @deprecated Use specific methods like onTicker, onOrderBook, onTrades, onKline instead.
   * This method is kept for backward compatibility.
   */
  public async onMarketData(
    symbol: string,
    data: unknown,
    exchangeName?: string,
  ): Promise<void> {
    if (!this._isRunning) {
      return;
    }

    // Auto-detect data type and call appropriate method
    if (this.isTicker(data)) {
      return this.onTicker(symbol, data as Ticker, exchangeName);
    } else if (this.isOrderBook(data)) {
      return this.onOrderBook(symbol, data as OrderBook, exchangeName);
    } else if (this.isKline(data)) {
      return this.onKline(symbol, data as Kline, exchangeName);
    } else if (Array.isArray(data) && data.length > 0 && this.isTrade(data[0])) {
      return this.onTrades(symbol, data as Trade[], exchangeName);
    }

    // Fallback to old behavior for unknown data types
    try {
      if (exchangeName && data && typeof data === 'object' && data !== null) {
        (data as Record<string, unknown>).exchange = exchangeName;
      }

      for (const [strategyName, strategy] of this._strategies) {
        try {
          const result = await strategy.analyze({
            ticker: data as Ticker,
            exchangeName,
            symbol,
          });
          await this.processStrategyResults(strategyName, symbol, result);
        } catch (error) {
          this.logger.error(`Error in strategy ${strategyName}`, error as Error);
          this._eventBus.emitStrategyError(strategyName, error as Error);
        }
      }
    } catch (error) {
      this.logger.error('Error processing market data', error as Error);
    }
  }

  /**
   * Type guard for Ticker
   */
  private isTicker(data: unknown): data is Ticker {
    return (
      data !== null &&
      data !== undefined &&
      typeof data === 'object' &&
      'price' in data &&
      'volume' in data &&
      'timestamp' in data
    );
  }

  /**
   * Type guard for OrderBook
   */
  private isOrderBook(data: unknown): data is OrderBook {
    return (
      data !== null &&
      data !== undefined &&
      typeof data === 'object' &&
      'bids' in data &&
      'asks' in data &&
      Array.isArray((data as { bids: unknown }).bids) &&
      Array.isArray((data as { asks: unknown }).asks)
    );
  }

  /**
   * Type guard for Kline
   */
  private isKline(data: unknown): data is Kline {
    return (
      data !== null &&
      data !== undefined &&
      typeof data === 'object' &&
      'open' in data &&
      'high' in data &&
      'low' in data &&
      'close' in data &&
      'interval' in data
    );
  }

  /**
   * Type guard for Trade
   */
  private isTrade(data: unknown): data is Trade {
    return (
      data !== null &&
      data !== undefined &&
      typeof data === 'object' &&
      'id' in data &&
      'price' in data &&
      'quantity' in data &&
      'side' in data
    );
  }

  /**
   * 🆕 The exchange error body carried by a failed HTTP call, if any.
   *
   * Binance answers `{ code: -2011, msg: 'Unknown order sent.' }` with HTTP 400;
   * axios only surfaces `Request failed with status code 400` in `message`, so
   * the body is the only place the real reason exists.
   */
  private getExchangeErrorBody(
    error: unknown,
  ): { code?: string | number; msg?: string; message?: string } | undefined {
    return error && typeof error === 'object' && 'response' in error
      ? (
          error as {
            response?: {
              data?: { msg?: string; message?: string; code?: string | number };
            };
          }
        ).response?.data
      : undefined;
  }

  private formatOrderErrorMessage(error: unknown): string {
    // 🆕 The EXCHANGE's own message outranks the transport's.
    //
    // An axios failure carries the generic `Request failed with status code
    // 400` in `error.message`, while the reason that actually matters sits in
    // the response body (`{ code: -2011, msg: 'Unknown order sent.' }`).
    // Reading `message` first hid every exchange code from the persisted row,
    // the push notification and the operator (incident 2026-10-01, strategy
    // 633: a dead entry was reported as `Order Failed — Request failed with
    // status code 400` once a minute for an hour, with nothing to act on).
    // The code is kept alongside the text: it is what operators grep for.
    const responseData = this.getExchangeErrorBody(error);
    const exchangeMessage = responseData?.msg || responseData?.message;
    const code = responseData?.code;
    if (exchangeMessage !== undefined && String(exchangeMessage).trim() !== '') {
      return code === undefined || code === null || String(code).trim() === ''
        ? String(exchangeMessage)
        : `${String(exchangeMessage)} (code ${code})`;
    }
    if (code !== undefined && code !== null && String(code).trim() !== '') {
      return `Exchange error code ${String(code)}`;
    }
    if (error instanceof Error && error.message) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return 'Unknown order error';
    }
  }

  public async executeOrder(params: ExecuteOrderParameters): Promise<Order> {
    const {
      strategyName,
      strategyId: paramsStrategyId,
      symbol,
      side,
      quantity,
      type,
      price,
      tradeMode,
      leverage,
      clientOrderId: providedClientOrderId, // 🆕 Accept clientOrderId from params
      reduceOnly,
      dedupeExit,
    } = params;
    if (!this._isRunning) {
      const stateMsg = this._isInitializing
        ? 'Engine is still initializing'
        : 'Engine is not running';
      throw new Error(
        `Trading engine is not ready to execute orders: ${stateMsg}. ` +
          `Make sure engine.start() has been called and completed successfully.`,
      );
    }

    const strategy = this._strategies.get(strategyName);
    const exchangeConfig = strategy?.config?.exchange;

    // 🆕 Get strategy metadata
    const strategyId =
      paramsStrategyId ?? strategy?.getStrategyId?.() ?? strategy?.config?.strategyId;
    const strategyType = strategy?.strategyType; // Strategy class name
    const userDefinedName = strategy?.strategyName || strategy?.config?.strategyName; // User-defined name

    // For order execution, use the first exchange if array is provided
    const exchangeName = Array.isArray(exchangeConfig)
      ? exchangeConfig[0]
      : exchangeConfig;

    const isPointedExchange = !!exchangeName;
    // Find an available exchange to execute the order
    const exchange = isPointedExchange
      ? this._exchanges.get(exchangeName)
      : this.findExchangeForSymbol(symbol);
    if (!exchange) {
      throw new Error(
        isPointedExchange
          ? `Exchange ${exchangeName} not found`
          : `No exchange available for symbol ${symbol}`,
      );
    }

    let orderForNotification: Order | null = null;

    try {
      // Fetch symbol info (cached) to get precision requirements
      const symbolInfo = await this.getSymbolInfoWithCache(exchange, symbol);

      // Apply precision to quantity
      let adjustedQuantity = PrecisionUtils.roundQuantity(
        quantity,
        symbolInfo.stepSize,
        symbolInfo.quantityPrecision,
      );

      // Validate quantity meets exchange requirements
      this.logger.debug(
        `[TradingEngine] Validating order for ${symbol}: quantity=${adjustedQuantity.toString()}, ` +
          `maxQuantity=${symbolInfo.maxQuantity?.toString()}, minQuantity=${symbolInfo.minQuantity.toString()}`,
      );
      PrecisionUtils.validateQuantity(
        adjustedQuantity,
        symbolInfo.minQuantity,
        symbolInfo.maxQuantity,
        symbolInfo.stepSize,
      );

      // Apply precision to price (if provided)
      let adjustedPrice = price;
      if (price) {
        adjustedPrice = PrecisionUtils.roundPrice(
          price,
          symbolInfo.tickSize,
          symbolInfo.pricePrecision,
        );

        // Validate price
        PrecisionUtils.validatePrice(adjustedPrice, symbolInfo.tickSize);

        // Validate notional value (quantity * price)
        PrecisionUtils.validateNotional(
          adjustedQuantity,
          adjustedPrice,
          symbolInfo.minNotional,
        );
      }

      // Log precision adjustments if any changes were made
      if (!adjustedQuantity.equals(quantity)) {
        this.logger.info(
          `Adjusted quantity for ${symbol}: ${quantity.toString()} → ${adjustedQuantity.toString()}`,
        );
      }
      if (price && adjustedPrice && !adjustedPrice.equals(price)) {
        this.logger.info(
          `Adjusted price for ${symbol}: ${price.toString()} → ${adjustedPrice.toString()}`,
        );
      }

      // Get current positions and balances for risk checking
      const positions = await this.portfolioManager.getPositions();
      const balances = await this.portfolioManager.getBalances();

      // 🆕 Use provided clientOrderId from signal metadata, or generate one
      // Format: s-{strategyId|"id"}-{timestamp} (max 32 chars for OKX)
      // Uses hyphen (-) which is supported by all exchanges (OKX, Binance, Coinbase)
      const clientOrderId =
        providedClientOrderId ||
        (() => {
          const timestamp = Date.now();
          const idPart = strategyId ? String(strategyId) : 'id';
          return `s${idPart}${timestamp}`.slice(0, 32);
        })();

      // Create order object for risk checking (with adjusted values)
      const order: Order = {
        id: uuidv4(),
        clientOrderId,
        userId: this._userId,
        symbol,
        side,
        type,
        quantity: adjustedQuantity,
        price: adjustedPrice, // 🆕 Pass through stopPrice
        status: 'NEW' as OrderStatus,
        timeInForce: 'GTC' as TimeInForce,
        timestamp: new Date(),

        // 🆕 Add strategy and exchange association
        exchange: exchangeName,
        strategyId: strategyId,
        strategyType: strategyType, // Strategy type/class (e.g., "MovingAverage")
        strategyName: userDefinedName, // User-defined name (e.g., "MA_1")
      };
      orderForNotification = order;

      // Check risk limits
      const riskCheckPassed = await this.riskManager.checkOrderRisk(
        order,
        positions,
        balances,
      );
      if (!riskCheckPassed) {
        const error = new Error(
          `Order rejected by risk manager: ${JSON.stringify(order)}`,
        );
        this.logger.error('Order rejected by risk manager', error, { order });
        throw error;
      }

      // 🆕 Duplicate-exit guard (Strategy 609).
      // Before placing an order that is meant to CLOSE a position we reconcile
      // against the exchange's real open orders: if this strategy still has a
      // live order on the same symbol+side **with identical quantity and price**
      // that it believes is gone (cancel lost / tracking dropped / process
      // restarted), cancel it first. Anything we cannot prove is a duplicate is
      // left alone.
      // Best-effort: a REST failure — or a slow one — must never block the exit.
      //
      // 2026-10-01 (strategy 631): the gate is EXIT INTENT, not the exchange's
      // `reduceOnly` flag. A reduceOnly SELL is rejected (-2022) whenever it
      // would not purely reduce the account net position, so no strategy sets
      // that flag any more — gating this reconciliation on it would have left
      // the guard dead and reopened the 609 window. Callers pass `dedupeExit`
      // (derived from the signal's `metadata.signalType` by `isExitIntent`);
      // `reduceOnly` is still honoured for any caller that explicitly sets it.
      // No price (market / stop-market exit) => the duplicate filter can NEVER
      // prove identity (`price == null` is left alone by design), so running the
      // reconciliation would add a REST round-trip — up to the timeout — for a
      // guaranteed no-op. Skip it outright (review R3 M1).
      const hasProvablePrice = adjustedPrice !== undefined && adjustedPrice !== null;
      if ((reduceOnly || dedupeExit) && hasProvablePrice) {
        // Bounded wait (review R2 m4): this now runs ahead of EVERY exit,
        // including stop-losses, so a slow `getOpenOrders` must not delay a stop
        // in a fast market. On timeout we place the order anyway.
        //
        // ⚠️ The timeout only stops us WAITING; it does not stop the
        // reconciliation. A late snapshot must therefore never trigger a cancel
        // after we gave up on it (review R3 B1: a stale snapshot could cancel
        // the order we just placed → position left with no exit at all). The
        // `abandoned` flag below is checked by the reconciliation itself after
        // `getOpenOrders` and before every `cancelOrder`.
        let abandoned = false;
        let reconciliationSettled = false;
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            this.reconcileDuplicateExitOrders({
              exchange,
              symbol,
              side,
              exchangeName,
              strategyId,
              strategyName: userDefinedName,
              keepClientOrderId: order.clientOrderId,
              quantity: adjustedQuantity,
              price: adjustedPrice,
              isAbandoned: () => abandoned,
            }).then(
              () => {
                reconciliationSettled = true;
              },
              () => {
                reconciliationSettled = true;
              },
            ),
            new Promise<void>((resolve) => {
              timeoutHandle = setTimeout(() => {
                abandoned = true;
                resolve();
              }, TradingEngine.DUPLICATE_EXIT_RECONCILE_TIMEOUT_MS);
            }),
          ]);
        } finally {
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }
        }
        if (!reconciliationSettled) {
          this.logger.warn(
            `Duplicate exit reconciliation still running after ` +
              `${TradingEngine.DUPLICATE_EXIT_RECONCILE_TIMEOUT_MS}ms before placing ${side} order for ` +
              `${userDefinedName ?? strategyId} on ${symbol} — placing the order anyway (best-effort guard)`,
          );
        }
      }

      // Execute the order with adjusted values
      const executedOrder = await exchange.createOrder(
        symbol,
        side,
        type,
        adjustedQuantity,
        adjustedPrice,
        'GTC' as TimeInForce,
        order.clientOrderId,
        {
          tradeMode,
          leverage,
          stopPrice: params.stopPrice, // 🆕 Pass stopPrice to exchange
          reduceOnly, // 🆕 Risk-reducing flag (exchange-level guard)
        },
      );

      // 🆕 Ensure executedOrder contains association metadata
      executedOrder.exchange = exchangeName;
      executedOrder.strategyId = strategyId;
      executedOrder.strategyType = strategyType; // Strategy type/class
      executedOrder.strategyName = userDefinedName; // User-defined name
      if (!executedOrder.userId) {
        executedOrder.userId = this._userId;
      }

      this.logger.logTrade('Order executed', {
        order: executedOrder,
        strategyId,
        strategyType, // Strategy type/class
        strategyName: userDefinedName, // User-defined name
        exchange: exchangeName,
      });

      const emittedKey = executedOrder.clientOrderId || executedOrder.id;
      if (!this._emittedOrderCreated.has(emittedKey)) {
        this._eventBus.emitOrderCreated({ order: executedOrder, timestamp: new Date() });
        this._emittedOrderCreated.add(emittedKey);
      }

      return executedOrder;
    } catch (error) {
      const errorMessage = this.formatOrderErrorMessage(error);
      const rejectedOrder: Order = {
        ...(orderForNotification ?? {
          id: uuidv4(),
          clientOrderId: providedClientOrderId,
          userId: this._userId,
          symbol,
          side,
          type,
          quantity,
          price,
          status: OrderStatus.REJECTED,
          timeInForce: 'GTC' as TimeInForce,
          timestamp: new Date(),
          exchange: exchangeName,
          strategyId: strategyId,
          strategyType: strategyType,
          strategyName: userDefinedName,
        }),
        status: OrderStatus.REJECTED,
        updateTime: new Date(),
        errorMessage,
      };
      if (!rejectedOrder.userId) {
        rejectedOrder.userId = this._userId;
      }
      this._eventBus.emitOrderRejected({ order: rejectedOrder, timestamp: new Date() });
      this.logger.error('Failed to execute order', error as Error, { params });
      throw error;
    }
  }

  public async getPositions(): Promise<Position[]> {
    return await this.portfolioManager.getPositions();
  }

  public async getPosition(symbol: string): Promise<Position | undefined> {
    const positions = await this.getPositions();
    return positions.find((p) => p.symbol === symbol);
  }

  /**
   * Process strategy analyze results (handles both single and array results)
   *
   * @param strategyName - Name of the strategy
   * @param symbol - Trading symbol
   * @param result - Single result or array of results from strategy.analyze()
   * @param source - Optional source context for logging (e.g., 'account update')
   */
  private async processStrategyResults(
    strategyName: string,
    symbol: string,
    result: StrategyAnalyzeResult,
    source?: string,
  ): Promise<void> {
    // Normalize to array for uniform processing
    const results = normalizeAnalyzeResult(result);

    for (const signal of results) {
      // Skip hold signals
      if (isHoldResult(signal)) {
        continue;
      }

      // Handle update order signals
      if (isUpdateOrderResult(signal)) {
        await this.executeUpdateOrder(strategyName, symbol, signal);
        continue;
      }

      // Handle cancel order signals
      if (isCancelOrderResult(signal)) {
        await this.executeCancelOrder(strategyName, symbol, signal);
        continue;
      }

      // Handle buy/sell signals
      if (isOrderResult(signal)) {
        const targetSymbol = signal.symbol || symbol;

        // Log signal execution with source context
        if (source) {
          this.logger.info(
            `🎯 Executing signal from ${strategyName} triggered by ${source} (reason: ${signal.reason || 'N/A'})`,
          );
        }

        // Emit signal event
        this._eventBus.emitStrategySignal({
          strategyName,
          symbol: targetSymbol,
          action: signal.action,
          quantity: signal.quantity?.toNumber(),
          price: signal.price?.toNumber(),
          confidence: signal.confidence,
          reason: signal.reason,
          timestamp: new Date(),
        });

        // Execute the order
        await this.executeStrategySignal(strategyName, targetSymbol, signal);
      }
    }
  }

  /**
   * 🆕 Cancel this strategy's own still-live orders on the same symbol+side
   * before an exit order is placed (exit intent: TP / stop-loss / trailing —
   * see `isExitIntent`). Previously named `reconcileDuplicateReduceOnlyOrders`
   * and gated on the exchange `reduceOnly` flag; re-keyed 2026-10-01 (strategy
   * 631) because that flag is no longer sent by any strategy and the guard had
   * become dead code.
   *
   * Why (Strategy 609, 2026-09-23 WLD-L-9):
   *   The strategy emitted two identical TP sells 4s apart. Its local tracking
   *   had lost the first one, so no cancel was ever sent for it; both orders
   *   were live and both filled → 15000 oversell (negative net position).
   *   Local state alone cannot close that window — only the exchange knows which
   *   orders are really live. This method asks the exchange and cancels the
   *   duplicates before the new exit order is placed.
   *
   * What counts as a duplicate: same symbol, same side, same strategyId, and
   *   IDENTICAL quantity and price. Anything else is left alone — a ladder may
   *   legitimately keep several live exits at once, and an unprovable duplicate
   *   must never be cancelled (a wrong cancel is unrecoverable).
   *
   * Scope safety: only orders whose clientOrderId encodes *this* strategyId
   *   (`^(E|T)<strategyId>D…`, the engine-wide convention already used by
   *   `enrichOrderWithStrategyInfo`) are touched, so another strategy's orders
   *   on the same symbol/account can never be cancelled.
   *
   * Best-effort: any failure is logged and swallowed — the exit order is then
   *   placed anyway (the wait is bounded, see
   *   `DUPLICATE_EXIT_RECONCILE_TIMEOUT_MS`). There is no exchange-level
   *   `reduceOnly` hard guard behind it any more (removed for strategy 631 on
   *   2026-10-01), which is exactly why this exchange-truth reconciliation must
   *   stay armed.
   *
   * Abandonment: when the caller's bounded wait expires it sets `isAbandoned`,
   *   and this method then performs NO cancels (checked right after
   *   `getOpenOrders` and before every `cancelOrder`) — a late snapshot must
   *   never cancel an order that was already placed in the meantime.
   *
   * Documented assumption: no strategy deliberately keeps two live EXITS with
   *   identical symbol, side, quantity and price as separate tranches — such a
   *   pattern would be deduped here. Entries (`SignalType.Entry`) are never
   *   armed, so ladder entries are untouched.
   */
  private async reconcileDuplicateExitOrders(options: {
    exchange: IExchange;
    symbol: string;
    side: OrderSide;
    exchangeName?: string;
    strategyId?: number;
    strategyName?: string;
    keepClientOrderId?: string;
    /** Size of the order we are about to place — used for duplicate identity. */
    quantity?: Decimal;
    /** Price of the order we are about to place (undefined for market orders). */
    price?: Decimal;
    /**
     * Returns true once the caller has stopped waiting for us (bounded wait).
     * Checked after `getOpenOrders` and before every `cancelOrder`: a late
     * snapshot must never cancel an order based on a state we abandoned.
     */
    isAbandoned?: () => boolean;
  }): Promise<void> {
    const {
      exchange,
      symbol,
      side,
      exchangeName,
      strategyId,
      strategyName,
      keepClientOrderId,
      quantity,
      price,
      isAbandoned,
    } = options;

    if (!exchange || strategyId === undefined || strategyId === null) {
      return;
    }

    // Without the id of the order we are about to place there is nothing to
    // compare against — do nothing rather than cancel on a guess.
    if (!keepClientOrderId) {
      return;
    }

    try {
      const openOrders = await exchange.getOpenOrders(symbol);
      // The caller may have stopped waiting for us while this call was in
      // flight (bounded wait). A snapshot taken after we were abandoned must
      // not drive cancels: acting on it could cancel the exit the caller has
      // already placed in the meantime (review R3 B1).
      if (isAbandoned?.()) {
        this.logger.warn(
          `Duplicate exit reconciliation abandoned (caller already placed its ${side} ` +
            `order for ${strategyName ?? strategyId} on ${symbol}) — no cancels performed`,
        );
        return;
      }
      if (!Array.isArray(openOrders) || openOrders.length === 0) {
        return;
      }

      // A duplicate must be a TRUE duplicate of the order we are about to
      // place: same symbol, same side, same size and same price.
      //
      // Same-side alone is far too broad (review must-fix): a ladder can
      // legitimately keep several live exits at once (multiple TP legs,
      // stop-loss, a re-armed exit) and cancelling those would silently delete
      // a position's only way out — the exact class of bug we are fixing.
      // Anything we cannot positively identify is left alone: the
      // strategy-side tracking invariant remains as the guard, whereas a wrong
      // cancel is unrecoverable.
      const duplicates = openOrders.filter((openOrder) => {
        const clientOrderId = openOrder.clientOrderId;
        if (!clientOrderId || clientOrderId === keepClientOrderId) {
          return false;
        }
        if (openOrder.side !== side) {
          return false;
        }
        if (!this.isStrategyOwnedClientOrderId(clientOrderId, strategyId)) {
          return false;
        }
        // Defence in depth: a connector whose getOpenOrders ignores the symbol
        // filter (e.g. Coinbase) returns the whole account. If the symbol
        // formats don't line up we simply reconcile nothing.
        if (!this.sameSymbol(openOrder.symbol, symbol)) {
          return false;
        }
        // Size must match; the price must be PROVABLE on both sides (review R2
        // m4): if our own order has no price (market/stop-market) or the
        // exchange payload has none, two orders of the same size are NOT
        // provably identical, and this method's rule is to leave anything
        // unprovable alone — a wrong cancel is unrecoverable.
        if (!this.sameDecimal(openOrder.quantity, quantity)) {
          return false;
        }
        if (price === undefined || price === null) {
          return false;
        }
        if (!this.sameDecimal(openOrder.price, price)) {
          return false;
        }
        return true;
      });

      if (duplicates.length === 0) {
        return;
      }

      this.logger.warn(
        `🧯 Duplicate exit order(s) detected before placing ${side} order for ${strategyName ?? strategyId}: ` +
          `${duplicates.map((o) => o.clientOrderId ?? o.id).join(', ')} (keeping ${keepClientOrderId ?? 'n/a'})`,
      );

      for (const duplicate of duplicates) {
        if (isAbandoned?.()) {
          this.logger.warn(
            `Duplicate exit reconciliation abandoned mid-cancels for ` +
              `${strategyName ?? strategyId} on ${symbol} — stopping (the caller has ` +
              `already placed its exit; a wrong cancel is unrecoverable)`,
          );
          return;
        }
        try {
          await exchange.cancelOrder(symbol, duplicate.id, duplicate.clientOrderId);
          this.logger.logStrategy(
            'Cancelled duplicate exit order before placing new one',
            {
              strategy: strategyName ?? String(strategyId),
              symbol,
              side,
              cancelledOrderId: duplicate.id,
              cancelledClientOrderId: duplicate.clientOrderId,
              keptClientOrderId: keepClientOrderId,
              exchange: exchangeName,
            },
          );
        } catch (cancelError) {
          // -2011 / -2013 (unknown order / already filled or gone) are expected
          // when the exchange already closed this order — nothing left to do.
          this.logger.warn(
            `Duplicate exit order cancel failed (ignored) for ${duplicate.clientOrderId ?? duplicate.id}: ` +
              `${this.formatOrderErrorMessage(cancelError)}`,
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        `Duplicate exit order reconciliation failed before placing ${side} order for ${strategyName ?? strategyId} ` +
          `on ${symbol}: ${this.formatOrderErrorMessage(error)}`,
      );
    }
  }

  /**
   * 🆕 Is this order's size/price the same as the one we are about to place?
   *
   * Used to prove that a live exchange order really is a duplicate of the exit
   * we are re-issuing. Missing values return `false` (we cannot prove it, so we
   * never cancel). A small relative tolerance absorbs tick/precision
   * differences between our own price and what the exchange echoes back.
   */
  private sameDecimal(
    a?: Decimal | string | number | null,
    b?: Decimal | string | number | null,
    relativeTolerance = 1e-6,
  ): boolean {
    if (a === undefined || a === null || b === undefined || b === null) {
      return false;
    }
    try {
      const left = new Decimal(a);
      const right = new Decimal(b);
      if (left.eq(right)) {
        return true;
      }
      const scale = Decimal.max(left.abs(), right.abs());
      return scale.gt(0) && left.minus(right).abs().lte(scale.times(relativeTolerance));
    } catch {
      return false;
    }
  }

  /**
   * 🆕 Is this signal an EXIT order (closing/reducing a position)?
   *
   * Used to arm the duplicate-exit reconciliation without relying on the
   * exchange `reduceOnly` flag, which no strategy sets any more (a reduceOnly
   * SELL is rejected with -2022 when it would not purely reduce the account net
   * position — strategy 631, 2026-10-01).
   *
   * Rule — an explicit ALLOWLIST: `TakeProfit`, `StopLoss`, `TrailingStop`.
   * Anything else stays unarmed, including a missing/unknown `signalType` or a
   * signal without metadata. We never guess: this guard cancels live orders, so
   * an unrecognised signal must fail closed.
   */
  private isExitIntent(metadata?: SignalMetaData): boolean {
    if (!metadata) {
      return false;
    }
    return (
      metadata.signalType === SignalType.TakeProfit ||
      metadata.signalType === SignalType.StopLoss ||
      metadata.signalType === SignalType.TrailingStop
    );
  }

  /**
   * 🆕 Do two symbol strings refer to the same instrument?
   *
   * Case/whitespace-insensitive only: we deliberately do not try to convert
   * between native (`WLD-USDT-SWAP`) and unified (`WLD/USDT:USDT`) formats.
   * A false negative costs us one skipped reconciliation (the strategy-side
   * invariant still guards the exit), while a false positive could cancel
   * another strategy's order — so we stay strict.
   */
  private sameSymbol(a?: string | null, b?: string | null): boolean {
    if (!a || !b) {
      return false;
    }
    const normalize = (value: string) => value.toUpperCase().replace(/\s+/g, '');
    return normalize(a) === normalize(b);
  }

  /**
   * 🆕 Does the given order already show execution?
   *
   * A failed cancel must never rewrite an executed order as REJECTED
   * (Strategy 609: a FILLED 15000 sell was stored as REJECTED while keeping
   * executedQuantity, hiding the oversell from the console).
   */
  private isOrderAlreadyExecuted(order?: Order): boolean {
    if (!order) {
      return false;
    }
    if (order.status === OrderStatus.FILLED) {
      return true;
    }
    // ANY real execution counts, including a partial fill: inventory did move,
    // so writing REJECTED would be a lie that hides it (review must-fix).
    const executed = order.executedQuantity
      ? new Decimal(order.executedQuantity)
      : new Decimal(0);
    return executed.gt(0);
  }

  /**
   * 🆕 Does this order error mean "the venue does not know this order"?
   *
   * Binance answers `-2011 Unknown order sent.` and `-2013 Order does not
   * exist` for an order that was already filled, cancelled or expired — and
   * for an id the venue never saw at all. It is the venue's own words that
   * matter, so the match is on the response CODE or on the exchange `msg`;
   * the transport's generic `Request failed with status code 400` never matches
   * (a plain HTTP 400 must not be read as "order is gone" — only the exchange
   * can say that).
   *
   * SCOPE (deliberate): the codes and the wording below are Binance's, matched
   * on the axios/`response.data` error shape. A venue whose adapter surfaces a
   * different code, or that squeezes the text into `error.message`, simply will
   * not match — the reconcile then fails closed to the old REJECTED report,
   * which is the safe direction, but it means the fix is NOT automatic for
   * other venues. Those adapters must normalise their error shape (a
   * `{ code, msg }` body) for this to engage.
   */
  private isUnknownOrderError(error: unknown): boolean {
    const responseData = this.getExchangeErrorBody(error);
    // Adapters differ on the type of `code` (a number from Binance, a string
    // once it went through a gateway) — compare numerically.
    const code = Number(responseData?.code);
    if (code === -2011 || code === -2013) {
      return true;
    }

    const exchangeMessage = String(responseData?.msg || responseData?.message || '');
    return /unknown order sent|order does not exist|order not found/i.test(
      exchangeMessage,
    );
  }

  /**
   * 🆕 Is this failure a rate-limit rejection?
   *
   * Reconciling a failed cancel costs one more REST call — exactly what must
   * NOT happen while the venue is throttling us (Binance escalates 429 into a
   * 418 IP ban, with exponentially growing duration). Those failures skip the
   * reconcile and keep the old report, so a throttled engine behaves exactly as
   * it did before this change.
   */
  /** The HTTP status the transport reported, if any (axios response shape). */
  private getExchangeErrorStatus(error: unknown): number | undefined {
    return error && typeof error === 'object' && 'response' in error
      ? (error as { response?: { status?: number } }).response?.status
      : undefined;
  }

  private isRateLimitError(error: unknown): boolean {
    const status = this.getExchangeErrorStatus(error);
    if (status === 429 || status === 418) {
      return true;
    }
    const code = Number(this.getExchangeErrorBody(error)?.code);
    return code === -1003 || code === -1015;
  }

  /**
   * What the venue told us about an order whose cancel just failed.
   *
   * `terminal` — the venue reports an end state we can adopt (FILLED, CANCELED,
   *              EXPIRED), or both the cancel and a lookup call the order
   *              unknown, which is proof enough that it is gone.
   * `live`     — the venue still holds the order. It may nonetheless carry
   *              executions we did not know about, so the caller must not read
   *              this as "nothing happened".
   * `unknown`  — nothing could be verified (no local record, an unrelated
   *              lookup failure, an unusable payload): the caller falls back to
   *              the conservative REJECTED report.
   */
  private async resolveStateAfterCancelFailure(
    exchange: IExchange,
    symbol: string,
    orderId: string,
    clientOrderId: string | undefined,
    resolvedOrder: Order | undefined,
    cancelError: unknown,
    meta: {
      exchangeName?: string;
      strategyId?: number;
      strategyType?: string;
      strategyName?: string;
    },
  ): Promise<
    | { kind: 'terminal'; order: Order }
    | { kind: 'live'; order: Order }
    | { kind: 'unknown' }
  > {
    // Without our own record of the order there is nothing trustworthy to
    // report: a synthesised side/quantity would corrupt the persisted row.
    if (!resolvedOrder) {
      return { kind: 'unknown' };
    }

    let venueOrder: Order | undefined;
    try {
      venueOrder = await exchange.getOrder(
        symbol,
        orderId,
        clientOrderId || resolvedOrder.clientOrderId,
      );
    } catch (lookupError) {
      if (!this.isUnknownOrderError(lookupError)) {
        // Unrelated failure (network, auth, throttling): we can neither prove
        // the order is dead nor read its real state → fail closed.
        this.logger.warn(
          `Could not verify the state of ${clientOrderId ?? orderId} after a ` +
            `failed cancel: ${this.formatOrderErrorMessage(lookupError)}`,
        );
        return { kind: 'unknown' };
      }
      if (!this.isUnknownOrderError(cancelError)) {
        // The lookup alone is not proof: a stale/mismatched orderId answers
        // `unknown` for an order that is still live on the venue.
        return { kind: 'unknown' };
      }
      this.logger.warn(
        `Both the cancel and a lookup report ${clientOrderId ?? orderId} as ` +
          `unknown on ${meta.exchangeName ?? exchange.name} (symbol ${symbol}, ` +
          `orderId ${orderId}) — treating the order as ${OrderStatus.CANCELED}.`,
      );
      return {
        kind: 'terminal',
        order: { ...resolvedOrder, status: OrderStatus.CANCELED, updateTime: new Date() },
      };
    }

    const status = venueOrder?.status;
    if (!status) {
      // The adapter returned a shape we do not understand → fail closed.
      return { kind: 'unknown' };
    }

    // The venue wins for every field it reports; keep our own metadata for the
    // rest. Fields the venue left undefined must not blank ours out, and the
    // identity stays ours: the order map is keyed on it, so an adapter that
    // reports a different `id`/`clientOrderId` must not fork our record in two
    // (the second entry would start from executed 0 and re-count the fill).
    const venueFields = Object.fromEntries(
      Object.entries(venueOrder).filter(
        ([key, value]) => value !== undefined && key !== 'id' && key !== 'clientOrderId',
      ),
    ) as Partial<Order>;

    const order: Order = {
      ...resolvedOrder,
      ...venueFields,
      symbol,
      status,
      // Ours first: the strategies key their state on the clientOrderId this
      // engine generated, so a venue echo (or a differently-translated value)
      // must not rename the order under them. `id` and `clientOrderId` are also
      // excluded from venueFields above, so identity stays ours throughout.
      clientOrderId:
        resolvedOrder.clientOrderId ?? clientOrderId ?? venueOrder.clientOrderId,
      exchange: meta.exchangeName ?? resolvedOrder.exchange,
      strategyId: resolvedOrder.strategyId ?? meta.strategyId,
      strategyType: resolvedOrder.strategyType ?? meta.strategyType,
      strategyName: resolvedOrder.strategyName ?? meta.strategyName,
      updateTime: venueOrder.updateTime ?? new Date(),
    };

    // A live order is reported as such rather than thrown away: the venue just
    // told us something, and a live order can already carry executions we never
    // booked (a fill hidden behind the lost terminal push). The caller decides
    // what to do with it — REJECTED is not an option for one that has traded
    // (review R6 Major).
    return this.isTerminalOrderStatus(status)
      ? { kind: 'terminal', order }
      : { kind: 'live', order };
  }

  /**
   * 🆕 Does this clientOrderId belong to the given strategy?
   * Mirrors the engine-wide order-id convention `^(E|T)<strategyId>D...`
   * (see `enrichOrderWithStrategyInfo`).
   */
  private isStrategyOwnedClientOrderId(
    clientOrderId: string,
    strategyId?: number,
  ): boolean {
    if (!clientOrderId || strategyId === undefined || strategyId === null) {
      return false;
    }
    const match = /^[ET](\d+)D/.exec(clientOrderId);
    return !!match && parseInt(match[1], 10) === strategyId;
  }

  /**
   * Execute a cancel order signal from strategy
   */
  private async executeCancelOrder(
    strategyName: string,
    symbol: string,
    signal: StrategyCancelOrderResult,
  ): Promise<void> {
    const targetSymbol = signal.symbol || symbol;

    // Find the exchange for this strategy
    const strategy = this._strategies.get(strategyName);
    const exchangeConfig = strategy?.config?.exchange;
    const strategyId = strategy?.getStrategyId?.() ?? strategy?.config?.strategyId;
    const strategyType = strategy?.strategyType;
    const userDefinedName = strategy?.strategyName || strategy?.config?.strategyName;
    const exchangeName = Array.isArray(exchangeConfig)
      ? exchangeConfig[0]
      : exchangeConfig;

    const exchange = exchangeName
      ? this._exchanges.get(exchangeName)
      : this.findExchangeForSymbol(targetSymbol);

    if (!exchange) {
      const errorMessage = `No exchange found for symbol ${targetSymbol}`;
      const rejectedOrder: Order = {
        id: signal.orderId || signal.clientOrderId || uuidv4(),
        clientOrderId: signal.clientOrderId,
        userId: this._userId,
        symbol: targetSymbol,
        side: OrderSide.BUY,
        type: OrderType.MARKET,
        quantity: new Decimal(0),
        status: OrderStatus.REJECTED,
        timeInForce: TimeInForce.GTC,
        timestamp: new Date(),
        updateTime: new Date(),
        exchange: exchangeName,
        strategyId,
        strategyType,
        strategyName: userDefinedName,
        errorMessage,
      };
      this._eventBus.emitOrderRejected({ order: rejectedOrder, timestamp: new Date() });
      this.logger.error(`Cannot cancel order: ${errorMessage}`);
      return;
    }

    let resolvedOrder: Order | undefined;
    let orderId = signal.orderId || '';

    try {
      resolvedOrder =
        !signal.orderId && signal.clientOrderId
          ? this.findOrderByClientOrderId(
              signal.clientOrderId,
              exchangeName,
              targetSymbol,
            )
          : undefined;

      orderId = signal.orderId || resolvedOrder?.id || '';

      if (!orderId && !signal.clientOrderId) {
        this.logger.warn(
          `Cancel skipped: Missing orderId/clientOrderId for ${strategyName} (${targetSymbol})`,
        );
        return;
      }

      this.logger.info(
        `🚫 Cancelling order: ${signal.orderId || signal.clientOrderId} (reason: ${signal.reason})`,
      );

      const cancelledOrder = await exchange.cancelOrder(
        targetSymbol,
        orderId,
        signal.clientOrderId || resolvedOrder?.clientOrderId,
      );

      this.logger.logStrategy('Order cancelled', {
        strategy: strategyName,
        symbol: targetSymbol,
        orderId: cancelledOrder.id,
        clientOrderId: cancelledOrder.clientOrderId,
        reason: signal.reason,
      });
    } catch (error) {
      const errorMessage = this.formatOrderErrorMessage(error);

      // 🆕 Never downgrade an order that already executed (Strategy 609).
      // Cancelling an order the exchange already filled fails with -2011; the
      // code below used to spread the stale order and force status=REJECTED,
      // which overwrote a FILLED row in the DB while keeping its
      // executedQuantity. Result: the console showed a REJECTED order that had
      // actually traded (15000 sold) and the oversell stayed invisible.
      //
      // Any order we already hold as TERMINAL is out of that lever's reach, and
      // a cancel for one we recorded as closed is a no-op anyway: re-emitting it
      // would push a duplicate notification on every retry while a duplicate
      // cancel is in flight (the sweep drops the order on the first terminal
      // event, but the engine must not depend on that to stay exactly-once).
      //
      // One deliberate trade-off: the synthesised CANCELED (the cancel *and* the
      // lookup both answered `unknown`) now also takes this early return, so it
      // will not be re-verified on a later sweep. A websocket `CANCELED → FILLED`
      // correction still reaches the order, and the alternative — asking the
      // venue forever about an order it says it does not have — is the 3183 s
      // loop this MR exists to end.
      //
      // A locally NON-terminal order is the one case where the reconcile below
      // still has something to win: if the venue actually closed it (the 633
      // shape, when the terminal push was lost) only the reconcile can prove it
      // and stop the sweep. That path must still never write REJECTED — the
      // guards after the reconcile enforce it (review R5 Minor-3, R6 Major).
      if (this.isTerminalOrderStatus(resolvedOrder?.status)) {
        // Hand over the record the engine holds NOW, not the snapshot this
        // signal was resolved against: the cancel REST call above awaits, and a
        // `CANCELED → FILLED` correction (or a growing execution) can land on the
        // websocket while it is in flight. Delivering the stale snapshot last
        // would put the strategy back on the terminal state it had already
        // outlived — a strategy that believes it never traded, which is the 609
        // direction (review R7 Major).
        const heldForGate = this.findHeldOrder(
          exchangeName ?? exchange.name,
          targetSymbol,
          resolvedOrder?.clientOrderId ?? signal.clientOrderId,
          resolvedOrder?.id ?? orderId,
        );
        // …but only when it really is the same order: a clientOrderId reused for
        // a brand-new order would otherwise make this gate hand over the new
        // order's state while answering for the terminal one (review R8 Nit).
        const closedOrder =
          heldForGate &&
          (!resolvedOrder?.id || this.sameVenueOrderId(heldForGate.id, resolvedOrder.id))
            ? heldForGate
            : resolvedOrder;
        this.logger.warn(
          `Cancel failed for an order already recorded as ${resolvedOrder?.status} — ` +
            `nothing new to report, re-delivering the recorded ` +
            `${closedOrder?.status} state: ${strategyName} ${targetSymbol} ` +
            `${closedOrder?.clientOrderId ?? signal.clientOrderId ?? orderId} — ${errorMessage}`,
        );
        // Re-delivering is what lets a strategy that missed the state drop the
        // order instead of holding it LIVE and sweeping forever — the silent half
        // of incident 633. Idempotent on the strategy side, one cheap callback
        // per retry.
        if (closedOrder) {
          void this.onAccountUpdate({
            orders: [{ ...closedOrder }],
            exchangeName: exchangeName ?? exchange.name,
          }).catch((applyError) =>
            this.logger.error(
              `Failed to re-deliver the ${closedOrder.status} state for ` +
                `${closedOrder.clientOrderId ?? orderId}`,
              applyError as Error,
            ),
          );
        }
        return;
      }

      // 🆕 A failed cancel means our local view disagrees with the venue, and
      // the blanket REJECTED verdict below is wrong in exactly the case that
      // keeps happening in production: the order is already gone from the venue
      // (its terminal event was lost to a deploy restart or a missed user-data
      // push, or the previous process already closed it). Retrying the cancel
      // can never succeed, yet the strategy held the order as LIVE forever,
      // re-issued the cancel every 60 s and pushed a misleading `Order Failed`
      // each time (incident 2026-10-01, strategy 633 — `E633D1D1790828287920`,
      // 3 183 s of repeating `Request failed with status code 400`).
      //
      // The venue is authoritative, so ask it what really happened and report
      // THAT instead (one extra REST call, on the error path only). If the
      // lookup cannot prove a terminal state — the venue still shows the order
      // as live, or the lookup itself failed for an unrelated reason — fall
      // through to the conservative REJECTED report below.
      //
      // Nothing extra while we are being throttled: the reconcile is a REST
      // call, and a 429 escalates to a 418 IP ban if we keep hammering.
      const recovery: { kind: 'terminal' | 'live' | 'unknown'; order?: Order } =
        this.isRateLimitError(error)
          ? { kind: 'unknown' }
          : await this.resolveStateAfterCancelFailure(
              exchange,
              targetSymbol,
              orderId,
              signal.clientOrderId,
              resolvedOrder,
              error,
              {
                exchangeName,
                strategyId,
                strategyType,
                strategyName: userDefinedName,
              },
            );

      if (recovery.kind === 'terminal' && recovery.order) {
        const terminalOrder = recovery.order;
        this.logger.warn(
          `Cancel failed — the venue reports ${terminalOrder.status} for this ` +
            `order (reporting that instead of REJECTED): ${strategyName} ` +
            `${targetSymbol} ${terminalOrder.clientOrderId ?? orderId} — ${errorMessage}`,
        );
        // Deliberately the SAME entry point as the websocket `orderUpdate`
        // listener: order map, execution/trade detection, event bus and
        // strategy notification all have to happen exactly once, so a state
        // recovered from the venue can never double-count a fill that a late
        // websocket push reports too.
        //
        // Best effort: reporting the recovered state must never fail the cancel
        // path (a strategy callback that throws would otherwise surface as an
        // unhandled rejection of the cancel, hiding the original error).
        let applied = false;
        try {
          await this.applyExchangeOrderUpdate(
            exchangeName ?? exchange.name,
            targetSymbol,
            terminalOrder,
          );
          applied = true;
        } catch (applyError) {
          this.logger.error(
            `Failed to apply the recovered ${terminalOrder.status} state for ` +
              `${terminalOrder.clientOrderId ?? orderId}`,
            applyError as Error,
          );
          // Fail closed: the order-map write is the part that matters, so treat
          // the state as reported only when it landed there (a throw from a
          // later stage — an event listener — must not undo it). If nothing
          // landed we fall through to the conservative REJECTED report below
          // rather than going silent: the strategy must never be left holding
          // an order we could not actually verify.
          const landed = this.findHeldOrder(
            exchangeName ?? exchange.name,
            targetSymbol,
            terminalOrder.clientOrderId,
            terminalOrder.id,
          );
          applied = !!landed && this.isTerminalOrderStatus(landed.status);
        }
        if (applied) {
          // Reported — though not necessarily with the state we just adopted: a
          // record that is already terminal absorbs this one as a stale update
          // (a FILLED the venue never quantified swallows the recovered
          // CANCELED, and a fill that landed while the lookup was in flight wins
          // the same way). A strategy that never hears a terminal state keeps
          // sweeping forever, so hand over the record the engine actually
          // holds before stopping (review R6 Minor-2).
          const held = this.findHeldOrder(
            exchangeName ?? exchange.name,
            targetSymbol,
            terminalOrder.clientOrderId,
            terminalOrder.id,
          );
          if (held && held.status !== terminalOrder.status) {
            this.logger.warn(
              `The recovered ${terminalOrder.status} state was absorbed by an ` +
                `existing ${held.status} record — handing that one over instead: ` +
                `${strategyName} ${targetSymbol} ${held.clientOrderId ?? orderId}`,
            );
            void this.onAccountUpdate({
              orders: [{ ...held }],
              exchangeName: exchangeName ?? exchange.name,
            }).catch((applyError) =>
              this.logger.error(
                `Failed to re-deliver the held ${held.status} state for ` +
                  `${held.clientOrderId ?? orderId}`,
                applyError as Error,
              ),
            );
          }
          return;
        }
      }

      // The venue said the order is still working AND that it has traded: adopting
      // that state is the whole point of asking — its executions must be booked
      // (the monotonic guards keep them from double-counting), and writing
      // REJECTED over inventory the venue says we own is precisely the lie this
      // path exists to stop (609 red line, review R6 Major). A live order with
      // nothing executed still takes the conservative report below.
      if (
        recovery.kind === 'live' &&
        recovery.order &&
        this.isOrderAlreadyExecuted(recovery.order)
      ) {
        this.logger.warn(
          `Cancel failed and the venue still holds this order with executions — ` +
            `adopting its ${recovery.order.status} state instead of writing ` +
            `REJECTED: ${strategyName} ${targetSymbol} ` +
            `${recovery.order.clientOrderId ?? orderId} — ${errorMessage}`,
        );
        let landed = false;
        try {
          await this.applyExchangeOrderUpdate(
            exchangeName ?? exchange.name,
            targetSymbol,
            recovery.order,
          );
          landed = true;
        } catch (applyError) {
          this.logger.error(
            `Failed to apply the live state of ${recovery.order.clientOrderId ?? orderId}`,
            applyError as Error,
          );
          // What has to land is the execution the venue reported, not merely
          // "a record exists": the map entry existed before this call, so
          // checking for its presence would always succeed (review R8 Minor).
          const heldNow = this.findHeldOrder(
            exchangeName ?? exchange.name,
            targetSymbol,
            recovery.order.clientOrderId,
            recovery.order.id,
          );
          landed =
            (heldNow?.executedQuantity ?? new Decimal(0)).gte(
              recovery.order.executedQuantity ?? new Decimal(0),
            ) &&
            (heldNow?.cummulativeQuoteQuantity ?? new Decimal(0)).gte(
              recovery.order.cummulativeQuoteQuantity ?? new Decimal(0),
            );
        }
        if (!landed) {
          // Never REJECTED over an execution the venue just confirmed: hand its
          // own answer to the strategy and leave the map for the next update to
          // correct.
          this.logger.warn(
            `Could not record the live ${recovery.order.status} state of ` +
              `${recovery.order.clientOrderId ?? orderId} — re-delivering the ` +
              `venue's answer instead.`,
          );
          void this.onAccountUpdate({
            orders: [{ ...recovery.order }],
            exchangeName: exchangeName ?? exchange.name,
          }).catch((applyError) =>
            this.logger.error(
              `Failed to re-deliver the venue's ${recovery.order?.status} state for ` +
                `${recovery.order?.clientOrderId ?? orderId}`,
              applyError as Error,
            ),
          );
        }
        return;
      }

      // Every judgement below is made on a snapshot read BEFORE the venue
      // lookup, and that lookup awaits: a late websocket push can land in
      // between and replace the map entry with a filled one. Re-read the record
      // the engine holds now — the same source the `applied` check above trusts
      // — so a fill that arrived during the await cannot be reported REJECTED
      // (review R6 Major).
      const freshOrder =
        this.findHeldOrder(
          exchangeName ?? exchange.name,
          targetSymbol,
          resolvedOrder?.clientOrderId ?? signal.clientOrderId,
          resolvedOrder?.id ?? orderId,
        ) ?? resolvedOrder;

      // 609 red line, second door: whatever the reconcile could not prove, an
      // order that has real executions must never be downgraded to REJECTED —
      // writing REJECTED over a partially filled order both hides inventory we
      // own and is the lie this whole path exists to stop. Keep what we hold,
      // re-deliver it so the strategy at least sees the latest truth, and say
      // why in the log.
      //
      // (Known follow-up, deliberately deferred: when the venue reports FILLED
      // without execution numbers we report FILLED as-is, so the strategy may
      // hear FILLED once without a quantity and again when the websocket push
      // carries the fill. Deriving `executedQuantity = quantity` here would fix
      // that display, but it is a derivation the whole adapter surface would
      // inherit, so it wants its own review — not a rider on this fix.)
      const heldIsAuthoritative =
        this.isTerminalOrderStatus(freshOrder?.status) ||
        this.isOrderAlreadyExecuted(freshOrder);
      // The venue's own verdict counts too, even when it could not be written to
      // the order map: the apply can fail before the write, and REJECTED over an
      // order the venue reports as traded is exactly the lie this path exists to
      // stop (review R8 Minor).
      const venueVerdict =
        recovery.order !== undefined &&
        (this.isTerminalOrderStatus(recovery.order.status) ||
          this.isOrderAlreadyExecuted(recovery.order));

      if (heldIsAuthoritative || venueVerdict) {
        const authoritative = (
          heldIsAuthoritative ? freshOrder : recovery.order
        ) as Order;
        this.logger.warn(
          `Cancel failed and the venue would not confirm a terminal state — ` +
            `keeping the recorded ${authoritative.status} rather than writing ` +
            `REJECTED over it: ${strategyName} ${targetSymbol} ` +
            `${authoritative.clientOrderId ?? signal.clientOrderId ?? orderId} — ${errorMessage}`,
        );
        void this.onAccountUpdate({
          orders: [{ ...authoritative }],
          exchangeName: exchangeName ?? exchange.name,
        }).catch((applyError) =>
          this.logger.error(
            `Failed to re-deliver the ${authoritative.status} state for ` +
              `${authoritative.clientOrderId ?? orderId}`,
            applyError as Error,
          ),
        );
        return;
      }

      const rejectedOrder: Order = {
        ...(resolvedOrder ?? {
          id: orderId || signal.clientOrderId || uuidv4(),
          clientOrderId: signal.clientOrderId,
          userId: this._userId,
          symbol: targetSymbol,
          side: OrderSide.BUY,
          type: OrderType.MARKET,
          quantity: new Decimal(0),
          status: OrderStatus.REJECTED,
          timeInForce: TimeInForce.GTC,
          timestamp: new Date(),
          exchange: exchangeName,
          strategyId,
          strategyType,
          strategyName: userDefinedName,
        }),
        status: OrderStatus.REJECTED,
        updateTime: new Date(),
        errorMessage,
      };
      this._eventBus.emitOrderRejected({ order: rejectedOrder, timestamp: new Date() });
      this.logger.error(`Failed to cancel order for ${strategyName}`, error as Error, {
        symbol: targetSymbol,
        orderId: signal.orderId,
        clientOrderId: signal.clientOrderId,
      });
    }
  }

  /**
   * Execute an update order signal from strategy (cancel + replace)
   */
  private async executeUpdateOrder(
    strategyName: string,
    symbol: string,
    signal: StrategyUpdateOrderResult,
  ): Promise<void> {
    const targetSymbol = signal.symbol || symbol;

    const strategy = this._strategies.get(strategyName);
    const exchangeConfig = strategy?.config?.exchange;
    const strategyId = strategy?.getStrategyId?.() ?? strategy?.config?.strategyId;
    const strategyType = strategy?.strategyType;
    const userDefinedName = strategy?.strategyName || strategy?.config?.strategyName;
    const exchangeName = Array.isArray(exchangeConfig)
      ? exchangeConfig[0]
      : exchangeConfig;

    const exchange = exchangeName
      ? this._exchanges.get(exchangeName)
      : this.findExchangeForSymbol(targetSymbol);

    if (!exchange) {
      const errorMessage = `No exchange found for symbol ${targetSymbol}`;
      const rejectedOrder: Order = {
        id: signal.newClientOrderId || signal.clientOrderId || uuidv4(),
        clientOrderId: signal.newClientOrderId || signal.clientOrderId,
        userId: this._userId,
        symbol: targetSymbol,
        side: OrderSide.BUY,
        type: OrderType.MARKET,
        quantity: new Decimal(0),
        status: OrderStatus.REJECTED,
        timeInForce: TimeInForce.GTC,
        timestamp: new Date(),
        updateTime: new Date(),
        exchange: exchangeName,
        strategyId,
        strategyType,
        strategyName: userDefinedName,
        errorMessage,
      };
      this._eventBus.emitOrderRejected({ order: rejectedOrder, timestamp: new Date() });
      this.logger.error(`Cannot update order: ${errorMessage}`);
      return;
    }

    let resolvedOrder: Order | undefined;
    let existingOrder: Order | null = null;

    try {
      resolvedOrder = this.findOrderByClientOrderId(
        signal.clientOrderId,
        exchangeName,
        targetSymbol,
      );

      existingOrder = await exchange.getOrder(
        targetSymbol,
        resolvedOrder?.id || '',
        signal.clientOrderId,
      );

      if (!existingOrder) {
        this.logger.warn(
          `Update skipped: existing order not found for ${signal.clientOrderId}`,
        );
        return;
      }

      const nextQuantity = signal.quantity;
      const nextPrice = signal.price ?? existingOrder.price;

      this.logger.info(
        `🛠️ Updating order (cancel+replace): ${signal.clientOrderId} -> ${signal.newClientOrderId}`,
      );

      await exchange.cancelOrder(
        targetSymbol,
        resolvedOrder?.id || '',
        signal.clientOrderId,
      );

      const orderType = nextPrice ? OrderType.LIMIT : OrderType.MARKET;
      const side = existingOrder.side;

      const executedOrder = await this.executeOrder({
        strategyName,
        symbol: targetSymbol,
        side,
        quantity: nextQuantity,
        type: orderType,
        price: nextPrice,
        clientOrderId: signal.newClientOrderId,
        // 🆕 Keep the exit-intent protection across cancel+replace
        // (Strategy 609: without this, every TP refresh dropped the guard).
        // What arms the reconciliation is `dedupeExit` below; `reduceOnly` is
        // merely forwarded unchanged if some caller still sets it (no strategy
        // does since 2026-10-01).
        reduceOnly: signal.reduceOnly,
        dedupeExit: this.isExitIntent(signal.metadata),
      });

      this.logger.logStrategy('Order updated', {
        strategy: strategyName,
        symbol: targetSymbol,
        orderId: executedOrder.id,
        oldClientOrderId: signal.clientOrderId,
        newClientOrderId: signal.newClientOrderId,
        quantity: nextQuantity.toNumber(),
        price: nextPrice?.toNumber(),
        reason: signal.reason,
      });

      if (strategy && strategy.onOrderCreated) {
        await strategy.onOrderCreated(executedOrder);
      }
    } catch (error) {
      const errorMessage = this.formatOrderErrorMessage(error);
      const baseOrder = existingOrder ?? resolvedOrder;
      const rejectedOrder: Order = {
        ...(baseOrder ?? {
          id: signal.newClientOrderId || signal.clientOrderId || uuidv4(),
          clientOrderId: signal.newClientOrderId || signal.clientOrderId,
          userId: this._userId,
          symbol: targetSymbol,
          side: OrderSide.BUY,
          type: OrderType.MARKET,
          quantity: new Decimal(0),
          status: OrderStatus.REJECTED,
          timeInForce: TimeInForce.GTC,
          timestamp: new Date(),
          exchange: exchangeName,
          strategyId,
          strategyType,
          strategyName: userDefinedName,
        }),
        status: OrderStatus.REJECTED,
        updateTime: new Date(),
        errorMessage,
      };
      this._eventBus.emitOrderRejected({ order: rejectedOrder, timestamp: new Date() });
      this.logger.error(`Failed to update order for ${strategyName}`, error as Error, {
        symbol: targetSymbol,
        clientOrderId: signal.clientOrderId,
        newClientOrderId: signal.newClientOrderId,
      });
      // Feed the rejected replacement order back to the strategy so it can
      // clear tpClientOrderId and re-attempt TP placement. Without this, the
      // strategy holds tpClientOrderId pointing to a rejected order forever →
      // no TP → unlimited market risk.
      rejectedOrder.clientOrderId = signal.newClientOrderId;
      this.onAccountUpdate({
        orders: [rejectedOrder],
        exchangeName: exchangeName ?? undefined,
      });
    }
  }

  private async executeStrategySignal(
    strategyName: string,
    symbol: string,
    signal: StrategyResult,
  ): Promise<void> {
    // Only process order results (buy/sell)
    if (!isOrderResult(signal) || !signal.quantity) {
      return;
    }

    try {
      // 🆕 Determine order type, respecting signal's requested type if present
      const orderType =
        signal.type || (signal.price ? OrderType.LIMIT : OrderType.MARKET);
      const side = signal.action === 'buy' ? OrderSide.BUY : OrderSide.SELL;

      // Extract clientOrderId from signal
      const clientOrderId = signal.clientOrderId;

      const executedOrder = await this.executeOrder({
        strategyName,
        symbol,
        side,
        quantity: signal.quantity,
        type: orderType,
        price: signal.price,
        stopPrice: signal.stopPrice, // 🆕 Pass stopPrice from signal
        tradeMode: signal.tradeMode,
        leverage: signal.leverage,
        clientOrderId,
        reduceOnly: signal.reduceOnly, // 🆕 Exchange-level risk-reducing flag (unused since 2026-10-01)
        // 🆕 Duplicate-exit reconciliation is keyed on exit intent, not on the
        // `reduceOnly` flag (Strategy 631, 2026-10-01).
        dedupeExit: this.isExitIntent(signal.metadata),
      });

      this.logger.logStrategy('Executed signal', {
        strategy: strategyName,
        symbol,
        action: signal.action,
        quantity: signal.quantity.toNumber(),
        price: signal.price?.toNumber(),
        confidence: signal.confidence,
        reason: signal.reason,
        clientOrderId: executedOrder.clientOrderId,
      });

      // Notify strategy that order was created from its signal
      const strategy = this._strategies.get(strategyName);
      if (strategy && strategy.onOrderCreated) {
        await strategy.onOrderCreated(executedOrder);
      }
    } catch (error) {
      this.logger.error(
        `Failed to execute strategy signal for ${strategyName}`,
        error as Error,
        {
          symbol,
          signal,
        },
      );
    }
  }

  private enrichOrderWithStrategyInfo(order: Order): void {
    // If we already have strategy info, just verify user
    if (order.strategyId && order.strategyName) {
      if (!order.userId && this._userId) {
        order.userId = this._userId;
      }
      return;
    }

    // Try to extract strategy ID from clientOrderId
    let strategyId: number | undefined;

    if (order.clientOrderId) {
      // Pattern 1: BaseStrategy format E{id}D... or T{id}D...
      const baseMatch = order.clientOrderId.match(/^[ET](\d+)D/);
      if (baseMatch) {
        strategyId = parseInt(baseMatch[1], 10);
      } else {
        // Pattern 2: TradingEngine default s{id}{timestamp}
        // Note: this is less reliable if id is not distinct from timestamp, but s prefix helps
        const engineMatch = order.clientOrderId.match(/^s(\d+)\d{10,}/); // Assuming timestamp is at least 10 digits
        if (engineMatch) {
          strategyId = parseInt(engineMatch[1], 10);
        } else {
          // Pattern 3: StrategyManager format strategy_{id}_
          const mgrMatch = order.clientOrderId.match(/^strategy_(\d+)_/);
          if (mgrMatch) {
            strategyId = parseInt(mgrMatch[1], 10);
          }
        }
      }
    }

    if (!strategyId) {
      // Fallback: If no clientOrderId pattern matches, try to find strategy managing this symbol
      // This is less precise as multiple strategies might trade same symbol
      return;
    }

    // Look up strategy by ID
    // Iterate manually since we don't have an ID->Strategy map
    for (const [name, strategy] of this._strategies) {
      const configId = strategy.config?.strategyId;
      const strategyIdFromGetter = strategy.getStrategyId?.();
      const contextId = strategy.context?.strategyId;

      const currentStrategyId = strategyIdFromGetter ?? configId ?? contextId;

      if (currentStrategyId === strategyId) {
        // Found the strategy!
        order.strategyId = strategyId;
        order.strategyName =
          strategy.strategyName || strategy.config?.strategyName || name;
        order.strategyType = strategy.strategyType || strategy.constructor.name;

        // Set userId from strategy if available, otherwise use engine's userId
        const strategyUserId = strategy.context?.userId || strategy.config?.userId;
        if (!order.userId) {
          order.userId = strategyUserId || this._userId;
        }

        this.logger.debug(
          `🔍 Enriched order ${order.id} with strategy info: ${order.strategyName} (ID: ${strategyId})`,
        );
        return;
      }
    }
  }

  private getSymbolInfoCacheKey(exchangeName: string, symbol: string): string {
    return `${exchangeName}:${symbol}`;
  }

  private async getSymbolInfoWithCache(
    exchange: IExchange,
    symbol: string,
    options: { forceRefresh?: boolean } = {},
  ): Promise<SymbolInfo> {
    const cacheKey = this.getSymbolInfoCacheKey(exchange.name, symbol);
    const cached = this._symbolInfoCache.get(cacheKey);
    const now = Date.now();

    if (
      cached &&
      !options.forceRefresh &&
      now - cached.fetchedAt < this._symbolInfoTtlMs
    ) {
      return cached.info;
    }

    try {
      const info = await exchange.getSymbolInfo(symbol);
      this._symbolInfoCache.set(cacheKey, { info, fetchedAt: now });
      return info;
    } catch (error) {
      if (cached) {
        this.logger.warn(
          `Failed to refresh symbol info for ${symbol} on ${exchange.name}, using cached value`,
        );
        return cached.info;
      }
      throw error;
    }
  }

  /**
   * Pre-fill _emittedOrderCreated with existing open orders from the database.
   *
   * After a restart/redeploy, the in-memory _emittedOrderCreated Set is empty.
   * When the exchange WS reconnects, it re-pushes all currently open orders as
   * `orderUpdate` events. Without this pre-fill, the engine treats each as
   * "new" and emits OrderCreated → OrderTracker sends a duplicate "Order Placed"
   * push notification for every open order on every restart.
   *
   * This method queries all non-terminal orders (NEW + PARTIALLY_FILLED) from
   * the DB and adds their clientOrderId (or id) to _emittedOrderCreated, so
   * WS-replayed orders are correctly recognized as already-known.
   */
  private async preFillEmittedOrderCreated(): Promise<void> {
    if (this._emittedOrderCreatedPreFilled) return;
    this._emittedOrderCreatedPreFilled = true; // set first to prevent re-entry
    try {
      if (!this._dataManager?.getOrders) {
        return;
      }

      // Fetch only non-terminal (open) orders: NEW + PARTIALLY_FILLED.
      // These are the orders the exchange WS will re-push on reconnect.
      // Terminal orders (FILLED/CANCELED/REJECTED/EXPIRED) are irrelevant —
      // they won't be replayed and can never emit OrderCreated again.
      // Open-order count is typically small (tens at most), so memory is
      // negligible: each entry is just a string key in a Set.
      const openOrders = await this._dataManager.getOrders({
        userId: this._userId,
        status: 'OPEN' as string,
        page: 1,
        pageSize: 1000,
      });

      for (const order of openOrders) {
        const emittedKey = order.clientOrderId || order.id;
        if (emittedKey) {
          this._emittedOrderCreated.add(emittedKey);
        }
      }

      this.logger.info(
        `📦 Pre-filled _emittedOrderCreated with ${openOrders.length} open orders from DB`,
      );
    } catch (error) {
      // Non-fatal: if the DB query fails, we just won't pre-fill. This may
      // cause one-time re-notification of open orders, but the engine will
      // still function correctly.
      this.logger.warn(
        `Failed to pre-fill _emittedOrderCreated: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async prefetchSymbolInfoForStrategy(
    strategyName: string,
    strategy: IStrategy,
  ): Promise<void> {
    const symbol = strategy.context?.symbol;
    if (!symbol) {
      this.logger.warn(
        `⚠️  [SYMBOL_INFO] Strategy ${strategyName} has no symbol, skip prefetch`,
      );
      return;
    }

    const exchangeConfig = strategy?.config?.exchange ?? strategy.context?.exchange;
    const exchanges = this.getTargetExchanges(exchangeConfig);
    if (exchanges.length === 0) {
      this.logger.warn(
        `⚠️  [SYMBOL_INFO] No exchanges available for strategy ${strategyName}`,
      );
      return;
    }

    for (const exchange of exchanges) {
      try {
        await this.getSymbolInfoWithCache(exchange, symbol, { forceRefresh: true });
      } catch (error) {
        this.logger.warn(
          `⚠️  [SYMBOL_INFO] Failed to prefetch ${symbol} from ${exchange.name} for ${strategyName}:`,
          {
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }
  }

  private findExchangeForSymbol(_symbol: string): IExchange | undefined {
    // Simple implementation - return the first connected exchange
    // In a real implementation, you might want to choose based on:
    // - Symbol availability
    // - Liquidity
    // - Fees
    // - Latency
    for (const exchange of this._exchanges.values()) {
      if (exchange.isConnected) {
        return exchange;
      }
    }
    return undefined;
  }

  private setupEventListeners(): void {
    // Listen for risk events
    this._eventBus.onRiskLimitExceeded(async (data) => {
      this.logger.logRisk(
        'Risk limit exceeded',
        data as unknown as Record<string, unknown>,
      );

      if (data.severity === 'critical') {
        this.logger.warn('Critical risk limit exceeded, stopping engine');
        await this.stop();
      }
    });

    // Listen for emergency stop events
    this._eventBus.onEmergencyStop(async (data) => {
      this.logger.warn(`Emergency stop triggered: ${data.reason}`);
      await this.stop();
    });
  }

  /**
   * The order record this engine holds for a venue order.
   *
   * The cancel path's lookups all go through here — the clientOrderId the
   * strategies key on first, then the venue id, normalised and pinned to the
   * symbol, because the order map is bucketed per exchange and a bare id match
   * could otherwise pick up another market's record (review R7 Minor: three call
   * sites had already drifted apart).
   *
   * The clientOrderId pass deliberately does NOT pin the symbol — the key is
   * generated by this engine and is globally unique, and matching on it alone is
   * what lets a cancel that names the wrong symbol still find and update its
   * order. Do not "make it consistent" by adding a symbol check there.
   *
   * `applyExchangeOrderUpdate` keeps an inline variant of this two-pass match
   * because it needs the array index, not just the record. **If that matching
   * ever changes, change it in both places** — two implementations of one rule is
   * exactly the drift both reviews flagged.
   */
  private findHeldOrder(
    exchangeName: string,
    symbol: string,
    clientOrderId: string | undefined,
    orderId: string | undefined,
  ): Order | undefined {
    const orders = this._orders.get(exchangeName) ?? [];
    if (clientOrderId) {
      const byClientOrderId = orders.find((o) => o.clientOrderId === clientOrderId);
      if (byClientOrderId) {
        return byClientOrderId;
      }
    }
    if (!orderId) {
      return undefined;
    }
    return orders.find(
      (o) => this.sameVenueOrderId(o.id, orderId) && (o.symbol === symbol || !o.symbol),
    );
  }

  /**
   * Are these two venue ids the SAME order?
   *
   * Adapters are not consistent about the id they echo: the engine stores the
   * venue's own number as `order-748929329`, while a raw user-data push for that
   * same order arrives as `748929329`. Comparing the strings literally made the
   * engine read one order as two — a late non-terminal push for a closed order
   * then looked like a brand new order, spliced the record and let the next
   * reconcile book the whole fill again (the 609 double-count, review R5 Major).
   *
   * So one order number wrapped as `prefix + digits` is normalised to those
   * digits: `order-748929329` and `748929329` are one order. This assumes the
   * venue's own order number is unique within the venue — every adapter we ship
   * stores exactly that number (some with a prefix), so a numeric body must never
   * become the discriminator: an adapter that encoded a type in the id
   * (`S-123` vs `F-123`) would be merged by this rule. Anything else (a
   * uuid, a composite id, digits in the middle) is compared literally, so two
   * ids that merely share digits — `1-23` against `12-3`, `v2-0001` against
   * `20001` — are never merged. The order map is bucketed per exchange, so ids
   * never cross venues either.
   */
  private sameVenueOrderId(a?: string, b?: string): boolean {
    if (!a || !b) {
      return false;
    }
    if (a === b) {
      return true;
    }
    const digitsA = /^\D*(\d+)$/.exec(a);
    const digitsB = /^\D*(\d+)$/.exec(b);
    if (digitsA === null || digitsB === null) {
      return false;
    }
    // The same number written with different padding is still one order:
    // `00748929329` and `748929329` must not start a second record. Compared as
    // strings on purpose — venue order numbers can exceed Number.MAX_SAFE_INTEGER
    // (Binance is already at 19 digits), so never "simplify" this to Number().
    const trimZeros = (digits: string) => digits.replace(/^0+(?=\d)/, '');
    return trimZeros(digitsA[1]) === trimZeros(digitsB[1]);
  }

  /**
   * 🆕 Is this status final for the order? Terminal orders can only be updated
   * by an equally terminal state, and their status event is never re-fired for
   * a duplicate update that brings no new execution.
   */
  private isTerminalOrderStatus(status?: OrderStatus): boolean {
    return (
      status === OrderStatus.FILLED ||
      status === OrderStatus.CANCELED ||
      status === OrderStatus.EXPIRED
    );
  }

  /**
   * Apply an order update to the engine's own state, then tell everyone who
   * cares about it: the order map (which feeds execution/trade detection), the
   * event bus, the strategies and the account snapshot.
   *
   * 🆕 This is the ONE place where a learned order state is booked, so it is
   * shared by the websocket `orderUpdate` listener and by every path that
   * learns an order's real state by other means — today
   * `executeCancelOrder`, which recovers the terminal state of an order whose
   * push was lost (see `resolveStateAfterCancelFailure`).
   * Booking it anywhere else means a late websocket push for the same order
   * gets processed twice: the execution delta below is only recalculated
   * correctly because the order map is updated here, first.
   */
  private async applyExchangeOrderUpdate(
    exchangeName: string,
    symbol: string,
    order: Order,
  ): Promise<void> {
    // 🆕 Enrich order with strategy info BEFORE any processing/logging
    this.enrichOrderWithStrategyInfo(order);

    this.logger.info(`📦 Order Update from ${exchangeName}: ${symbol} - ${order.status}`);

    // Store/update order in the orders map
    const orders = this._orders.get(exchangeName) || [];
    // clientOrderId is the identity the strategies (and the cancel signal) key
    // on, so prefer it when present: an adapter reporting a different `id` for
    // the same order must not fork our record into a second entry, which would
    // start from executed 0 and re-count the whole fill as a fresh trade.
    // Two explicit passes rather than one OR: if a legacy fork ever left two
    // records matching on different fields, the clientOrderId (what the
    // strategies key on) has to win, not whichever sits first in the array.
    let existingOrderIndex = order.clientOrderId
      ? orders.findIndex((o) => o.clientOrderId === order.clientOrderId)
      : -1;
    if (existingOrderIndex < 0) {
      // Normalised, so an adapter that wraps the id it echoed (`order-748929329`
      // for `748929329`) matches the record we hold instead of looking like a
      // second order. Pinned to the symbol because this map is bucketed per
      // exchange: two different symbols can share a numeric body, and merging
      // those would attach one market's fill to the other (review R6 Minor).
      existingOrderIndex = orders.findIndex(
        (o) =>
          this.sameVenueOrderId(o.id, order.id) && (o.symbol === symbol || !o.symbol),
      );
    }

    // 🆕 Calculate execution delta for partial fills
    let trade: Trade | undefined;
    let previousExecutedQty = new Decimal(0);
    let previousCumQuoteQty = new Decimal(0);
    let previousCommission = new Decimal(0);
    let previousStatus: OrderStatus | undefined;

    if (existingOrderIndex >= 0) {
      const existingOrder = orders[existingOrderIndex];

      // 🆕 A different venue id under the same clientOrderId is a NEW order, not
      // an update: venues let the key be reused once the old order closed, and
      // silently folding the new order into the old record would hide it (its
      // fills would never be booked). Only an order we already saw end is
      // superseded this way.
      // …and narrow on purpose. Three conditions, because reading one order as
      // two is the expensive mistake (609 double-count) while the reverse only
      // hides a theoretical reuse:
      //  1. the ids must be genuinely different ONCE NORMALISED — `order-748929329`
      //     and `748929329` are one order, and folding that into a "new order"
      //     is how a late push re-counts a fill (R5 Major);
      //  2. the update must be manifestly LIVE — an order we already saw end can
      //     never revive, so a terminal push under a foreign id is far more
      //     likely to be the adapter's own formatting for the SAME order.
      //  3. it must be a CLEARLY FRESH order — `NEW` with nothing executed.
      //     Anything less still reads as an update, and this is what keeps the
      //     fold honest across pushes: once an order is folded into the record
      //     our id replaces the venue's, so a later non-terminal push (an
      //     out-of-order `PARTIALLY_FILLED` for that new order) would otherwise
      //     look like a reuse, splice away a record that already booked fills
      //     and book them again on the next reconcile (R5 Minor).
      // The deliberate trade-off: a new order whose first visible update is
      // already terminal, or already partly filled, is read as an update of the
      // expired record. Its fills are then measured against the old record, so
      // it is under-counted — and if it executed LESS than the old record did,
      // the whole update is a regression the monotonic guard discards, i.e. it
      // goes unbooked entirely. Both are the safe direction, and both need the
      // key to be globally unique (true for the engine's `E<sid>D<ts>`, which is
      // generated here and cannot be supplied by a caller), which is why the
      // reuse branch exists rather than assuming it.
      const isKeyReuse =
        !!order.id &&
        !!existingOrder.id &&
        !this.sameVenueOrderId(order.id, existingOrder.id) &&
        this.isTerminalOrderStatus(existingOrder.status) &&
        order.status === OrderStatus.NEW &&
        (!order.executedQuantity || order.executedQuantity.eq(0));

      if (isKeyReuse) {
        this.logger.warn(
          `Order ${order.id} reuses the clientOrderId of the ended order ` +
            `${existingOrder.id} (${order.clientOrderId}) — tracking it as a new order.`,
        );
        // Drop the ended record so the reused key maps to exactly one order,
        // and start a fresh one (delta and events as for any new order). The
        // key's "already emitted OrderCreated" marker goes with it, otherwise
        // the new order would never be announced.
        orders.splice(existingOrderIndex, 1);
        existingOrderIndex = -1;
        this._emittedOrderCreated.delete(order.clientOrderId || order.id);
        orders.push(order);
      } else {
        // Both a genuine adapter echo and the deliberate trade-off above land
        // here, and they are indistinguishable after the fact unless we say so:
        // the reuse path warns, so this path must too (kimi R5 Nit).
        if (
          !!order.id &&
          !!existingOrder.id &&
          !this.sameVenueOrderId(order.id, existingOrder.id)
        ) {
          this.logger.warn(
            `Update for ${order.clientOrderId ?? existingOrder.id} carries a different ` +
              `venue id (${order.id} vs the recorded ${existingOrder.id}) — treating it ` +
              `as an update of the recorded order.`,
          );
        }
        previousStatus = existingOrder.status;
        previousExecutedQty = existingOrder.executedQuantity || new Decimal(0);
        previousCumQuoteQty = existingOrder.cummulativeQuoteQuantity || new Decimal(0);
        previousCommission = existingOrder.commission || new Decimal(0);

        // 🆕 Drop an update that would roll this order back. A terminal order is
        // final (a websocket push racing the recovery path's REST snapshot, an
        // adapter replaying NEW after FILLED, an older snapshot landing late —
        // the 609 oversell shape), FILLED is absorbing (only a CANCELED → FILLED
        // correction is still allowed), and execution only ever grows (rolling
        // it back makes the next update re-count the difference as a fresh fill,
        // at the wrong price and fee). Each of these is dropped whole: a
        // half-applied stale snapshot is worse than not applying it at all.
        const previousIsTerminal = this.isTerminalOrderStatus(previousStatus);
        const incomingIsTerminal = this.isTerminalOrderStatus(order.status);
        // The venue's terminal wording is authoritative and must land even when
        // the numbers travelling with it look like a rollback (an adapter that
        // defaults a missing executedQuantity to 0, a snapshot taken inside a
        // settlement window, a retention-truncated order). Monotonicity is our
        // own bookkeeping discipline, so it clamps the numbers rather than
        // vetoing the status: dropping the whole update left the engine holding a
        // live order forever, which is the 3183 s sweep this MR exists to end
        // (review R7 Major).
        // A terminal *transition* is what has to land — FILLED after CANCELED
        // included, even when the correction carries the same or fewer
        // executions (an adapter that defaults a missing executedQuantity to 0 is
        // exactly the case that produced this rule). A repeat of a status already
        // recorded is not a transition, so a stale same-status snapshot is still
        // dropped whole below.
        const terminalTransition = incomingIsTerminal && previousStatus !== order.status;
        const isStale =
          (previousIsTerminal && !incomingIsTerminal) ||
          // FILLED absorbs anything but another FILLED: the clause that follows
          // is the mark of what is allowed THROUGH, not a description of what
          // gets discarded. A filling update for an already-filled order is how a
          // tail execution (or a fill the recovery could not read) gets booked,
          // so only that shape must be applied — the duplicate-emit guard further
          // down keeps it quiet when it carries no new execution.
          (previousStatus === OrderStatus.FILLED &&
            order.status !== OrderStatus.FILLED) ||
          (!terminalTransition &&
            order.executedQuantity !== undefined &&
            order.executedQuantity.lt(previousExecutedQty));

        if (isStale) {
          if (
            previousIsTerminal &&
            !this.isTerminalOrderStatus(order.status) &&
            order.executedQuantity !== undefined &&
            order.executedQuantity.gt(previousExecutedQty)
          ) {
            // Contradictory rather than impossible: our own synthesised CANCELED
            // can be outlived by a real execution. The terminal state still
            // stands — only the venue's own terminal correction revises it — but
            // dropping executions silently is what made incident 633 hard to read
            // (review R8 Minor, follow-up).
            this.logger.warn(
              `Dropping a ${order.status} update for ${order.clientOrderId ?? order.id} that ` +
                `reports more executions (${order.executedQuantity}) than the recorded ` +
                `${previousStatus} (${previousExecutedQty}) — the terminal state stands.`,
            );
          }
          this.logger.warn(
            `Ignoring a stale ${order.status} update (executed ` +
              `${order.executedQuantity ?? '?'}) for the order recorded as ` +
              `${previousStatus} (executed ${previousExecutedQty}): ` +
              `${order.clientOrderId ?? order.id}`,
          );
          return;
        }

        // 🆕 Safety: If incoming order has undefined executedQuantity, inherit from previous state
        // This prevents regression to 0 which would cause double-counting on next fill
        if (order.executedQuantity === undefined) {
          order.executedQuantity = previousExecutedQty;
        }
        // A terminal state that arrived with numbers below what we already hold
        // keeps its status but not the rollback: the amounts we booked are real
        // executions, and taking them back would make the next update re-count
        // them as a fresh fill, at the wrong price and fee.
        if (
          order.executedQuantity !== undefined &&
          order.executedQuantity.lt(previousExecutedQty)
        ) {
          this.logger.warn(
            `The ${order.status} update for ${order.clientOrderId ?? order.id} reports ` +
              `executed ${order.executedQuantity} below the recorded ` +
              `${previousExecutedQty} — keeping the higher figure and the status.`,
          );
          order.executedQuantity = previousExecutedQty;
        }
        // Inherit cumulative quote qty if missing too
        if (order.cummulativeQuoteQuantity === undefined) {
          order.cummulativeQuoteQuantity = previousCumQuoteQty;
        }
        if (
          order.cummulativeQuoteQuantity !== undefined &&
          order.cummulativeQuoteQuantity.lt(previousCumQuoteQty)
        ) {
          this.logger.warn(
            `The ${order.status} update for ${order.clientOrderId ?? order.id} reports ` +
              `a cumulative quote of ${order.cummulativeQuoteQuantity} below the recorded ` +
              `${previousCumQuoteQty} — keeping the higher figure.`,
          );
          order.cummulativeQuoteQuantity = previousCumQuoteQty;
        }
        // Inherit cumulative commission if missing too (same double-counting guard as above)
        if (order.commission === undefined) {
          order.commission = previousCommission;
        }
        if (order.commissionAsset === undefined) {
          order.commissionAsset = existingOrder.commissionAsset;
        }
        if (order.commission !== undefined && order.commission.lt(previousCommission)) {
          this.logger.warn(
            `The ${order.status} update for ${order.clientOrderId ?? order.id} reports a ` +
              `commission of ${order.commission} below the recorded ${previousCommission} — ` +
              `keeping the higher figure.`,
          );
          order.commission = previousCommission;
        }

        // Keep our own identity: an adapter reporting a different id for an
        // order we already hold (its own id format, a re-issued number) must not
        // rename our record — the order map, the emitted events and the
        // persisted row all key on it.
        if (existingOrder.id) {
          order.id = existingOrder.id;
        }

        // Update existing order
        orders[existingOrderIndex] = order;
      }
    } else {
      // Add new order
      orders.push(order);
    }
    this._orders.set(exchangeName, orders);
    // Calculate delta to detect if a trade occurred
    const currentExecutedQty = order.executedQuantity || new Decimal(0);
    const currentCumQuoteQty = order.cummulativeQuoteQuantity || new Decimal(0);
    const currentCommission = order.commission || new Decimal(0);
    const deltaQty = currentExecutedQty.minus(previousExecutedQty);

    if (deltaQty.gt(0)) {
      // A trade occurred (partial or final fill)
      const deltaQuote = currentCumQuoteQty.minus(previousCumQuoteQty);
      // Calculate average price of this chunk
      const fillPrice = deltaQty.isZero() ? new Decimal(0) : deltaQuote.div(deltaQty);
      // 🆕 Fee for this specific chunk, derived from the (cumulative) commission delta.
      // `order.commission` is expected to be a running total for the whole order
      // (mirrors executedQuantity/cummulativeQuoteQuantity), so diffing gives the
      // fee attributable to just this fill. Guard against negative deltas from
      // out-of-order/duplicate updates.
      const deltaFee = currentCommission.minus(previousCommission);

      trade = {
        id: `${order.id}-${Date.now()}`, // Generate unique trade ID for this fill
        symbol: order.symbol,
        price: fillPrice.isZero() ? order.price || new Decimal(0) : fillPrice,
        quantity: deltaQty,
        side: order.side === OrderSide.BUY ? 'buy' : 'sell',
        timestamp: new Date(),
        exchange: exchangeName,
        strategyId: order.strategyId,
        fee: deltaFee.gt(0) ? deltaFee : new Decimal(0),
      };

      this.logger.info(
        `⚖️ Execution detected: ${trade.side} ${trade.quantity} @ ${trade.price} ` +
          `(Order: ${order.clientOrderId})`,
      );

      // 🆕 Notify strategies of the trade execution. Deliberately NOT awaited:
      // a strategy callback must never hold up — or truncate — the state
      // bookkeeping above, and notifyStrategies* already isolate every strategy
      // in its own try/catch. Ordering between two pushes for one order comes
      // from `applyExchangeOrderUpdate` writing the map synchronously (there is
      // no `await` before that write) — this floating notify is orthogonal to it.
      const executedTrade: Trade = trade;
      void this.notifyStrategiesTradeExecuted(executedTrade, exchangeName).catch(
        (error) =>
          this.logger.error(
            'Failed to notify strategies of a trade execution',
            error as Error,
          ),
      );
    }

    order.exchange = exchangeName;
    if (!order.userId) {
      order.userId = this._userId;
    }

    // The order map already holds the new state, so the account update below has
    // to go out even when a listener throws synchronously: skipping it would leave
    // the strategy on the old state — the silent half of incident 633 (review R6
    // Minor). Emitting stays synchronous, so a throw still propagates once the
    // notification has been sent.
    try {
      const emittedKey = order.clientOrderId || order.id;
      const shouldEmitCreated =
        order.status !== OrderStatus.CANCELED &&
        order.status !== OrderStatus.REJECTED &&
        order.status !== OrderStatus.EXPIRED;
      if (shouldEmitCreated && !this._emittedOrderCreated.has(emittedKey)) {
        this._eventBus.emitOrderCreated({ order, timestamp: new Date() });
        this._emittedOrderCreated.add(emittedKey);
      }

      // Emit status-specific events for non-NEW statuses.
      // 🆕 …but not for a duplicate of a terminal update we already applied: a
      // replayed or delayed push for the same end state carries no new execution,
      // so re-firing the event (and the strategy callback) would notify twice for
      // one fill — the residual half of the "one push, two notifications" bug.
      const isDuplicateTerminal =
        previousStatus !== undefined &&
        previousStatus === order.status &&
        this.isTerminalOrderStatus(order.status) &&
        !deltaQty.gt(0);

      if (!isDuplicateTerminal) {
        switch (order.status) {
          case OrderStatus.FILLED:
            this._eventBus.emitOrderFilled({ order, timestamp: new Date() });
            void this.notifyStrategiesOrderFilled(order, exchangeName).catch((error) =>
              this.logger.error(
                'Failed to notify strategies of an order fill',
                error as Error,
              ),
            );
            break;
          case OrderStatus.PARTIALLY_FILLED:
            this._eventBus.emitOrderPartiallyFilled({ order, timestamp: new Date() });
            // Note: trade notification handled above
            break;
          case OrderStatus.CANCELED:
            this._eventBus.emitOrderCancelled({ order, timestamp: new Date() });
            break;
          case OrderStatus.REJECTED:
            this._eventBus.emitOrderRejected({ order, timestamp: new Date() });
            break;
          case OrderStatus.EXPIRED:
            // Expired orders - emit if needed
            break;
          case OrderStatus.NEW:
            // OrderCreated already handled above
            break;
        }
      }
    } finally {
      // 🆕 Notify strategies of the specific order update. Fire-and-forget, as the
      // websocket path always was: the account-update gate already serialises
      // these calls (and queues one that arrives while another is in flight), and
      // a strategy error must not undo the state bookkeeping above.
      void this.onAccountUpdate({
        orders: [order],
        exchangeName,
      }).catch((error) =>
        this.logger.error(
          'Failed to notify strategies of an order update',
          error as Error,
        ),
      );
    }
  }

  private setupExchangeListeners(exchange: IExchange): void {
    const exchangeName = exchange.name;

    // Listen for market data - use specific typed methods
    exchange.on('ticker', (symbol: string, ticker: Ticker) => {
      this._eventBus.emitTickerUpdate({
        symbol,
        ticker,
        timestamp: new Date(),
      });
      this.onTicker(symbol, ticker, exchangeName);
    });

    exchange.on('orderbook', (symbol: string, orderbook: OrderBook) => {
      this._eventBus.emitOrderBookUpdate({
        symbol,
        orderbook,
        timestamp: new Date(),
      });
      this.onOrderBook(symbol, orderbook, exchangeName);
    });

    exchange.on('trade', (symbol: string, trade: Trade) => {
      this._eventBus.emitTradeUpdate({
        symbol,
        trade,
        timestamp: new Date(),
      });
      // Single trade event - wrap in array for consistency
      this.onTrades(symbol, [trade], exchangeName);
    });

    exchange.on('kline', (symbol: string, kline: Kline) => {
      this._eventBus.emitKlineUpdate({
        symbol,
        kline,
        timestamp: new Date(),
      });
      this.onKline(symbol, kline, exchangeName);
    });

    // Listen for user data updates
    exchange.on('orderUpdate', (symbol: string, order: Order) => {
      // All order bookkeeping lives in one place — see the method docs.
      void this.applyExchangeOrderUpdate(exchangeName, symbol, order).catch((error) =>
        this.logger.error(`Error applying an order update for ${symbol}`, error as Error),
      );
    });

    // Balance Update Event
    // Exchanges MUST normalize balance data to Balance[] format:
    // { asset: string, free: Decimal, locked: Decimal, total: Decimal }
    exchange.on('accountUpdate', (exchangeId: string, balances: Balance[]) => {
      this.logger.debug(
        `💰 Account Update from ${exchangeName}: ${balances.length} balances`,
      );
      const wallet =
        exchangeId.toLowerCase() !== exchangeName.toLowerCase()
          ? exchangeId.toLowerCase()
          : undefined;
      // Store balances for this exchange
      this._balances.set(exchangeName, balances);
      this._eventBus.emitBalanceUpdate({
        userId: this._userId,
        exchange: exchangeName,
        wallet,
        balances,
        timestamp: new Date(),
      });

      // Notify strategies of specific balance update (push data only)
      this.onAccountUpdate({ balances, exchangeName });
    });

    exchange.on('positionUpdate', (exchangeId: string, positions: Position[]) => {
      this.logger.debug(
        `📊 Position Update from ${exchangeName}: ${positions.length} positions`,
      );
      // Store positions for this exchange
      this._positions.set(exchangeName, positions);
      this._eventBus.emitPositionUpdate({
        userId: this._userId,
        exchange: exchangeName,
        positions,
        timestamp: new Date(),
      });

      // Sync portfolio manager to handle closed positions
      // This ensures that getPositions() returns accurate data
      this.portfolioManager.syncPositions(positions, exchangeName);

      // Notify strategies of specific position update
      this.onAccountUpdate({ positions, exchangeName });
    });
  }

  private findOrderByClientOrderId(
    clientOrderId: string,
    exchangeName?: string,
    symbol?: string,
  ): Order | undefined {
    const exchangesToSearch = exchangeName
      ? [exchangeName]
      : Array.from(this._orders.keys());

    for (const exchangeKey of exchangesToSearch) {
      const orders = this._orders.get(exchangeKey) || [];
      const match = orders.find((order) => {
        if (order.clientOrderId !== clientOrderId) return false;
        if (symbol && order.symbol !== symbol) return false;
        return true;
      });
      if (match) return match;
    }

    return undefined;
  }

  /**
   * Get aggregated account data from all exchanges
   */
  private getAccountData(): {
    positions: Position[];
    orders: Order[];
    balances: Balance[];
  } {
    const allPositions: Position[] = [];
    const allOrders: Order[] = [];
    const allBalances: Balance[] = [];

    // Aggregate positions from all exchanges
    for (const positions of this._positions.values()) {
      allPositions.push(...positions);
    }

    // Aggregate orders from all exchanges
    for (const orders of this._orders.values()) {
      allOrders.push(...orders);
    }

    // Aggregate balances from all exchanges
    for (const balances of this._balances.values()) {
      allBalances.push(...balances);
    }

    return {
      positions: allPositions,
      orders: allOrders,
      balances: allBalances,
    };
  }

  /**
   * Feed externally-discovered order updates (e.g. from a periodic REST
   * open-order reconciliation) into the same strategy notification path as
   * websocket order updates. Strategies process dataUpdate.orders
   * idempotently (incremental fills, stale-update guards), so replaying an
   * already-known state is safe.
   */
  public async notifyOrderUpdates(orders: Order[], exchangeName?: string): Promise<void> {
    if (orders.length === 0) return;
    await this.onAccountUpdate({ orders, exchangeName });
  }

  /**
   * Notify strategies with specific account data updates (pushed data only)
   * Only passes the data that was actually pushed, not all account data
   */
  private async onAccountUpdate(accountData: {
    positions?: Position[];
    orders?: Order[];
    balances?: Balance[];
    exchangeName?: string;
  }): Promise<void> {
    // 🆕 Serialize: if an onAccountUpdate is already in progress (e.g.
    // processing a TP FILLED that triggers reinit with REST fetch), queue
    // this update and return. The in-progress call will drain the queue
    // after it finishes. Without this, concurrent WS events (e.g. TP FILLED
    // followed immediately by entry CANCELED) can interleave analyze() calls
    // on the same strategy → state corruption → duplicate entry orders.
    if (this._isProcessingAccountUpdate) {
      this._pendingAccountUpdates.push(accountData);
      this.logger.debug(
        `📤 [onAccountUpdate] Already processing — queued update ` +
          `(${this._pendingAccountUpdates.length} pending)`,
      );
      return;
    }

    this._isProcessingAccountUpdate = true;
    try {
      if (!this._isRunning) {
        this.enqueueAccountUpdate(accountData);
        return;
      }
      // DEBUG: Log what we're sending to strategies
      if (accountData.orders && accountData.orders.length > 0) {
        this.logger.debug(
          `📤 [onAccountUpdate] Sending ${accountData.orders.length} order update(s) to ${this._strategies.size} strategy(ies)`,
        );
        accountData.orders.forEach((order) => {
          this.logger.debug(
            `   Order: ${order.clientOrderId?.substring(0, 8)}... | ` +
              `Status: ${order.status} | Exchange: ${accountData.exchangeName}`,
          );
        });
      }

      // Process account data update with all strategies
      for (const [strategyName, strategy] of this._strategies) {
        try {
          // DEBUG: Log which strategy is receiving the update
          if (accountData.orders && accountData.orders.length > 0) {
            this.logger.debug(
              `   → Sending to strategy: ${strategyName} (exchange: ${strategy.config.exchange})`,
            );
          }

          const result = await strategy.analyze(accountData);

          // Use strategy context symbol as default
          const defaultSymbol = strategy.context.symbol || '';

          // Process all results (handles both single and array results)
          // Pass 'account update' as source for proper logging
          await this.processStrategyResults(
            strategyName,
            defaultSymbol,
            result,
            'account update',
          );

          // 🆕 Check if strategy requested reinitialization (e.g. after TP fill
          // when basePrice=0, strategy needs a fresh orderbook snapshot for the
          // next cycle). The strategy signals this via requiresReinitialization().
          if (strategy.requiresReinitialization?.()) {
            this.logger.info(
              `🔄 [Reinit] Strategy ${strategyName} requested reinitialization. ` +
                `Reloading initial data (orderbook REST fetch)...`,
            );
            // Clear the loaded marker so loadInitialDataForStrategy runs again
            this._strategiesWithLoadedInitialData.delete(strategyName);
            try {
              await this.loadInitialDataForStrategy(strategyName, strategy);
            } catch (reinitError) {
              this.logger.error(
                `❌ [Reinit] Failed to reload initial data for ${strategyName}`,
                reinitError as Error,
              );
            }
          }
        } catch (error) {
          this.logger.error(
            `Error in strategy ${strategyName} (account update)`,
            error as Error,
          );
          this._eventBus.emitStrategyError(strategyName, error as Error);
        }
      }
    } catch (error) {
      this.logger.error('Error processing account data update', error as Error);
    } finally {
      this._isProcessingAccountUpdate = false;
    }

    // Drain any updates that were queued while we were processing.
    // This ensures no WS event is lost — it's just deferred until the
    // previous onAccountUpdate (and its reinit) completes.
    if (this._pendingAccountUpdates.length > 0 && this._isRunning) {
      const pending = this._pendingAccountUpdates.splice(0);
      for (const update of pending) {
        await this.onAccountUpdate(update);
      }
    }
  }

  private enqueueAccountUpdate(accountData: {
    positions?: Position[];
    orders?: Order[];
    balances?: Balance[];
    exchangeName?: string;
  }): void {
    this._pendingAccountUpdates.push(accountData);
    this.logger.warn('Trading engine is not running; queued account update');
  }

  private async flushPendingAccountUpdates(): Promise<void> {
    if (!this._pendingAccountUpdates.length) {
      return;
    }

    const pending = this._pendingAccountUpdates.splice(0);
    this.logger.info(`Processing ${pending.length} queued account update(s)`);
    for (const update of pending) {
      await this.onAccountUpdate(update);
    }
  }

  private async notifyStrategiesOrderFilled(
    order: Order,
    exchangeName: string,
  ): Promise<void> {
    for (const [name, strategy] of this._strategies) {
      try {
        const strategyId = strategy.getStrategyId?.() ?? strategy.config.strategyId;
        if (
          order.strategyId !== undefined &&
          strategyId !== undefined &&
          order.strategyId !== strategyId
        ) {
          continue;
        }
        if (strategy.config.exchange === exchangeName) {
          await strategy.onOrderFilled(order);
          // 🆕 Trigger debounced performance save (updates counts)
          this.saveStrategyPerformance(name, strategy);
        }
      } catch (error) {
        this.logger.error(
          `Error notifying strategy ${name} of order fill`,
          error as Error,
        );
      }
    }
  }

  /**
   * 🆕 Notify strategies of trade execution (partial or full fill)
   */
  private async notifyStrategiesTradeExecuted(
    trade: Trade,
    exchangeName: string,
  ): Promise<void> {
    for (const [name, strategy] of this._strategies) {
      try {
        const strategyId = strategy.getStrategyId?.() ?? strategy.config.strategyId;
        if (
          trade.strategyId !== undefined &&
          strategyId !== undefined &&
          trade.strategyId !== strategyId
        ) {
          continue;
        }
        if (strategy.config.exchange === exchangeName) {
          if (strategy.onTradeExecuted) {
            await strategy.onTradeExecuted(trade);
            // 🆕 Trigger debounced performance save (updates PnL/volume)
            this.saveStrategyPerformance(name, strategy);
          }
        }
      } catch (error) {
        this.logger.error(
          `Error notifying strategy ${name} of trade execution`,
          error as Error,
        );
      }
    }
  }

  /**
   * Load initial data for a strategy (with deduplication)
   * This is called from two places:
   * 1. engine.start() - for strategies added before engine starts
   * 2. addStrategy() - for strategies added while engine is running
   */
  private async loadInitialDataForStrategy(
    name: string,
    strategy: IStrategy,
  ): Promise<void> {
    // Skip if already loaded (prevent duplicate loading)
    if (this._strategiesWithLoadedInitialData.has(name)) {
      return;
    }

    const context = strategy.context;

    // Use the dynamic initialDataConfig from the strategy if available, falling back to context
    const initialDataConfig = strategy.getInitialDataConfig
      ? strategy.getInitialDataConfig()
      : context?.initialDataConfig;

    if (!initialDataConfig) {
      return;
    }

    try {
      // 🆕 Await any async initialization the strategy started in its
      // constructor before processing its initial data. Ensures derive
      // classes that do async setup in onInitialize() are ready.
      await strategy.initialize?.();

      const loadedData = await loadInitialDataForStrategy(
        strategy,
        this._exchanges,
        this.logger,
      );

      // 🆕 Fetch strategy net position from database if requested to improve performance/accuracy
      if (
        initialDataConfig?.fetchStrategyNetPosition &&
        this._dataManager?.getStrategyNetPosition
      ) {
        const strategyId = strategy.getStrategyId?.();
        if (strategyId) {
          this.logger.info(
            `📊 [INITIAL_DATA] Fetching SQL net position for strategy ${name}`,
          );
          loadedData.strategyNetPosition = await this._dataManager.getStrategyNetPosition(
            strategyId,
            strategy.context.symbol,
          );
          this.logger.info(
            `✅ [INITIAL_DATA] Strategy ${name} net position: ${loadedData.strategyNetPosition.toString()}`,
          );
        }
      }

      // Store the loaded data in strategy's context for reference
      context.loadedInitialData = loadedData;

      const initialSignals = await strategy.processInitialData(loadedData);
      if (initialSignals) {
        await this.processStrategyResults(
          name,
          context.symbol,
          initialSignals,
          'initial_data',
        );
      }

      // Mark as loaded to prevent duplicate loading
      this._strategiesWithLoadedInitialData.add(name);
    } catch (error) {
      this.logger.error(
        `❌ [INITIAL_DATA] Failed to load for strategy ${name}`,
        error as Error,
      );
      // Continue even if initial data loading fails - strategy can still work with real-time data
    }
  }

  /**
   * Auto-subscribe to strategy data
   */
  private async subscribeStrategyData(
    strategyName: string,
    strategy: IStrategy,
  ): Promise<void> {
    // Prefer the strategy's own subscription requirements (getSubscriptionConfig
    // override) over the persisted context config. Strategies that require
    // specific streams (e.g. orderbook for pricing) declare them there, so a
    // stale/incomplete DB subscription config cannot silently disable them.
    const config = strategy.getSubscriptionConfig?.() ?? strategy.context.subscription;
    if (!config || Object.keys(config).length === 0) {
      this.logger.warn(
        `⚠️  [SUBSCRIBE] Strategy ${strategyName} has no subscription config - cannot subscribe to data!`,
      );
      return;
    }

    const symbol = strategy.context.symbol;
    if (!symbol) {
      this.logger.warn(
        `⚠️  [SUBSCRIBE] Strategy ${strategyName} has subscription config but no symbol - cannot subscribe!`,
      );
      return;
    }

    const exchanges = this.getTargetExchanges(config.exchange);
    this.logger.info(`📡 [SUBSCRIBE] Auto-subscribing data for strategy ${strategyName}`);
    this.logger.info(
      `   Symbol: ${symbol}, Exchanges: ${exchanges.map((e) => e.name).join(', ')}`,
    );
    this.logger.info(
      `   Config: ticker=${!!config.ticker}, orderbook=${!!config.orderbook}, trades=${!!config.trades}, klines=${!!config.klines}`,
    );

    for (const exchange of exchanges) {
      this.logger.debug(`📡 [SUBSCRIBE] Processing exchange: ${exchange.name}`);

      // Subscribe to ticker
      if (config.ticker) {
        const tickerParams = this.normalizeDataConfig('ticker', config.ticker);
        this.logger.debug(`   └─ Subscribing to ticker...`);
        await this.subscriptionCoordinator.subscribe(
          strategyName,
          exchange,
          symbol,
          'ticker',
          tickerParams as unknown as Record<string, SubscriptionParamValue>,
          config.method,
        );
      }

      // Subscribe to orderbook
      if (this.isSubscriptionEnabled(config.orderbook)) {
        const orderbookParams = this.normalizeDataConfig('orderbook', config.orderbook!);
        this.logger.debug(`   └─ Subscribing to orderbook...`);
        await this.subscriptionCoordinator.subscribe(
          strategyName,
          exchange,
          symbol,
          'orderbook',
          orderbookParams as unknown as Record<string, SubscriptionParamValue>,
          config.method,
        );
      }

      // Subscribe to trades
      if (this.isSubscriptionEnabled(config.trades)) {
        const tradesParams = this.normalizeDataConfig('trades', config.trades!);
        this.logger.debug(`   └─ Subscribing to trades...`);
        await this.subscriptionCoordinator.subscribe(
          strategyName,
          exchange,
          symbol,
          'trades',
          tradesParams as unknown as Record<string, SubscriptionParamValue>,
          config.method,
        );
      }

      // Subscribe to klines
      if (this.isSubscriptionEnabled(config.klines)) {
        const klinesParams = this.normalizeDataConfig('klines', config.klines!);
        this.logger.debug(`   └─ Subscribing to klines...`);
        await this.subscriptionCoordinator.subscribe(
          strategyName,
          exchange,
          symbol,
          'klines',
          klinesParams as unknown as Record<string, SubscriptionParamValue>,
          config.method,
        );
      }
    }

    this.logger.info(
      `✅ [SUBSCRIBE] Completed subscription for strategy ${strategyName}`,
    );
  }

  /**
   * Auto-unsubscribe strategy data
   */
  private async unsubscribeStrategyData(strategyName: string): Promise<void> {
    const strategy = this._strategies.get(strategyName);
    if (!strategy) {
      return;
    }

    // Must mirror subscribeStrategyData: use the same config source so the
    // unsubscribe keys match what was subscribed.
    const config = strategy.getSubscriptionConfig?.() ?? strategy.context.subscription;
    if (!config || Object.keys(config).length === 0) return;
    const symbol = strategy.context.symbol;
    if (!symbol) return;

    const exchanges = this.getTargetExchanges(config.exchange);

    this.logger.info(`Auto-unsubscribing data for strategy ${strategyName}`);

    for (const exchange of exchanges) {
      // Unsubscribe from ticker
      if (config.ticker) {
        const tickerParams = this.normalizeDataConfig('ticker', config.ticker);
        await this.subscriptionCoordinator.unsubscribe(
          strategyName,
          exchange,
          symbol,
          'ticker',
          tickerParams as unknown as Record<string, SubscriptionParamValue>,
        );
      }

      // Unsubscribe from orderbook
      if (this.isSubscriptionEnabled(config.orderbook)) {
        const orderbookParams = this.normalizeDataConfig('orderbook', config.orderbook!);
        await this.subscriptionCoordinator.unsubscribe(
          strategyName,
          exchange,
          symbol,
          'orderbook',
          orderbookParams as unknown as Record<string, SubscriptionParamValue>,
        );
      }

      // Unsubscribe from trades
      if (this.isSubscriptionEnabled(config.trades)) {
        const tradesParams = this.normalizeDataConfig('trades', config.trades!);
        await this.subscriptionCoordinator.unsubscribe(
          strategyName,
          exchange,
          symbol,
          'trades',
          tradesParams as unknown as Record<string, SubscriptionParamValue>,
        );
      }

      // Unsubscribe from klines
      if (this.isSubscriptionEnabled(config.klines)) {
        const klinesParams = this.normalizeDataConfig('klines', config.klines!);
        await this.subscriptionCoordinator.unsubscribe(
          strategyName,
          exchange,
          symbol,
          'klines',
          klinesParams as unknown as Record<string, SubscriptionParamValue>,
        );
      }
    }
  }

  /**
   * Get target exchanges based on config
   * @param exchangeConfig - Single exchange name, array of exchange names, or undefined
   * @returns Array of exchange instances
   */
  private getTargetExchanges(exchangeConfig?: string | string[]): IExchange[] {
    // No exchange specified or empty array, use all connected exchanges
    if (
      !exchangeConfig ||
      (Array.isArray(exchangeConfig) && exchangeConfig.length === 0)
    ) {
      return Array.from(this._exchanges.values());
    }

    // Single exchange name
    if (typeof exchangeConfig === 'string') {
      const exchange = this._exchanges.get(exchangeConfig);
      if (!exchange) {
        this.logger.warn(`Exchange ${exchangeConfig} not found, using all exchanges`);
        return Array.from(this._exchanges.values());
      }
      return [exchange];
    }

    // Multiple exchange names
    const exchanges: IExchange[] = [];
    for (const exchangeName of exchangeConfig) {
      const exchange = this._exchanges.get(exchangeName);
      if (exchange) {
        exchanges.push(exchange);
      } else {
        this.logger.warn(`Exchange ${exchangeName} not found, skipping`);
      }
    }

    // If no valid exchanges found, fallback to all exchanges
    if (exchanges.length === 0) {
      this.logger.warn('No valid exchanges found in config, using all exchanges');
      return Array.from(this._exchanges.values());
    }

    return exchanges;
  }

  /**
   * Normalize data config
   */
  private normalizeDataConfig(
    type: 'ticker',
    config: boolean | TickerSubscriptionConfig,
  ): TickerSubscriptionConfig;
  private normalizeDataConfig(
    type: 'orderbook',
    config: boolean | OrderBookSubscriptionConfig,
  ): OrderBookSubscriptionConfig;
  private normalizeDataConfig(
    type: 'trades',
    config: boolean | TradesSubscriptionConfig,
  ): TradesSubscriptionConfig;
  private normalizeDataConfig(
    type: 'klines',
    config: boolean | KlinesSubscriptionConfig,
  ): KlinesSubscriptionConfig;
  private normalizeDataConfig(
    type: DataType,
    config:
      | boolean
      | TickerSubscriptionConfig
      | OrderBookSubscriptionConfig
      | TradesSubscriptionConfig
      | KlinesSubscriptionConfig,
  ):
    | TickerSubscriptionConfig
    | OrderBookSubscriptionConfig
    | TradesSubscriptionConfig
    | KlinesSubscriptionConfig {
    if (typeof config === 'boolean') {
      // Use default config
      switch (type) {
        case 'ticker':
          return DEFAULT_TICKER_CONFIG;
        case 'orderbook':
          return DEFAULT_ORDERBOOK_CONFIG;
        case 'trades':
          return DEFAULT_TRADES_CONFIG;
        case 'klines':
          return DEFAULT_KLINES_CONFIG;
      }
    }

    return config;
  }

  /**
   * Check if a subscription is enabled
   * Handles both boolean and object config formats
   */
  private isSubscriptionEnabled(
    config?:
      | boolean
      | TickerSubscriptionConfig
      | OrderBookSubscriptionConfig
      | TradesSubscriptionConfig
      | KlinesSubscriptionConfig,
  ): boolean {
    if (!config) {
      return false;
    }

    if (typeof config === 'boolean') {
      return config;
    }

    // For object configs, check the 'enabled' property
    // If 'enabled' is not present or is true, subscription is enabled
    return config.enabled !== false;
  }

  /**
   * Get subscription statistics
   */
  public getSubscriptionStats() {
    return this.subscriptionCoordinator.getStats();
  }

  /**
   * 🆕 Save strategy performance with debouncing (throttle)
   * Prevents database thrashing during high-frequency updates
   */
  private saveStrategyPerformance(strategyName: string, strategy: IStrategy): void {
    if (!this._dataManager?.updateStrategyPerformance) return;

    const strategyId = strategy.getStrategyId?.() ?? strategy.config.strategyId;
    if (!strategyId) return;

    // Clear existing timer if any (debounce behavior)
    if (this._performanceSaveTimers.has(strategyId)) {
      clearTimeout(this._performanceSaveTimers.get(strategyId));
    }

    // Set new timer (2 seconds debounce)
    const timer = setTimeout(async () => {
      try {
        await this.forceSaveStrategyPerformance(strategyName, strategy);
      } finally {
        this._performanceSaveTimers.delete(strategyId);
      }
    }, 2000);

    this._performanceSaveTimers.set(strategyId, timer);
  }

  /**
   * 🆕 Force immediate save of strategy performance
   * Used during stop/cleanup or when timer fires
   */
  private async forceSaveStrategyPerformance(
    strategyName: string,
    strategy: IStrategy,
  ): Promise<void> {
    if (!this._dataManager?.updateStrategyPerformance) return;

    const strategyId = strategy.getStrategyId?.() ?? strategy.config.strategyId;
    if (!strategyId) return;

    try {
      const performance = strategy.getPerformance?.();
      if (performance) {
        await this._dataManager.updateStrategyPerformance(strategyId, performance);
        this.logger.debug(
          `💾 Saved performance for strategy ${strategyName} (ID: ${strategyId})`,
        );
      }
    } catch (error) {
      this.logger.error(`Failed to save performance for ${strategyName}`, error as Error);
    }
  }
}
