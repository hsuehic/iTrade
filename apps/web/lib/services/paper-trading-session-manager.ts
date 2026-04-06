import { Decimal } from 'decimal.js';
import {
  PaperTradingEngine,
  ConsoleLogger,
  LogLevel,
  OrderSide,
  OrderType,
  TradeMode,
} from '@itrade/core';
import { PaperPortfolioManager } from '@itrade/portfolio-manager';
import { RiskManager } from '@itrade/risk-manager';
import {
  TypeOrmDataManager,
  DryRunSessionEntity,
  DryRunStatus,
  StrategyEntity,
} from '@itrade/data-manager';
import {
  BinanceExchange,
  CoinbaseExchange,
  OKXExchange,
} from '@itrade/exchange-connectors';

export interface ManualOrderParams {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: string | number;
  price?: string | number;
  tradeMode?: TradeMode;
  leverage?: number;
}

export interface SessionStats {
  totalOrders: number;
  totalTrades: number;
  totalVolume: string;
  totalCommission: string;
  currentValue: string;
  pnl: string;
  pnlPercent: string;
}

/**
 * Paper Trading Session Manager
 * Manages the lifecycle of paper trading sessions and engines
 */
export class PaperTradingSessionManager {
  private activeSessions = new Map<number, PaperTradingEngine>();
  private logger = new ConsoleLogger(LogLevel.INFO);

  constructor(private readonly dataManager: TypeOrmDataManager) {}

