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
} from '../types';
import { EventBus } from '../events';
import { PrecisionUtils } from '../utils/PrecisionUtils';
import { loadInitialDataForStrategy } from '../utils/StrategyLoader';

import { SubscriptionCoordinator } from './SubscriptionCoordinator';

export class TradingEngine extends EventEmitter implements ITradingEngine {
  private _isRunning = false;
  private _isInitializing = false; // Track if engine is in initialization phase
  private readonly _strategies = new Map<string, IStrategy>();
  private readonly _exchanges = new Map<string, IExchange>();
  private readonly _strategiesWithLoadedInitialData = new Set<string>(); // Track which strategies have loaded initial data
  private _eventBus: EventBus;
  private subscriptionCoordinator: SubscriptionCoordinator;
  private readonly _userId?: string;
  private readonly _dataManager?: IDataManager;

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

  // 🆕 Track which orders have been emitted as "created" to avoid duplicate OrderCreated events
  private readonly _emittedOrderCreated = new Set<string>();
  private readonly _symbolInfoCache = new Map<
    string,
    { info: SymbolInfo; fetchedAt: number }
  >();
  private readonly _symbolInfoTtlMs = 30 * 60 * 1000;

  constructor(
    private riskManager: IRiskManager,
    private portfolioManager: IPortfolioManager,
    private logger: ILogger,
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
        price: adjustedPrice,
        status: 'NEW' as OrderStatus,
        timeInForce: 'GTC' as TimeInForce,
        timestamp: new Date(),

        // 🆕 Add strategy and exchange association
        exchange: exchangeName,
        strategyId: strategyId,
        strategyType: strategyType, // Strategy type/class (e.g., "MovingAverage")
        strategyName: userDefinedName, // User-defined name (e.g., "MA_1")
      };

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
    const exchangeName = Array.isArray(exchangeConfig)
      ? exchangeConfig[0]
      : exchangeConfig;

    const exchange = exchangeName
      ? this._exchanges.get(exchangeName)
      : this.findExchangeForSymbol(targetSymbol);

    if (!exchange) {
      this.logger.error(
        `Cannot cancel order: No exchange found for symbol ${targetSymbol}`,
      );
      return;
    }

