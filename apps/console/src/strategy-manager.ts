import { TradingEngine, IStrategy, ILogger, EventBus } from '@itrade/core';
import { TypeOrmDataManager, StrategyStatus } from '@itrade/data-manager';
import { MovingAverageStrategy } from '@itrade/strategies';

interface StrategyMetrics {
  startTime: Date;
  totalSignals: number;
  totalOrders: number;
  lastSignalTime?: Date;
  lastOrderTime?: Date;
  errors: number;
}

export class StrategyManager {
  private strategies = new Map<number, { name: string; instance: IStrategy }>();
  private strategyMetrics = new Map<number, StrategyMetrics>();
  private syncInterval: NodeJS.Timeout | null = null;
  private reportInterval: NodeJS.Timeout | null = null;
  private eventBus: EventBus;
  
  // Configuration
  private readonly SYNC_INTERVAL_MS = 10000; // Sync every 10 seconds (configurable)
  private readonly REPORT_INTERVAL_MS = 60000; // Report every 60 seconds

  constructor(
    private engine: TradingEngine,
    private dataManager: TypeOrmDataManager,
    private logger: ILogger
  ) {
    this.eventBus = EventBus.getInstance();
  }

  async start(): Promise<void> {
    this.logger.info('Starting Strategy Manager...');

    // Load active strategies from database
    await this.loadActiveStrategies();

    // Setup event listeners for monitoring
    this.setupEventListeners();

    // Start periodic database sync
    this.syncInterval = setInterval(() => {
      this.syncStrategiesWithDatabase();
    }, this.SYNC_INTERVAL_MS);

    // Start periodic reporting
    this.reportInterval = setInterval(() => {
      this.reportStrategyMetrics();
    }, this.REPORT_INTERVAL_MS);

    this.logger.info(
      `Strategy Manager started (sync every ${this.SYNC_INTERVAL_MS / 1000}s, report every ${this.REPORT_INTERVAL_MS / 1000}s)`
    );
  }

  async stop(): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    if (this.reportInterval) {
      clearInterval(this.reportInterval);
      this.reportInterval = null;
    }

    // Final report before stopping
    this.reportStrategyMetrics();

    // Remove all strategies from engine
    for (const [strategyId] of this.strategies) {
      await this.removeStrategy(strategyId);
    }