  /**
   * Start a paper trading session
   */
  async startSession(sessionId: number, userId: string): Promise<void> {
    if (this.activeSessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} is already running`);
    }

    try {
      // Load session configuration from database
      const session = await this.loadSession(sessionId, userId);

      // Create paper portfolio manager
      const paperPortfolio = new PaperPortfolioManager(
        {
          initialBalance: session.initialBalance,
          initialAsset: 'USDT',
          sessionId,
          userId,
        },
        this.dataManager,
        this.logger,
      );

      // Create risk manager with reasonable defaults
      const riskManager = new RiskManager({
        maxDrawdown: new Decimal(50), // 50% max drawdown for paper trading
        maxPositionSize: new Decimal(100), // 100% of portfolio in single position
        maxDailyLoss: new Decimal(20), // 20% daily loss limit
      });

      // Create paper trading engine
      const paperEngine = new PaperTradingEngine(
        riskManager,
        paperPortfolio,
        this.logger,
        {
          sessionId,
          initialBalance: session.initialBalance,
          commission: session.commission,
          slippage: session.slippage,
          enableSlippage: true,
          enableLatency: false, // Disable for faster execution
        },
        userId,
        this.dataManager,
      );

      // Add exchanges for market data
      await this.setupExchanges(paperEngine);

      // Load and add strategy if specified
      if (session.strategy) {
        await this.loadStrategy(paperEngine, session.strategy, session);
      }

      // Start the engine
      await paperEngine.start();

      // Store active session
      this.activeSessions.set(sessionId, paperEngine);

      // Update session status to running
      await this.updateSessionStatus(sessionId, DryRunStatus.RUNNING);

      this.logger.info(
        `🚀 [PAPER_SESSION] Started session ${sessionId} for user ${userId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to start paper trading session ${sessionId}`,
        error as Error,
      );

      // Update session status to failed
      await this.updateSessionStatus(sessionId, DryRunStatus.FAILED);
      throw error;
    }
  }

  /**
   * Stop a paper trading session
   */
  async stopSession(sessionId: number): Promise<void> {
    const engine = this.activeSessions.get(sessionId);
    if (!engine) {
      throw new Error(`Session ${sessionId} is not running`);
    }

    try {
      // Stop the engine
      await engine.stop();

      // Calculate final results
      await this.calculateAndSaveResults(sessionId, engine);

      // Remove from active sessions
      this.activeSessions.delete(sessionId);

      // Update session status to completed
      await this.updateSessionStatus(sessionId, DryRunStatus.COMPLETED);

      this.logger.info(`🛑 [PAPER_SESSION] Stopped session ${sessionId}`);
    } catch (error) {
      this.logger.error(
        `Failed to stop paper trading session ${sessionId}`,
        error as Error,
      );

      // Update session status to failed
      await this.updateSessionStatus(sessionId, DryRunStatus.FAILED);
      throw error;
    }
  }

  /**
   * Execute manual order in paper trading session
   */
  async executeManualOrder(
    sessionId: number,
    orderParams: ManualOrderParams,
  ): Promise<any> {
    const engine = this.activeSessions.get(sessionId);
    if (!engine) {
      throw new Error(`Session ${sessionId} is not running`);
    }

    try {
      const order = await engine.executeOrder({
        strategyName: 'manual',
        symbol: orderParams.symbol,
        side: orderParams.side,
        quantity: new Decimal(orderParams.quantity),
        type: orderParams.type,
        price: orderParams.price ? new Decimal(orderParams.price) : undefined,
        tradeMode: orderParams.tradeMode,
        leverage: orderParams.leverage,
      });

      this.logger.info(
        `📝 [PAPER_SESSION] Manual order executed in session ${sessionId}: ${orderParams.side} ${orderParams.quantity} ${orderParams.symbol}`,
      );

      return order;
    } catch (error) {
      this.logger.error(
        `Failed to execute manual order in session ${sessionId}`,
        error as Error,
      );
      throw error;
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStats(sessionId: number): Promise<SessionStats> {
    const engine = this.activeSessions.get(sessionId);
    if (!engine) {
      throw new Error(`Session ${sessionId} is not running`);
    }

    const stats = await engine.getPaperTradingStats();

    return {
      totalOrders: stats.totalOrders,
      totalTrades: stats.totalTrades,
      totalVolume: stats.totalVolume.toString(),
      totalCommission: stats.totalCommission.toString(),
      currentValue: stats.portfolio?.totalValue?.toString() || '0',
      pnl: stats.portfolio?.pnl?.toString() || '0',
      pnlPercent: stats.portfolio?.pnlPercent?.toString() || '0',
    };
  }

  /**
   * Get session engine (for advanced operations)
   */
  getSessionEngine(sessionId: number): PaperTradingEngine | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Check if session is running
   */
  isSessionRunning(sessionId: number): boolean {
    return this.activeSessions.has(sessionId);
  }

  /**
   * Get all active session IDs
   */
  getActiveSessionIds(): number[] {
    return Array.from(this.activeSessions.keys());
  }

  /**
   * Stop all active sessions (for cleanup)
   */
  async stopAllSessions(): Promise<void> {
    const sessionIds = this.getActiveSessionIds();

    await Promise.all(
      sessionIds.map((sessionId) =>
        this.stopSession(sessionId).catch((error) =>
          this.logger.error(`Failed to stop session ${sessionId}`, error as Error),
        ),
      ),
    );
  }

  /**
   * Load session configuration from database
   */
  private async loadSession(
    sessionId: number,
    userId: string,
  ): Promise<DryRunSessionEntity> {
    const sessionRepo = this.dataManager.dataSource.getRepository(DryRunSessionEntity);
    const session = await sessionRepo.findOne({
      where: { id: sessionId, userId },
      relations: ['strategy'],
    });

    if (!session) {
      throw new Error(`Session ${sessionId} not found for user ${userId}`);
    }

    if (session.status === DryRunStatus.RUNNING) {
      throw new Error(`Session ${sessionId} is already running`);
    }

    return session;
  }

  /**
   * Setup exchanges for market data
   */
  private async setupExchanges(engine: PaperTradingEngine): Promise<void> {
    try {
      // Add Binance for market data (no credentials needed for public data)
      const binance = new BinanceExchange(false); // mainnet for real data
      await binance.connect({ apiKey: '', secretKey: '', sandbox: false });
      await engine.addExchange('binance', binance);

      this.logger.info('📡 [PAPER_SESSION] Connected to Binance for market data');
    } catch (error) {
      this.logger.warn('Failed to connect to Binance for market data', error as Error);
    }

    try {
      // Add OKX for market data
      const okx = new OKXExchange(false);
      await okx.connect({ apiKey: '', secretKey: '', passphrase: '', sandbox: false });
      await engine.addExchange('okx', okx);

      this.logger.info('📡 [PAPER_SESSION] Connected to OKX for market data');
    } catch (error) {
      this.logger.warn('Failed to connect to OKX for market data', error as Error);
    }
  }

  /**
   * Load strategy into paper trading engine
   */
  private async loadStrategy(
    engine: PaperTradingEngine,
    strategy: StrategyEntity,
    session: DryRunSessionEntity,
  ): Promise<void> {
    try {
      // TODO: Implement strategy loading based on strategy type
      // This would require importing the actual strategy classes
      // For now, we'll just log that a strategy should be loaded

      this.logger.info(
        `📋 [PAPER_SESSION] Strategy ${strategy.name} (${strategy.type}) should be loaded for session ${session.id}`,
      );

      // In a full implementation, you would:
      // 1. Import the strategy class based on strategy.type
      // 2. Create strategy instance with strategy.parameters
      // 3. Add strategy to engine: await engine.addStrategy(strategy.name, strategyInstance)
    } catch (error) {
      this.logger.error(`Failed to load strategy ${strategy.name}`, error as Error);
      throw error;
    }
  }

  /**
   * Update session status in database
   */
  private async updateSessionStatus(
    sessionId: number,
    status: DryRunStatus,
  ): Promise<void> {
    const sessionRepo = this.dataManager.dataSource.getRepository(DryRunSessionEntity);
    await sessionRepo.update(sessionId, {
      status,
      endTime:
        status === DryRunStatus.COMPLETED || status === DryRunStatus.FAILED
          ? new Date()
          : undefined,
    });
  }

  /**
   * Calculate and save final results
   */
  private async calculateAndSaveResults(
    sessionId: number,
    engine: PaperTradingEngine,
  ): Promise<void> {
    try {
      const stats = await engine.getPaperTradingStats();

      if (stats.portfolio && this.dataManager.saveDryRunResult) {
        await this.dataManager.saveDryRunResult(sessionId, {
          totalReturn: stats.portfolio.pnlPercent?.div(100) || new Decimal(0),
          annualizedReturn: new Decimal(0), // TODO: Calculate based on session duration
          sharpeRatio: new Decimal(0), // TODO: Calculate from trade history
          maxDrawdown: new Decimal(0), // TODO: Calculate from equity curve
          winRate: new Decimal(0), // TODO: Calculate from trades
          profitFactor: new Decimal(0), // TODO: Calculate from trades
          totalTrades: stats.totalTrades,
          avgTradeDuration: 0, // TODO: Calculate from trades
          equity: [], // TODO: Build equity curve
          trades: [], // TODO: Convert paper trades to result format
        });
      }

      this.logger.info(`💾 [PAPER_SESSION] Saved results for session ${sessionId}`);
    } catch (error) {
      this.logger.error(
        `Failed to save results for session ${sessionId}`,
        error as Error,
      );
    }
  }
}
