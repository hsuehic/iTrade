import {
  TradingEngine,
  IStrategy,
  ILogger,
  EventBus,
  InitialDataConfig,
  createEmptyPerformance,
} from '@itrade/core';
import {
  TypeOrmDataManager,
  StrategyStatus,
  type StrategyEntity,
} from '@itrade/data-manager';
import {
  createStrategyInstance,
  getImplementedStrategies,
  StrategyImplementationInfo,
  type StrategyTypeKey,
} from '@itrade/strategies';

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
  private readonly SYNC_INTERVAL_MS: number;
  private readonly REPORT_INTERVAL_MS: number;

  constructor(
    private engine: TradingEngine,
    private dataManager: TypeOrmDataManager,
    private logger: ILogger,
    private userId?: string, // 🆕 Support multi-user system
  ) {
    this.eventBus = EventBus.getInstance();

    this.SYNC_INTERVAL_MS = StrategyManager.parseInterval(
      process.env.STRATEGY_SYNC_INTERVAL_MS,
      60000,
    );
    this.REPORT_INTERVAL_MS = StrategyManager.parseInterval(
      process.env.STRATEGY_REPORT_INTERVAL_MS,
      600000,
    );
  }

  async start(): Promise<void> {
    this.logger.info('Starting Strategy Manager...');

    // 🆕 Log user context
    if (this.userId) {
      this.logger.info(`👤 Loading strategies for user: ${this.userId}`);
    } else {
      this.logger.warn(
        '⚠️  No userId provided - loading ALL strategies (not recommended for production)',
      );
    }

    // 📊 显示策略实现统计信息
    const implementedStrategies = getImplementedStrategies();
    this.logger.info(
      `📈 Available strategy implementations: ${implementedStrategies.length}`,
    );
    implementedStrategies.forEach((strategy: StrategyImplementationInfo) => {
      this.logger.debug(`  ✅ ${strategy.name} (${strategy.type})`);
    });

    // Load active strategies from database
    await this.loadActiveStrategies();

    // Setup event listeners for monitoring
    this.setupEventListeners();

    // Start periodic database sync
    this.syncInterval = setInterval(() => {
      this.logger.info('Syncing strategies with database...');
      this.syncStrategiesWithDatabase().catch((error) => {
        this.logger.error('Error during strategy sync', error as Error);
      });
    }, this.SYNC_INTERVAL_MS);

    // Start periodic reporting
    this.reportInterval = setInterval(() => {
      this.reportStrategyMetrics();
    }, this.REPORT_INTERVAL_MS);

    this.logger.info(
      `Strategy Manager started (sync every ${this.SYNC_INTERVAL_MS / 1000}s, report every ${this.REPORT_INTERVAL_MS / 1000}s)`,
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
      // 🆕 Filter by userId if provided
      const dbStrategies = await this.dataManager.getStrategies({
        userId: this.userId,
        status: StrategyStatus.ACTIVE,
        includePerformance: true, // 🆕 Load performance metrics
      });

      this.logger.info(`Loading ${dbStrategies.length} active strategies...`);

      for (const dbStrategy of dbStrategies) {
        try {
          await this.addStrategy(dbStrategy);
        } catch (error) {
          this.logger.error(`Failed to load strategy ${dbStrategy.name}`, error as Error);
          // Mark strategy as error in database
          await this.dataManager.updateStrategyStatus(
            dbStrategy.id,
            StrategyStatus.ERROR,
            (error as Error).message,
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
      this.logger.info(`🔄 [SYNC] ━━━━━━━━━━━━ Starting Strategy Sync ━━━━━━━━━━━━`);

      // Only fetch ACTIVE strategies from database (performance optimization)
      // 🆕 Filter by userId if provided
      const activeStrategies = await this.dataManager.getStrategies({
        userId: this.userId,
        status: StrategyStatus.ACTIVE,
        includePerformance: true, // 🆕 Load performance metrics
      });
      const activeStrategyIds = new Set(activeStrategies.map((s) => s.id));

      this.logger.info(
        `🔄 [SYNC] Active strategies in DB: ${activeStrategies.length} (IDs: ${Array.from(activeStrategyIds).join(', ')})`,
      );
      this.logger.info(
        `🔄 [SYNC] Strategies in TradeEngine: ${this.strategies.size} (IDs: ${Array.from(this.strategies.keys()).join(', ')})`,
      );

      let addedCount = 0;
      let removedCount = 0;

      // Step 1: Add new ACTIVE strategies to TradeEngine
      this.logger.info(`🔄 [SYNC] Step 1: Checking for new strategies to add...`);
      for (const dbStrategy of activeStrategies) {
        if (!this.strategies.has(dbStrategy.id)) {
          this.logger.info(
            `🔄 [SYNC] Found new strategy to add: ${dbStrategy.name} (ID: ${dbStrategy.id}, Type: ${dbStrategy.type}, Symbol: ${dbStrategy.symbol})`,
          );
          try {
            await this.addStrategy(dbStrategy);
            addedCount++;
            this.logger.info(`✅ [SYNC] Successfully added strategy ${dbStrategy.id}`);
          } catch (error) {
            this.logger.error(
              `❌ [SYNC] Failed to add strategy ${dbStrategy.id} during sync`,
              error as Error,
            );
          }
        }
      }
      this.logger.info(`🔄 [SYNC] Step 1 complete: ${addedCount} strategies added`);

      // Step 2: Remove strategies from TradeEngine if they're no longer ACTIVE
      // A strategy should be removed if it's not in the active list (status changed or deleted)
      this.logger.info(`🔄 [SYNC] Step 2: Checking for strategies to remove...`);
      for (const [id] of this.strategies) {
        if (!activeStrategyIds.has(id)) {
          const strategyName = this.strategies.get(id)?.name;
          this.logger.info(
            `🔄 [SYNC] Found strategy to remove: ${strategyName} (ID: ${id}, Reason: Not ACTIVE or deleted)`,
          );
          await this.removeStrategy(id);
          removedCount++;
          this.logger.info(`✅ [SYNC] Successfully removed strategy ${id}`);
        }
      }
      this.logger.info(`🔄 [SYNC] Step 2 complete: ${removedCount} strategies removed`);

      // Log sync summary
      this.logger.info(`🔄 [SYNC] ━━━━━━━━━━━━ Sync Complete ━━━━━━━━━━━━`);
      this.logger.info(
        `🔄 [SYNC] Summary: +${addedCount} added, -${removedCount} removed. Active in TradeEngine: ${this.strategies.size}`,
      );

      if (addedCount === 0 && removedCount === 0) {
        this.logger.info(`🔄 [SYNC] No changes needed - all strategies in sync`);
      }
    } catch (error) {
      this.logger.error(
        '❌ [SYNC] Error syncing strategies with database',
        error as Error,
      );
    }
  }

  private async addStrategy(dbStrategy: StrategyEntity): Promise<void> {
    try {
      const strategyId = dbStrategy.id;
      //const dbStrategy = await this.dataManager.getStrategy(strategyId);

      this.logger.info(
        `🔧 [ADD_STRATEGY] Creating strategy instance: ${dbStrategy.name} (ID: ${strategyId})`,
      );

      // Create strategy instance based on type
      const strategy = this.createStrategyInstance(dbStrategy);

      // Generate unique name for engine
      const engineName = `strategy_${strategyId}`;

      // Add to engine
      this.logger.info(
        `🔧 [ADD_STRATEGY] Adding to TradingEngine: ${engineName} (engine running: ${this.engine.isRunning})`,
      );
      await this.engine.addStrategy(engineName, strategy);
      this.logger.info(
        `✅ [ADD_STRATEGY] Successfully added to TradingEngine: ${engineName}`,
      );

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
      const displaySymbol = dbStrategy.normalizedSymbol || dbStrategy.symbol || 'N/A';
      this.logger.info(
        `   Type: ${dbStrategy.type}, Symbol: ${displaySymbol}, Exchange: ${dbStrategy.exchange || 'default'}`,
      );
    } catch (error) {
      this.logger.error(`Failed to add strategy ${dbStrategy.id}`, error as Error);
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
          `📊 Final metrics for ${strategy.name}: ${metrics.totalSignals} signals, ${metrics.totalOrders} orders in ${hours}h`,
        );
      }

      // Remove from engine
      await this.engine.removeStrategy(strategy.name);

      // Remove from local tracking
      this.strategies.delete(strategyId);
      this.strategyMetrics.delete(strategyId);

      this.logger.info(`❌ Removed strategy: ${strategy.name} (ID: ${strategyId})`);
    } catch (error) {
      this.logger.error(`Failed to remove strategy ${strategyId}`, error as Error);
    }
  }

  private createStrategyInstance(dbStrategy: StrategyEntity): IStrategy {
    const subscription =
      dbStrategy.subscription || this.getDefaultSubscriptionConfig(dbStrategy.type);
    const initialDataConfig = this.getMergedInitialDataConfig(dbStrategy);

    this.logger.debug(
      `🔧 [CREATE_STRATEGY] Creating instance with config:
       - Type: ${dbStrategy.type}
       - Symbol: ${dbStrategy.symbol || 'N/A'}
       - Exchange: ${dbStrategy.exchange || 'N/A'}
       - Subscription: ${JSON.stringify(subscription)}
       - InitialData: ${JSON.stringify(initialDataConfig || 'N/A')}`,
    );

    // 🆕 Initialize performance from database entity or create empty
    let performance;
    if (dbStrategy.performance) {
      // Convert entity to StrategyPerformance
      const { entityToPerformance } = require('@itrade/data-manager');
      performance = entityToPerformance(
        dbStrategy.performance,
        dbStrategy.symbol || '',
        dbStrategy.exchange || '',
      );
    } else {
      // Create empty performance
      performance = createEmptyPerformance(
        dbStrategy.symbol || '',
        dbStrategy.exchange || '',
        dbStrategy.id,
        dbStrategy.name,
      );
    }

    return createStrategyInstance(
      dbStrategy.type as StrategyTypeKey,
      {
        symbol: dbStrategy.symbol || '',
        exchange: dbStrategy.exchange || '',
        parameters: dbStrategy.parameters,
        logger: this.logger,
        // 🆕 Use subscription configuration from database
        // If not set in database, use default based on strategy type
        subscription,
        // 🆕 Use initialData configuration from database
        // This is the historical data to fetch when strategy starts
        initialDataConfig,
        // 🆕 Performance tracking
        performance,
      },
      dbStrategy.id,
      dbStrategy.name,
    );
  }

  private getMergedInitialDataConfig(dbStrategy: StrategyEntity): InitialDataConfig {
    const defaultConfig = this.getDefaultInitialDataConfig(dbStrategy.type);
    const customConfig: InitialDataConfig = dbStrategy.initialDataConfig || {};
    const fetchOrderBook =
      customConfig.fetchOrderBook && 'enabled' in customConfig.fetchOrderBook
        ? customConfig.fetchOrderBook
        : defaultConfig.fetchOrderBook;

    return {
      ...defaultConfig,
      ...customConfig,
      fetchOrderBook,
      klines: customConfig.klines ?? defaultConfig.klines,
    };
  }

  private getDefaultInitialDataConfig(strategyType: string): InitialDataConfig {
    switch (strategyType) {
      case 'SingleLadderLifoTPStrategy':
        return {
          fetchPositions: true,
          fetchOpenOrders: true,
          fetchTicker: true,
        };
      case 'MovingWindowGridsStrategy':
        return {
          fetchPositions: true,
          fetchOpenOrders: true,
          fetchTicker: true,
        };
      default:
        return {};
    }
  }

  /**
   * Get default subscription configuration for a strategy type
   * Used as fallback when subscription is not configured in database
   * Different strategies require different market data types
   */
  private getDefaultSubscriptionConfig(strategyType: string): {
    ticker?: boolean;
    klines?:
      | boolean
      | {
          enabled: boolean;
          interval?: string;
          limit?: number;
        };
    trades?: boolean;
    orderbook?: boolean;
    method?: 'websocket' | 'rest' | 'auto';
  } {
    // Default configuration for strategies that use klines
    const klineBasedStrategies: string[] = [
      'MovingWindowGridsStrategy',
      'HammerChannelStrategy',
      // Add other kline-based strategies here
    ];

    // Default configuration for strategies that use ticker
    const tickerBasedStrategies: string[] = [
      // Add ticker-based strategies here
    ];

    if (klineBasedStrategies.includes(strategyType)) {
      this.logger.debug(
        `Using default kline subscription for ${strategyType} (not configured in database)`,
      );
      return {
        ticker: false,
        klines: {
          enabled: true,
          interval: '1m', // Subscribe to 1-minute klines
          limit: 1,
        },
        trades: false,
        orderbook: false,
        method: 'websocket', // Use WebSocket for real-time updates
      };
    } else if (tickerBasedStrategies.includes(strategyType)) {
      this.logger.debug(
        `Using default ticker subscription for ${strategyType} (not configured in database)`,
      );
      return {
        ticker: true,
        klines: false,
        trades: false,
        orderbook: false,
        method: 'websocket',
      };
    } else {
      // Default: subscribe to ticker for unknown strategies
      this.logger.warn(
        `Unknown strategy type ${strategyType}, using default ticker subscription (should configure in database)`,
      );
      return {
        ticker: true,
        klines: false,
        trades: false,
        orderbook: false,
        method: 'websocket',
      };
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

      this.logger.info(`\\n📈 ${strategy.name}:`);
      this.logger.info(`   Running for: ${hours}h (${minutes}m)`);
      this.logger.info(`   Signals generated: ${metrics.totalSignals}`);
      this.logger.info(`   Orders executed: ${metrics.totalOrders}`);

      // 🆕 Get performance summary from strategy instance
      try {
        const perfSummary = strategy.instance.getPerformanceSummary?.();
        if (perfSummary) {
          this.logger.info(`   📊 Performance Summary:`);
          this.logger.info(`      Total Orders: ${perfSummary.totalOrders}`);
          this.logger.info(`      Filled Orders: ${perfSummary.filledOrders}`);
          this.logger.info(`      Pending Orders: ${perfSummary.pendingOrders}`);
          this.logger.info(`      Total PnL: ${perfSummary.totalPnL}`);
          this.logger.info(`      Win Rate: ${perfSummary.winRate}`);
          this.logger.info(`      Total Volume: ${perfSummary.totalVolume}`);
          this.logger.info(`      Current Position: ${perfSummary.currentPosition}`);
        }
      } catch (error) {
        this.logger.debug(`   Could not get performance summary: ${error}`);
      }

      if (metrics.lastSignalTime) {
        const lastSignalAgo = Math.round(
          (Date.now() - metrics.lastSignalTime.getTime()) / 1000,
        );
        this.logger.info(`   Last signal: ${lastSignalAgo}s ago`);
      } else {
        this.logger.info(`   Last signal: None yet`);
      }

      if (metrics.lastOrderTime) {
        const lastOrderAgo = Math.round(
          (Date.now() - metrics.lastOrderTime.getTime()) / 1000,
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
        this.logger.error(`Failed to get PnL for strategy ${strategyId}`, err),
      );
    }

    this.logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }

  private async getPnLForStrategy(strategyId: number): Promise<void> {
    try {
      const pnl = await this.dataManager.getStrategyPnL(strategyId);
      this.logger.info(`   💰 Total PnL: ${pnl.totalPnl.toFixed(2)}`);
      this.logger.info(`   💵 Realized PnL: ${pnl.realizedPnl.toFixed(2)}`);
      this.logger.info(
        `   📊 Total Orders: ${pnl.totalOrders} (${pnl.filledOrders} filled)`,
      );
    } catch {
      // PnL data might not be available yet, that's ok
    }
  }

  getActiveStrategies(): Map<number, { name: string; instance: IStrategy }> {
    return new Map(this.strategies);
  }

  getStrategyMetrics(strategyId: number): StrategyMetrics | undefined {
    return this.strategyMetrics.get(strategyId);
  }

  private static parseInterval(value: string | undefined, fallbackMs: number): number {
    const parsed = Number.parseInt(value ?? '', 10);
    if (Number.isNaN(parsed) || parsed < 1000) {
      return fallbackMs;
    }
    return parsed;
  }
}
