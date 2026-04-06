import { Decimal } from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';

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
  Trade,
  SymbolInfo,
} from '../types';
import { TradingEngine } from './TradingEngine';
import { PrecisionUtils } from '../utils/PrecisionUtils';

export interface PaperTradingConfig {
  sessionId: number;
  initialBalance: Decimal;
  commission: Decimal;
  slippage?: Decimal;
  enableSlippage?: boolean;
  enableLatency?: boolean;
  latencyMs?: number;
}

/**
 * Paper Trading Engine - Extends TradingEngine for simulated trading
 *
 * Key differences from live trading:
 * - Simulates order execution instead of calling exchange APIs
 * - Maintains virtual portfolio state
 * - Saves all data to dry run database tables
 * - Processes same real-time market data as live trading
 */
export class PaperTradingEngine extends TradingEngine implements ITradingEngine {
  private readonly paperConfig: PaperTradingConfig;
  private readonly paperOrders = new Map<string, Order>();
  private readonly paperTrades: Trade[] = [];
  private currentMarketPrices = new Map<string, Decimal>(); // symbol -> current price

  constructor(
    riskManager: IRiskManager,
    portfolioManager: IPortfolioManager, // Should be PaperPortfolioManager
    logger: ILogger,
    paperConfig: PaperTradingConfig,
    userId?: string,
    dataManager?: IDataManager,
  ) {
    super(riskManager, portfolioManager, logger, userId, dataManager);
    this.paperConfig = paperConfig;

    this.logger.info(
      `🎯 [PAPER_ENGINE] Initialized for session ${paperConfig.sessionId} with ${paperConfig.initialBalance.toString()} initial balance`,
    );
  }

