import { EventEmitter } from 'events';

import { Decimal } from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';

import {
  ITradingEngine,
  IStrategy,
  IExchange,
  IRiskManager,
  IPortfolioManager,
  ILogger,
} from '../interfaces';
import {
  Order,
  OrderSide,
  OrderType,
  Position,
  StrategyResult,
} from '../types';
import { EventBus } from '../events';

export class TradingEngine extends EventEmitter implements ITradingEngine {
  private _isRunning = false;
  private readonly _strategies = new Map<string, IStrategy>();
  private readonly _exchanges = new Map<string, IExchange>();
  private _eventBus: EventBus;

  constructor(
    private riskManager: IRiskManager,
    private portfolioManager: IPortfolioManager,
    private logger: ILogger
  ) {
    super();
    this._eventBus = EventBus.getInstance();
    this.setupEventListeners();
  }

  public get isRunning(): boolean {
    return this._isRunning;
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

      // Initialize all strategies
      for (const [name, strategy] of this._strategies) {
        try {
          await strategy.initialize(strategy.parameters);
          this.logger.info(`Strategy ${name} initialized successfully`);
        } catch (error) {
          this.logger.error(
            `Failed to initialize strategy ${name}`,
            error as Error
          );
          throw error;
        }
      }

      // Connect to all exchanges
      for (const [name, exchange] of this._exchanges) {
        if (!exchange.isConnected) {
          this.logger.warn(`Exchange ${name} is not connected`);
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
          await strategy.cleanup();
          this.logger.info(`Strategy ${name} cleaned up successfully`);
        } catch (error) {
          this.logger.error(
            `Failed to cleanup strategy ${name}`,
            error as Error
          );
        }
      }

      this._isRunning = false;
      this._eventBus.emitEngineStopped();
      this.logger.info('Trading engine stopped successfully');
    } catch (error) {
      this.logger.error('Error stopping trading engine', error as Error);
      this._eventBus.emitEngineError(error as Error);
      throw error;
    }
  }

  public addStrategy(name: string, strategy: IStrategy): void {
    if (this._strategies.has(name)) {
      throw new Error(`Strategy ${name} already exists`);
    }

    this._strategies.set(name, strategy);
    this.logger.info(`Added strategy: ${name}`);
  }

  public removeStrategy(name: string): void {
    if (!this._strategies.has(name)) {
      throw new Error(`Strategy ${name} does not exist`);
    }

    this._strategies.delete(name);
    this.logger.info(`Removed strategy: ${name}`);
  }

  public getStrategy(name: string): IStrategy | undefined {
    return this._strategies.get(name);
  }

  public addExchange(name: string, exchange: IExchange): void {
    if (this._exchanges.has(name)) {
      throw new Error(`Exchange ${name} already exists`);
    }

    this._exchanges.set(name, exchange);
    this.setupExchangeListeners(exchange);
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

  public async onMarketData(symbol: string, data: any): Promise<void> {
    if (!this._isRunning) {
      return;
    }

    try {
      // Process market data with all strategies
      for (const [strategyName, strategy] of this._strategies) {
        try {
          const result = await strategy.analyze({ ticker: data });

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
          this.logger.error(
            `Error in strategy ${strategyName}`,
            error as Error
          );
          this._eventBus.emitStrategyError(strategyName, error as Error);
        }
      }
    } catch (error) {
      this.logger.error('Error processing market data', error as Error);
    }
  }

  public async executeOrder(
    strategyName: string,
    symbol: string,
    side: OrderSide,
    quantity: Decimal,
    type: OrderType,
    price?: Decimal,
    stopPrice?: Decimal
  ): Promise<Order> {
    if (!this._isRunning) {
      throw new Error('Trading engine is not running');
    }

    // Get current positions and balances for risk checking
    const positions = await this.portfolioManager.getPositions();
    const balances = await this.portfolioManager.getBalances();

    // Create order object for risk checking
    const order: Order = {
      id: uuidv4(),
      clientOrderId: `${strategyName}_${Date.now()}`,
      symbol,
      side,
      type,
      quantity,
      price,
      stopPrice,
      status: 'NEW' as any,
      timeInForce: 'GTC' as any,
      timestamp: new Date(),
    };

    // Check risk limits
    const riskCheckPassed = await this.riskManager.checkOrderRisk(
      order,
      positions,
      balances
    );
    if (!riskCheckPassed) {
      const error = new Error(
        `Order rejected by risk manager: ${JSON.stringify(order)}`
      );
      this.logger.error('Order rejected by risk manager', error, { order });
      throw error;
    }

    // Find an available exchange to execute the order
    const exchange = this.findExchangeForSymbol(symbol);
    if (!exchange) {
      throw new Error(`No exchange available for symbol ${symbol}`);
    }

    try {
      // Execute the order
      const executedOrder = await exchange.createOrder(
        symbol,
        side,
        type,
        quantity,
        price,
        stopPrice,
        'GTC' as any,
        order.clientOrderId
      );

      this._eventBus.emitOrderCreated({
        order: executedOrder,
        timestamp: new Date(),
      });

      this.logger.logTrade('Order executed', { order: executedOrder });
      return executedOrder;
    } catch (error) {
      this.logger.error('Failed to execute order', error as Error, { order });
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
    signal: StrategyResult
  ): Promise<void> {
    if (signal.action === 'hold' || !signal.quantity) {
      return;
    }

    try {
      const orderType = signal.price ? OrderType.LIMIT : OrderType.MARKET;
      const side = signal.action === 'buy' ? OrderSide.BUY : OrderSide.SELL;

      await this.executeOrder(
        strategyName,
        symbol,
        side,
        signal.quantity,
        orderType,
        signal.price,
        signal.stopLoss
      );

      this.logger.logStrategy('Executed signal', {
        strategy: strategyName,
        symbol,
        action: signal.action,
        quantity: signal.quantity.toNumber(),
        price: signal.price?.toNumber(),
        confidence: signal.confidence,
        reason: signal.reason,
      });
    } catch (error) {
      this.logger.error(
        `Failed to execute strategy signal for ${strategyName}`,
        error as Error,
        {
          symbol,
          signal,
        }
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
        data as unknown as Record<string, unknown>
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
    // Listen for order updates
    exchange.on('order', (order: Order) => {
      switch (order.status) {
        case 'FILLED':
          this._eventBus.emitOrderFilled({ order, timestamp: new Date() });
          this.notifyStrategiesOrderFilled(order);
          break;
        case 'PARTIALLY_FILLED':
          this._eventBus.emitOrderPartiallyFilled({
            order,
            timestamp: new Date(),
          });
          break;
        case 'CANCELED':
          this._eventBus.emitOrderCancelled({ order, timestamp: new Date() });
          break;
        case 'REJECTED':
          this._eventBus.emitOrderRejected({ order, timestamp: new Date() });
          break;
      }
    });

    // Listen for market data
    exchange.on('ticker', (symbol: string, ticker: any) => {
      this._eventBus.emitTickerUpdate({
        symbol,
        ticker,
        timestamp: new Date(),
      });
      this.onMarketData(symbol, ticker);
    });

    exchange.on('orderbook', (symbol: string, orderbook: any) => {
      this._eventBus.emitOrderBookUpdate({
        symbol,
        orderbook,
        timestamp: new Date(),
      });
    });
  }

  private async notifyStrategiesOrderFilled(order: Order): Promise<void> {
    for (const [name, strategy] of this._strategies) {
      try {
        await strategy.onOrderFilled(order);
      } catch (error) {
        this.logger.error(
          `Error notifying strategy ${name} of order fill`,
          error as Error
        );
      }
    }
  }
}