    this.logger.info('Strategy Manager stopped');
  }

  private async loadActiveStrategies(): Promise<void> {
    try {
      const dbStrategies = await this.dataManager.getStrategies({
        status: StrategyStatus.ACTIVE,
      });

      this.logger.info(`Loading ${dbStrategies.length} active strategies...`);

      for (const dbStrategy of dbStrategies) {
        try {
          await this.addStrategy(dbStrategy.id);
        } catch (error) {
          this.logger.error(
            `Failed to load strategy ${dbStrategy.name}`,
            error as Error
          );
          // Mark strategy as error in database
          await this.dataManager.updateStrategyStatus(
            dbStrategy.id,
            StrategyStatus.ERROR,
            (error as Error).message
          );
        }
      }
    } catch (error) {
      this.logger.error('Failed to load active strategies', error as Error);
    }
  }

  /**
   * Sync strategies between database and TradeEngine
   * This method runs periodically to ensure TradeEngine matches database state:
   * - Adds strategies that are ACTIVE in DB but not in TradeEngine
   * - Removes strategies that are no longer ACTIVE (status changed to STOPPED/PAUSED/ERROR) or deleted
   */
  private async syncStrategiesWithDatabase(): Promise<void> {
    try {
      // Only fetch ACTIVE strategies from database (performance optimization)
      const activeStrategies = await this.dataManager.getStrategies({
        status: StrategyStatus.ACTIVE,
      });
      const activeStrategyIds = new Set(activeStrategies.map((s) => s.id));

      let addedCount = 0;
      let removedCount = 0;

      // Step 1: Add new ACTIVE strategies to TradeEngine
      for (const dbStrategy of activeStrategies) {
        if (!this.strategies.has(dbStrategy.id)) {
          this.logger.info(
            `🔄 [SYNC] Adding strategy to TradeEngine: ${dbStrategy.name} (ID: ${dbStrategy.id})`
          );
          try {
            await this.addStrategy(dbStrategy.id);
            addedCount++;
          } catch (error) {
            this.logger.error(
              `Failed to add strategy ${dbStrategy.id} during sync`,
              error as Error
            );
          }
        }
      }

      // Step 2: Remove strategies from TradeEngine if they're no longer ACTIVE
      // A strategy should be removed if it's not in the active list (status changed or deleted)
      for (const [id] of this.strategies) {
        if (!activeStrategyIds.has(id)) {
          const strategyName = this.strategies.get(id)?.name;
          this.logger.info(
            `🔄 [SYNC] Removing strategy from TradeEngine: ${strategyName} (ID: ${id}, Reason: Not ACTIVE or deleted)`
          );
          await this.removeStrategy(id);
          removedCount++;
        }
      }

      // Log sync summary if there were changes
      if (addedCount > 0 || removedCount > 0) {
        this.logger.info(
          `🔄 [SYNC] Complete: +${addedCount} added, -${removedCount} removed. Active in TradeEngine: ${this.strategies.size}`
        );
      }
    } catch (error) {
      this.logger.error('Error syncing strategies with database', error as Error);
    }
  }

  private async addStrategy(strategyId: number): Promise<void> {
    try {
      const dbStrategy = await this.dataManager.getStrategy(strategyId);
      if (!dbStrategy) {
        throw new Error(`Strategy ${strategyId} not found in database`);
      }

      // Create strategy instance based on type
      const strategy = this.createStrategyInstance(dbStrategy);

      // Generate unique name for engine
      const engineName = `strategy_${strategyId}`;

      // Add to engine
      await this.engine.addStrategy(engineName, strategy);

      // Track locally
      this.strategies.set(strategyId, {
        name: engineName,
        instance: strategy,
      });

      // Initialize metrics
      this.strategyMetrics.set(strategyId, {
        startTime: new Date(),
        totalSignals: 0,
        totalOrders: 0,
        errors: 0,
      });

      this.logger.info(`✅ Added strategy: ${dbStrategy.name} (ID: ${strategyId})`);
      // Use normalizedSymbol from database (auto-computed)
      const displaySymbol = (dbStrategy as any).normalizedSymbol || dbStrategy.symbol || 'N/A';
      this.logger.info(
        `   Type: ${dbStrategy.type}, Symbol: ${displaySymbol}, Exchange: ${dbStrategy.exchange || 'default'}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to add strategy ${strategyId}`,
        error as Error
      );
      throw error;
    }
  }

  private async removeStrategy(strategyId: number): Promise<void> {
    try {
      const strategy = this.strategies.get(strategyId);
      if (!strategy) return;

      // Get final metrics before removal
      const metrics = this.strategyMetrics.get(strategyId);
      if (metrics) {
        const runTime = Date.now() - metrics.startTime.getTime();
        const hours = (runTime / (1000 * 60 * 60)).toFixed(2);
        this.logger.info(
          `📊 Final metrics for ${strategy.name}: ${metrics.totalSignals} signals, ${metrics.totalOrders} orders in ${hours}h`
        );
      }

      // Remove from engine
      await this.engine.removeStrategy(strategy.name);

      // Remove from local tracking
      this.strategies.delete(strategyId);
      this.strategyMetrics.delete(strategyId);

      this.logger.info(`❌ Removed strategy: ${strategy.name} (ID: ${strategyId})`);
    } catch (error) {
      this.logger.error(
        `Failed to remove strategy ${strategyId}`,
        error as Error
      );
    }
  }

  private createStrategyInstance(dbStrategy: any): IStrategy {
    const { type, symbol, parameters, exchange } = dbStrategy;

    // Add subscription config to parameters if not present
    const fullParameters = {
      ...parameters,
      symbol,
      exchange,
      subscription: parameters?.subscription || {
        ticker: true,
        klines: true,
        method: 'rest', // Use REST polling by default
      },
    };

    // Create strategy based on type
    switch (type) {
      case 'moving_average':
        return new MovingAverageStrategy(fullParameters);

      // Add more strategy types as needed
      // case 'rsi':
      //   return new RSIStrategy(fullParameters);
      // case 'macd':
      //   return new MACDStrategy(fullParameters);

      default:
        throw new Error(`Unknown strategy type: ${type}`);
    }
  }

  private setupEventListeners(): void {
    // Listen for strategy signals
    this.eventBus.onStrategySignal((signal) => {
      // Extract strategy ID from strategy name (format: strategy_{id})
      const match = signal.strategyName.match(/^strategy_(\d+)$/);
      if (match) {
        const strategyId = parseInt(match[1]);
        const metrics = this.strategyMetrics.get(strategyId);
        if (metrics) {
          metrics.totalSignals++;
          metrics.lastSignalTime = new Date();
        }
      }
    });

    // Listen for order creation
    this.eventBus.onOrderCreated((data) => {
      // Extract strategy ID from clientOrderId (format: strategy_{id}_{timestamp})
      const match = data.order.clientOrderId?.match(/^strategy_(\d+)_/);
      if (match) {
        const strategyId = parseInt(match[1]);
        const metrics = this.strategyMetrics.get(strategyId);
        if (metrics) {
          metrics.totalOrders++;
          metrics.lastOrderTime = new Date();
        }
      }
    });
  }

  private reportStrategyMetrics(): void {
    if (this.strategies.size === 0) {
      return;
    }

    this.logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.info('📊 Strategy Performance Report');
    this.logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    for (const [strategyId, strategy] of this.strategies) {
      const metrics = this.strategyMetrics.get(strategyId);
      if (!metrics) continue;

      const runTime = Date.now() - metrics.startTime.getTime();
      const hours = (runTime / (1000 * 60 * 60)).toFixed(2);
      const minutes = (runTime / (1000 * 60)).toFixed(0);

      this.logger.info(`\n📈 ${strategy.name}:`);
      this.logger.info(`   Running for: ${hours}h (${minutes}m)`);
      this.logger.info(`   Signals generated: ${metrics.totalSignals}`);
      this.logger.info(`   Orders executed: ${metrics.totalOrders}`);
      
      if (metrics.lastSignalTime) {
        const lastSignalAgo = Math.round(
          (Date.now() - metrics.lastSignalTime.getTime()) / 1000
        );
        this.logger.info(`   Last signal: ${lastSignalAgo}s ago`);
      } else {
        this.logger.info(`   Last signal: None yet`);
      }

      if (metrics.lastOrderTime) {
        const lastOrderAgo = Math.round(
          (Date.now() - metrics.lastOrderTime.getTime()) / 1000
        );
        this.logger.info(`   Last order: ${lastOrderAgo}s ago`);
      } else {
        this.logger.info(`   Last order: None yet`);
      }

      if (metrics.errors > 0) {
        this.logger.info(`   ⚠️  Errors: ${metrics.errors}`);
      }

      // Get PnL data from database
      this.getPnLForStrategy(strategyId).catch((err) =>
        this.logger.error(`Failed to get PnL for strategy ${strategyId}`, err)
      );
    }

    this.logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }

  private async getPnLForStrategy(strategyId: number): Promise<void> {
    try {
      const pnl = await this.dataManager.getStrategyPnL(strategyId);
      this.logger.info(`   💰 Total PnL: ${pnl.totalPnl.toFixed(2)}`);
      this.logger.info(`   💵 Realized PnL: ${pnl.realizedPnl.toFixed(2)}`);
      this.logger.info(`   📊 Total Orders: ${pnl.totalOrders} (${pnl.filledOrders} filled)`);
    } catch (error) {
      // PnL data might not be available yet, that's ok
    }
  }

  getActiveStrategies(): Map<number, { name: string; instance: IStrategy }> {
    return new Map(this.strategies);
  }

  getStrategyMetrics(strategyId: number): StrategyMetrics | undefined {
    return this.strategyMetrics.get(strategyId);
  }
}