  /**
   * Override executeOrder to simulate execution instead of calling exchange
   */
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
      clientOrderId: providedClientOrderId,
    } = params;

    if (!this.isRunning) {
      throw new Error('Paper trading engine is not running');
    }

    const strategy = this.getStrategy(strategyName);
    const exchangeConfig = strategy?.config?.exchange;

    // Get strategy metadata
    const strategyId =
      paramsStrategyId ?? strategy?.getStrategyId?.() ?? strategy?.config?.strategyId;
    const strategyType = strategy?.strategyType;
    const userDefinedName = strategy?.strategyName || strategy?.config?.strategyName;

    // For paper trading, we don't need a real exchange, but we validate the symbol
    const exchangeName = Array.isArray(exchangeConfig)
      ? exchangeConfig[0]
      : exchangeConfig || 'paper';

    try {
      // Get current market price for the symbol
      const currentPrice = this.getCurrentPrice(symbol);
      if (!currentPrice) {
        throw new Error(`No market price available for ${symbol}`);
      }

      // Apply precision (simulate exchange requirements)
      const symbolInfo = await this.getSimulatedSymbolInfo(symbol);
      let adjustedQuantity = PrecisionUtils.roundQuantity(
        quantity,
        symbolInfo.stepSize,
        symbolInfo.quantityPrecision,
      );

      // Validate quantity
      PrecisionUtils.validateQuantity(
        adjustedQuantity,
        symbolInfo.minQuantity,
        symbolInfo.maxQuantity,
        symbolInfo.stepSize,
      );

      // Determine execution price
      let executionPrice = currentPrice;
      if (type === OrderType.LIMIT && price) {
        // For limit orders, use the specified price
        executionPrice = PrecisionUtils.roundPrice(
          price,
          symbolInfo.tickSize,
          symbolInfo.pricePrecision,
        );
        PrecisionUtils.validatePrice(executionPrice, symbolInfo.tickSize);
      } else if (type === OrderType.MARKET) {
        // Apply slippage for market orders
        if (this.paperConfig.enableSlippage && this.paperConfig.slippage) {
          const slippageMultiplier =
            side === OrderSide.BUY
              ? new Decimal(1).add(this.paperConfig.slippage)
              : new Decimal(1).sub(this.paperConfig.slippage);
          executionPrice = currentPrice.mul(slippageMultiplier);
        }
      }

      // Validate notional value
      PrecisionUtils.validateNotional(
        adjustedQuantity,
        executionPrice,
        symbolInfo.minNotional,
      );

      // Generate client order ID
      const clientOrderId =
        providedClientOrderId || this.generateClientOrderId(strategyId);

      // Create order object
      const order: Order = {
        id: uuidv4(),
        clientOrderId,
        userId: this._userId,
        symbol,
        side,
        type,
        quantity: adjustedQuantity,
        price: type === OrderType.LIMIT ? executionPrice : undefined,
        status: OrderStatus.NEW,
        timeInForce: TimeInForce.GTC,
        timestamp: new Date(),
        exchange: exchangeName,
        strategyId,
        strategyType,
        strategyName: userDefinedName,
      };

      // Check risk limits
      const positions = await this.portfolioManager.getPositions();
      const balances = await this.portfolioManager.getBalances();

      const riskCheckPassed = await this.riskManager.checkOrderRisk(
        order,
        positions,
        balances,
      );

      if (!riskCheckPassed) {
        throw new Error(`Order rejected by risk manager: ${JSON.stringify(order)}`);
      }

      // Simulate order execution
      const executedOrder = await this.simulateOrderExecution(order, executionPrice);

      this.logger.info(
        `📝 [PAPER_ENGINE] Order executed: ${side} ${adjustedQuantity.toString()} ${symbol} @ ${executionPrice.toString()}`,
      );

      return executedOrder;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const rejectedOrder: Order = {
        id: uuidv4(),
        clientOrderId: providedClientOrderId || this.generateClientOrderId(strategyId),
        userId: this._userId,
        symbol,
        side,
        type,
        quantity,
        price,
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

      this.eventBus.emitOrderRejected({ order: rejectedOrder, timestamp: new Date() });
      this.logger.error('Failed to execute paper order', error as Error, { params });
      throw error;
    }
  }

  /**
   * Simulate order execution
   */
  private async simulateOrderExecution(
    order: Order,
    executionPrice: Decimal,
  ): Promise<Order> {
    // Add latency simulation if enabled
    if (this.paperConfig.enableLatency && this.paperConfig.latencyMs) {
      await this.sleep(this.paperConfig.latencyMs);
    }

    // Calculate commission
    const commission = executionPrice
      .mul(order.quantity)
      .mul(this.paperConfig.commission);

    // Create executed order
    const executedOrder: Order = {
      ...order,
      status: OrderStatus.FILLED,
      executedQuantity: order.quantity,
      cummulativeQuoteQuantity: executionPrice.mul(order.quantity),
      updateTime: new Date(),
      commission,
    };

    // Store order
    this.paperOrders.set(executedOrder.id, executedOrder);

    // Update portfolio
    await this.updatePortfolioFromExecution(executedOrder, executionPrice);

    // Create trade record
    const trade: Trade = {
      id: `${executedOrder.id}-${Date.now()}`,
      symbol: executedOrder.symbol,
      price: executionPrice,
      quantity: executedOrder.quantity,
      side: executedOrder.side === OrderSide.BUY ? 'buy' : 'sell',
      timestamp: executedOrder.updateTime || executedOrder.timestamp,
      exchange: 'paper',
      fee: commission,
    };

    this.paperTrades.push(trade);

    // Save to database
    await this.persistPaperOrder(executedOrder);
    await this.persistPaperTrade(trade);

    // Emit events (same as live trading)
    this.eventBus.emitOrderCreated({ order: executedOrder, timestamp: new Date() });
    this.eventBus.emitOrderFilled({ order: executedOrder, timestamp: new Date() });

    // Notify strategy
    const strategy = this.getStrategy(order.strategyName || '');
    if (strategy?.onOrderFilled) {
      await strategy.onOrderFilled(executedOrder);
    }
    if (strategy?.onTradeExecuted) {
      await strategy.onTradeExecuted(trade);
    }

    return executedOrder;
  }

  /**
   * Update portfolio after simulated execution
   */
  private async updatePortfolioFromExecution(
    order: Order,
    executionPrice: Decimal,
  ): Promise<void> {
    const { symbol, side, quantity } = order;
    const { base, quote } = this.parseSymbol(symbol);

    if (!base || !quote) {
      throw new Error(`Invalid symbol format: ${symbol}`);
    }

    const commission = executionPrice.mul(quantity).mul(this.paperConfig.commission);
    const totalCost = executionPrice.mul(quantity);

    // Cast to access PaperPortfolioManager specific methods
    const paperPortfolio = this.portfolioManager as any;

    if (side === OrderSide.BUY) {
      // Buy: Decrease quote currency, increase base currency
      await paperPortfolio.updateBalanceForAsset(quote, totalCost.add(commission).neg());
      await paperPortfolio.updateBalanceForAsset(base, quantity);

      // Update position
      await this.updatePaperPosition(symbol, quantity, executionPrice);
    } else {
      // Sell: Increase quote currency, decrease base currency
      await paperPortfolio.updateBalanceForAsset(quote, totalCost.sub(commission));
      await paperPortfolio.updateBalanceForAsset(base, quantity.neg());

      // Update position
      await this.updatePaperPosition(symbol, quantity.neg(), executionPrice);
    }
  }

  /**
   * Update position tracking
   */
  private async updatePaperPosition(
    symbol: string,
    quantityChange: Decimal,
    price: Decimal,
  ): Promise<void> {
    // Cast to access PaperPortfolioManager specific methods
    const paperPortfolio = this.portfolioManager as any;
    if (paperPortfolio.updatePaperPosition) {
      await paperPortfolio.updatePaperPosition(symbol, quantityChange, price);
    }
  }

  /**
   * Update current market price for a symbol
   */
  public updateMarketPrice(symbol: string, price: Decimal): void {
    this.currentMarketPrices.set(symbol, price);
  }

  /**
   * Get current market price for a symbol
   */
  private getCurrentPrice(symbol: string): Decimal | undefined {
    return this.currentMarketPrices.get(symbol);
  }

  /**
   * Override market data processing to update current prices
   */
  public async onTicker(
    symbol: string,
    ticker: any,
    exchangeName?: string,
  ): Promise<void> {
    // Update current price
    if (ticker.price) {
      this.updateMarketPrice(symbol, new Decimal(ticker.price));
    }

    // Call parent implementation for strategy processing
    await super.onTicker(symbol, ticker, exchangeName);
  }

  public async onKline(symbol: string, kline: any, exchangeName?: string): Promise<void> {
    // Update current price from kline close
    if (kline.close) {
      this.updateMarketPrice(symbol, new Decimal(kline.close));
    }

    // Call parent implementation for strategy processing
    await super.onKline(symbol, kline, exchangeName);
  }

  /**
   * Get simulated symbol info (for precision validation)
   */
  private async getSimulatedSymbolInfo(symbol: string): Promise<SymbolInfo> {
    // Return reasonable defaults for paper trading
    // In a real implementation, you might want to fetch this from an exchange
    return {
      symbol,
      nativeSymbol: symbol.replace('/', ''), // Convert BTC/USDT to BTCUSDT
      baseAsset: this.parseSymbol(symbol).base || '',
      quoteAsset: this.parseSymbol(symbol).quote || '',
      status: 'active',
      market: 'spot',
      minQuantity: new Decimal('0.001'),
      maxQuantity: new Decimal('1000000'),
      stepSize: new Decimal('0.001'),
      quantityPrecision: 3,
      tickSize: new Decimal('0.01'),
      pricePrecision: 2,
      minNotional: new Decimal('10'),
    };
  }

  /**
   * Parse symbol into base and quote assets
   */
  private parseSymbol(symbol: string): { base: string | null; quote: string | null } {
    const parts = symbol.split('/');
    if (parts.length === 2) {
      return { base: parts[0], quote: parts[1] };
    }
    return { base: null, quote: null };
  }

  /**
   * Generate client order ID for paper trading
   */
  private generateClientOrderId(strategyId?: number): string {
    const timestamp = Date.now();
    const idPart = strategyId ? String(strategyId) : 'paper';
    return `p${idPart}${timestamp}`.slice(0, 32);
  }

  /**
   * Sleep utility for latency simulation
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Persist paper order to database
   */
  private async persistPaperOrder(order: Order): Promise<void> {
    try {
      // TODO: Add saveDryRunOrders method to IDataManager
      // if (this._dataManager?.saveDryRunOrders) {
      //   await this._dataManager.saveDryRunOrders([{
      //     id: order.id,
      //     clientOrderId: order.clientOrderId,
      //     sessionId: this.paperConfig.sessionId,
      //     symbol: order.symbol,
      //     side: order.side,
      //     type: order.type,
      //     quantity: order.quantity,
      //     price: order.price,
      //     status: order.status,
      //     timeInForce: order.timeInForce,
      //     timestamp: order.timestamp,
      //     updateTime: order.updateTime,
      //     executedQuantity: order.executedQuantity,
      //     cummulativeQuoteQuantity: order.cummulativeQuoteQuantity,
      //     commission: order.commission,
      //   }]);
      // }
    } catch (error) {
      this.logger.error('Failed to persist paper order', error as Error);
    }
  }

  /**
   * Persist paper trade to database
   */
  private async persistPaperTrade(trade: Trade): Promise<void> {
    try {
      // TODO: Add saveDryRunTrades method to IDataManager
      // if (this._dataManager?.saveDryRunTrades) {
      //   await this._dataManager.saveDryRunTrades([{
      //     id: trade.id,
      //     sessionId: this.paperConfig.sessionId,
      //     symbol: trade.symbol,
      //     side: trade.side === 'buy' ? OrderSide.BUY : OrderSide.SELL,
      //     entryPrice: trade.price,
      //     exitPrice: trade.price,
      //     quantity: trade.quantity,
      //     entryTime: trade.timestamp,
      //     exitTime: trade.timestamp,
      //     pnl: new Decimal(0), // Will be calculated later
      //     commission: trade.fee || new Decimal(0),
      //     duration: 0,
      //   }]);
      // }
    } catch (error) {
      this.logger.error('Failed to persist paper trade', error as Error);
    }
  }

  /**
   * Get paper trading statistics
   */
  public async getPaperTradingStats(): Promise<{
    totalOrders: number;
    totalTrades: number;
    totalVolume: Decimal;
    totalCommission: Decimal;
    portfolio: any;
  }> {
    const portfolio = this.portfolioManager as any;
    const summary = portfolio.getSummary ? await portfolio.getSummary() : null;

    const totalVolume = this.paperTrades.reduce(
      (sum, trade) => sum.add(trade.price.mul(trade.quantity)),
      new Decimal(0),
    );

    const totalCommission = this.paperTrades.reduce(
      (sum, trade) => sum.add(trade.fee || new Decimal(0)),
      new Decimal(0),
    );

    return {
      totalOrders: this.paperOrders.size,
      totalTrades: this.paperTrades.length,
      totalVolume,
      totalCommission,
      portfolio: summary,
    };
  }

  /**
   * Reset paper trading state
   */
  public async resetPaperTrading(): Promise<void> {
    this.paperOrders.clear();
    this.paperTrades.length = 0;
    this.currentMarketPrices.clear();

    // Reset portfolio
    const portfolio = this.portfolioManager as any;
    if (portfolio.reset) {
      await portfolio.reset();
    }

    this.logger.info(
      `🔄 [PAPER_ENGINE] Reset paper trading state for session ${this.paperConfig.sessionId}`,
    );
  }
}