    try {
      const resolvedOrder =
        !signal.orderId && signal.clientOrderId
          ? this.findOrderByClientOrderId(
              signal.clientOrderId,
              exchangeName,
              targetSymbol,
            )
          : undefined;

      const orderId = signal.orderId || resolvedOrder?.id || '';

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
    const exchangeName = Array.isArray(exchangeConfig)
      ? exchangeConfig[0]
      : exchangeConfig;

    const exchange = exchangeName
      ? this._exchanges.get(exchangeName)
      : this.findExchangeForSymbol(targetSymbol);

    if (!exchange) {
      this.logger.error(
        `Cannot update order: No exchange found for symbol ${targetSymbol}`,
      );
      return;
    }

    try {
      const resolvedOrder = this.findOrderByClientOrderId(
        signal.clientOrderId,
        exchangeName,
        targetSymbol,
      );

      const existingOrder = await exchange.getOrder(
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
      this.logger.error(`Failed to update order for ${strategyName}`, error as Error, {
        symbol: targetSymbol,
        clientOrderId: signal.clientOrderId,
        newClientOrderId: signal.newClientOrderId,
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
      const orderType = signal.price ? OrderType.LIMIT : OrderType.MARKET;
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
        tradeMode: signal.tradeMode,
        leverage: signal.leverage,
        clientOrderId,
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
          `⚠️  [SYMBOL_INFO] Failed to prefetch ${symbol} from ${exchange.name} for ${strategyName}`,
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
      // 🆕 Enrich order with strategy info BEFORE any processing/logging
      this.enrichOrderWithStrategyInfo(order);

      this.logger.info(
        `📦 Order Update from ${exchangeName}: ${symbol} - ${order.status}`,
      );

      // Store/update order in the orders map
      const orders = this._orders.get(exchangeName) || [];
      const existingOrderIndex = orders.findIndex((o) => o.id === order.id);

      // 🆕 Calculate execution delta for partial fills
      let trade: Trade | undefined;
      let previousExecutedQty = new Decimal(0);
      let previousCumQuoteQty = new Decimal(0);

      if (existingOrderIndex >= 0) {
        const existingOrder = orders[existingOrderIndex];
        previousExecutedQty = existingOrder.executedQuantity || new Decimal(0);
        previousCumQuoteQty = existingOrder.cummulativeQuoteQuantity || new Decimal(0);

        // 🆕 Safety: If incoming order has undefined executedQuantity, inherit from previous state
        // This prevents regression to 0 which would cause double-counting on next fill
        if (order.executedQuantity === undefined) {
          order.executedQuantity = previousExecutedQty;
        }
        // Inherit cumulative quote qty if missing too
        if (order.cummulativeQuoteQuantity === undefined) {
          order.cummulativeQuoteQuantity = previousCumQuoteQty;
        }

        // Update existing order
        orders[existingOrderIndex] = order;
      } else {
        // Add new order
        orders.push(order);
      }
      this._orders.set(exchangeName, orders);

      // Calculate delta to detect if a trade occurred
      const currentExecutedQty = order.executedQuantity || new Decimal(0);
      const currentCumQuoteQty = order.cummulativeQuoteQuantity || new Decimal(0);
      const deltaQty = currentExecutedQty.minus(previousExecutedQty);

      if (deltaQty.gt(0)) {
        // A trade occurred (partial or final fill)
        const deltaQuote = currentCumQuoteQty.minus(previousCumQuoteQty);
        // Calculate average price of this chunk
        const fillPrice = deltaQty.isZero() ? new Decimal(0) : deltaQuote.div(deltaQty);

        trade = {
          id: `${order.id}-${Date.now()}`, // Generate unique trade ID for this fill
          symbol: order.symbol,
          price: fillPrice.isZero() ? order.price || new Decimal(0) : fillPrice,
          quantity: deltaQty,
          side: order.side === OrderSide.BUY ? 'buy' : 'sell',
          timestamp: new Date(),
          exchange: exchangeName,
          // Calculate fee for this chunk if possible (requires order fee info which might be cumulative or not)
          // For now, we assume fees are handled in the order object or subsequent events
        };

        this.logger.info(
          `⚖️ Execution detected: ${trade.side} ${trade.quantity} @ ${trade.price} ` +
            `(Order: ${order.clientOrderId})`,
        );

        // Notify strategies of the trade execution
        this.notifyStrategiesTradeExecuted(trade, exchangeName);
      }

      order.exchange = exchange.name;
      if (!order.userId) {
        order.userId = this._userId;
      }

      const emittedKey = order.clientOrderId || order.id;
      const shouldEmitCreated =
        order.status !== OrderStatus.CANCELED &&
        order.status !== OrderStatus.REJECTED &&
        order.status !== OrderStatus.EXPIRED;
      if (shouldEmitCreated && !this._emittedOrderCreated.has(emittedKey)) {
        this._eventBus.emitOrderCreated({ order, timestamp: new Date() });
        this._emittedOrderCreated.add(emittedKey);
      }

      // Emit status-specific events for non-NEW statuses
      switch (order.status) {
        case OrderStatus.FILLED:
          this._eventBus.emitOrderFilled({ order, timestamp: new Date() });
          this.notifyStrategiesOrderFilled(order, exchangeName);
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

      // Notify strategies of specific order update
      this.onAccountUpdate({
        orders: [order],
        exchangeName,
      });
    });

    // Balance Update Event
    // Exchanges MUST normalize balance data to Balance[] format:
    // { asset: string, free: Decimal, locked: Decimal, total: Decimal }
    exchange.on('accountUpdate', (exchangeId: string, balances: Balance[]) => {
      this.logger.debug(
        `💰 Account Update from ${exchangeName}: ${balances.length} balances`,
      );
      // Store balances for this exchange
      this._balances.set(exchangeName, balances);
      this._eventBus.emitBalanceUpdate({
        userId: this._userId,
        exchange: exchangeName,
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
   * Notify strategies with specific account data updates (pushed data only)
   * Only passes the data that was actually pushed, not all account data
   */
  private async onAccountUpdate(accountData: {
    positions?: Position[];
    orders?: Order[];
    balances?: Balance[];
    exchangeName?: string;
  }): Promise<void> {
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
    if (!context?.initialDataConfig) {
      return;
    }

    try {
      const loadedData = await loadInitialDataForStrategy(
        strategy,
        this._exchanges,
        this.logger,
      );

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
    const config = strategy.context.subscription;
    if (!config) {
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
    if (!strategy || !strategy.context.subscription) {
      return;
    }

    const config = strategy.context.subscription;
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
