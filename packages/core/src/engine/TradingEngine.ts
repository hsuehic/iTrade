import { EventEmitter } from 'events';

import { v4 as uuidv4 } from 'uuid';

import {
  ITradingEngine,
  IStrategy,
  IExchange,
  IRiskManager,
  IPortfolioManager,
  ILogger,
  ExecuteOrderParameters,
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
  Ticker,
  OrderBook,
  Trade,
  Kline,
  DataType,
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

import { SubscriptionCoordinator } from './SubscriptionCoordinator';

export class TradingEngine extends EventEmitter implements ITradingEngine {
  private _isRunning = false;
  private readonly _strategies = new Map<string, IStrategy>();
  private readonly _exchanges = new Map<string, IExchange>();
  private _eventBus: EventBus;
  private subscriptionCoordinator: SubscriptionCoordinator;

  // Account state tracking (keyed by exchange name)
  private readonly _positions = new Map<string, Position[]>();
  private readonly _orders = new Map<string, Order[]>();
  private readonly _balances = new Map<string, Balance[]>();

  constructor(
    private riskManager: IRiskManager,
    private portfolioManager: IPortfolioManager,
    private logger: ILogger,
  ) {
    super();
    this._eventBus = EventBus.getInstance();
    this.subscriptionCoordinator = new SubscriptionCoordinator(logger);
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

    try {
      this.logger.info('Starting trading engine...');

      // Strategies are already initialized in their constructors

      // Connect to all exchanges
      for (const [name, exchange] of this._exchanges) {
        if (!exchange.isConnected) {
          exchange.connect({
            apiKey: '',
            secretKey: '',
            sandbox: false,
          });
          this.logger.warn(`Exchange ${name} is not connected`);
        }
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

      this._isRunning = true;
      this._eventBus.emitEngineStarted();
      this.logger.info('Trading engine started successfully');
    } catch (error) {
      this._isRunning = false;
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
          await strategy.cleanup?.();
          this.logger.info(`Strategy ${name} cleaned up successfully`);
        } catch (error) {
          this.logger.error(`Failed to cleanup strategy ${name}`, error as Error);
        }
      }

      // Clear all subscriptions
      await this.subscriptionCoordinator.clear();

      this._isRunning = false;
      this._eventBus.emitEngineStopped();
      this.logger.info('Trading engine stopped successfully');
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

    // Auto-subscribe to strategy data if engine is running
    if (this._isRunning) {
      await this.subscribeStrategyData(name, strategy);
    }
  }

  public async removeStrategy(name: string): Promise<void> {
    if (!this._strategies.has(name)) {
      throw new Error(`Strategy ${name} does not exist`);
    }

    // Auto-unsubscribe strategy data
    await this.unsubscribeStrategyData(name);

    this._strategies.delete(name);
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
      // Add exchange info to ticker if provided

      // Process ticker with all strategies
      for (const [strategyName, strategy] of this._strategies) {
        try {
          const result = await strategy.analyze({ ticker, exchangeName, symbol });

          if (result.action !== 'hold') {
            this._eventBus.emitStrategySignal({
              strategyName,
              symbol,
              action: result.action,
              quantity: result.quantity?.toNumber(),
              price: result.price?.toNumber(),
              confidence: result.confidence,
              reason: result.reason,
              timestamp: new Date(),
            });

            // Execute the strategy signal
            await this.executeStrategySignal(strategyName, symbol, result);
          }
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

          if (result.action !== 'hold') {
            this._eventBus.emitStrategySignal({
              strategyName,
              symbol,
              action: result.action,
              quantity: result.quantity?.toNumber(),
              price: result.price?.toNumber(),
              confidence: result.confidence,
              reason: result.reason,
              timestamp: new Date(),
            });

            await this.executeStrategySignal(strategyName, symbol, result);
          }
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

          if (result.action !== 'hold') {
            this._eventBus.emitStrategySignal({
              strategyName,
              symbol,
              action: result.action,
              quantity: result.quantity?.toNumber(),
              price: result.price?.toNumber(),
              confidence: result.confidence,
              reason: result.reason,
              timestamp: new Date(),
            });

            await this.executeStrategySignal(strategyName, symbol, result);
          }
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

          if (result.action !== 'hold') {
            this._eventBus.emitStrategySignal({
              strategyName,
              symbol,
              action: result.action,
              quantity: result.quantity?.toNumber(),
              price: result.price?.toNumber(),
              confidence: result.confidence,
              reason: result.reason,
              timestamp: new Date(),
            });

            await this.executeStrategySignal(strategyName, symbol, result);
          }
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

          if (result.action !== 'hold') {
            this._eventBus.emitStrategySignal({
              strategyName,
              symbol,
              action: result.action,
              quantity: result.quantity?.toNumber(),
              price: result.price?.toNumber(),
              confidence: result.confidence,
              reason: result.reason,
              timestamp: new Date(),
            });

            await this.executeStrategySignal(strategyName, symbol, result);
          }
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
      throw new Error('Trading engine is not running');
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
      // Fetch symbol info to get precision requirements
      const symbolInfo = await exchange.getSymbolInfo(symbol);

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

      this._eventBus.emitOrderCreated({
        order: executedOrder,
        timestamp: new Date(),
      });

      this.logger.logTrade('Order executed', {
        order: executedOrder,
        strategyId,
        strategyType, // Strategy type/class
        strategyName: userDefinedName, // User-defined name
        exchange: exchangeName,
      });
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

  private async executeStrategySignal(
    strategyName: string,
    symbol: string,
    signal: StrategyResult,
  ): Promise<void> {
    if (signal.action === 'hold' || !signal.quantity) {
      return;
    }

    try {
      const orderType = signal.price ? OrderType.LIMIT : OrderType.MARKET;
      const side = signal.action === 'buy' ? OrderSide.BUY : OrderSide.SELL;

      // 🆕 Extract clientOrderId from signal metadata
      const clientOrderId = signal.metadata?.clientOrderId;

      const executedOrder = await this.executeOrder({
        // exchange: exchangeName,
        strategyName,
        symbol,
        side,
        quantity: signal.quantity,
        type: orderType,
        price: signal.price,
        tradeMode: signal.tradeMode,
        leverage: signal.leverage,
        clientOrderId, // 🆕 Pass clientOrderId from signal metadata
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

      // 🆕 Notify strategy that order was created from its signal
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
      this.logger.info(
        `📦 Order Update from ${exchangeName}: ${symbol} - ${order.status}`,
      );

      // Store/update order in the orders map
      const orders = this._orders.get(exchangeName) || [];
      const existingOrderIndex = orders.findIndex((o) => o.id === order.id);
      if (existingOrderIndex >= 0) {
        // Update existing order
        orders[existingOrderIndex] = order;
      } else {
        // Add new order
        orders.push(order);
      }
      this._orders.set(exchangeName, orders);
      order.exchange = exchange.name;

      // Emit order event based on status
      switch (order.status) {
        case 'FILLED':
          this._eventBus.emitOrderFilled({ order, timestamp: new Date() });
          this.notifyStrategiesOrderFilled(order, exchangeName);
          break;
        case 'PARTIALLY_FILLED':
          this._eventBus.emitOrderPartiallyFilled({ order, timestamp: new Date() });
          break;
        case 'CANCELED':
          this._eventBus.emitOrderCancelled({ order, timestamp: new Date() });
          break;
        case 'REJECTED':
          this._eventBus.emitOrderRejected({ order, timestamp: new Date() });
          break;
        default:
          this._eventBus.emitOrderCreated({ order, timestamp: new Date() });
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
      this.logger.info(
        `💰 Account Update from ${exchangeName}: ${balances.length} balances`,
      );
      // Store balances for this exchange
      this._balances.set(exchangeName, balances);
      this._eventBus.emitBalanceUpdate({
        exchange: exchangeName,
        balances,
        timestamp: new Date(),
      });

      // Notify strategies of specific balance update (push data only)
      this.onAccountUpdate({ balances, exchangeName });
    });

    exchange.on('positionUpdate', (exchangeId: string, positions: Position[]) => {
      this.logger.info(
        `📊 Position Update from ${exchangeName}: ${positions.length} positions`,
      );
      // Store positions for this exchange
      this._positions.set(exchangeName, positions);
      this._eventBus.emitPositionUpdate({
        exchange: exchangeName,
        positions,
        timestamp: new Date(),
      });

      // Notify strategies of specific position update
      this.onAccountUpdate({ positions, exchangeName });
    });
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
      // Process account data update with all strategies
      for (const [strategyName, strategy] of this._strategies) {
        try {
          const result = await strategy.analyze(accountData);

          if (result.action !== 'hold') {
            // Account data changes might trigger trading signals
            // Note: symbol should come from the strategy's parameters
            const symbol = strategy.context.symbol || '';
            this._eventBus.emitStrategySignal({
              strategyName,
              symbol,
              action: result.action,
              quantity: result.quantity?.toNumber(),
              price: result.price?.toNumber(),
              confidence: result.confidence,
              reason: result.reason || 'Account data update',
              timestamp: new Date(),
            });

            // Note: We don't auto-execute orders from account updates
            // Strategies should explicitly request execution if needed
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
   * Auto-subscribe to strategy data
   */
  private async subscribeStrategyData(
    strategyName: string,
    strategy: IStrategy,
  ): Promise<void> {
    const config = strategy.context.subscription;
    if (!config) {
      this.logger.debug(`Strategy ${strategyName} has no subscription config`);
      return;
    }

    const symbol = strategy.context.symbol;
    if (!symbol) {
      this.logger.warn(`Strategy ${strategyName} has subscription config but no symbol`);
      return;
    }

    const exchanges = this.getTargetExchanges(strategy.context.exchange);
    this.logger.info(
      `Auto-subscribing data for strategy ${strategyName} (symbol: ${symbol}, exchanges: ${exchanges.map((e) => e.name).join(', ')})`,
    );

    for (const exchange of exchanges) {
      // Subscribe to ticker
      if (config.ticker) {
        const tickerParams = this.normalizeDataConfig('ticker', config.ticker);
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
}
