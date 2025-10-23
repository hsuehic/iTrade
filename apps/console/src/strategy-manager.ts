import {
  TradingEngine,
  IStrategy,
  ILogger,
  EventBus,
  type StrategyTypeKey,
  StrategyStateManager,
  StrategyStateMonitor,
  TypeOrmStrategyStateAdapter,
  type StateRecoveryMetrics,
  type StrategyHealthStatus,
} from '@itrade/core';
import { TypeOrmDataManager, StrategyStatus } from '@itrade/data-manager';
import {
  createStrategyInstance,
  getImplementedStrategies,
  StrategyImplementationInfo,
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
  private stateBackupInterval: NodeJS.Timeout | null = null;
  private eventBus: EventBus;
  private stateManager: StrategyStateManager;
  private stateMonitor: StrategyStateMonitor;

  // Configuration
  private readonly SYNC_INTERVAL_MS = 600000; // Sync every 10 seconds (configurable)
  private readonly REPORT_INTERVAL_MS = 600000; // Report every 60 seconds
  private readonly STATE_BACKUP_INTERVAL_MS = 60000; // Backup state every 30 seconds

  constructor(
    private engine: TradingEngine,
    private dataManager: TypeOrmDataManager,
    private logger: ILogger,
  ) {
    this.eventBus = EventBus.getInstance();
    const stateAdapter = new TypeOrmStrategyStateAdapter(dataManager);
    this.stateManager = new StrategyStateManager(stateAdapter, logger);
    this.stateMonitor = new StrategyStateMonitor(logger);
    this.setupMonitoringEvents();
  }

  async start(): Promise<void> {
    this.logger.info('Starting Strategy Manager...');

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

    // Start state monitoring
    this.stateMonitor.start();

    // Start periodic database sync
    this.syncInterval = setInterval(() => {
      this.syncStrategiesWithDatabase();
    }, this.SYNC_INTERVAL_MS);

    // Start periodic reporting
    this.reportInterval = setInterval(() => {
      this.reportStrategyMetrics();
    }, this.REPORT_INTERVAL_MS);

    // Start periodic state backup
    this.stateBackupInterval = setInterval(() => {
      this.backupStrategyStates();
    }, this.STATE_BACKUP_INTERVAL_MS);

    this.logger.info(
      `Strategy Manager started (sync every ${this.SYNC_INTERVAL_MS / 1000}s, report every ${this.REPORT_INTERVAL_MS / 1000}s, backup every ${this.STATE_BACKUP_INTERVAL_MS / 1000}s)`,
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

    if (this.stateBackupInterval) {
      clearInterval(this.stateBackupInterval);
      this.stateBackupInterval = null;
    }

    // Final report before stopping
    this.reportStrategyMetrics();

    // Final state backup before stopping
    await this.backupStrategyStates();

    // Stop state monitoring
    this.stateMonitor.stop();

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
      // Only fetch ACTIVE strategies from database (performance optimization)
      const activeStrategies = await this.dataManager.getStrategies({
        status: StrategyStatus.ACTIVE,
      });
      const activeStrategyIds = new Set(activeStrategies.map((s) => s.id));
      this.logger.info(
        `🔄 [SYNC] Active strategies: ${JSON.stringify(activeStrategyIds, null, 2)}`,
      );

      let addedCount = 0;
      let removedCount = 0;

      // Step 1: Add new ACTIVE strategies to TradeEngine
      for (const dbStrategy of activeStrategies) {
        if (!this.strategies.has(dbStrategy.id)) {
          this.logger.info(
            `🔄 [SYNC] Adding strategy to TradeEngine: ${dbStrategy.name} (ID: ${dbStrategy.id})`,
          );
          try {
            await this.addStrategy(dbStrategy.id);
            addedCount++;
          } catch (error) {
            this.logger.error(
              `Failed to add strategy ${dbStrategy.id} during sync`,
              error as Error,
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
            `🔄 [SYNC] Removing strategy from TradeEngine: ${strategyName} (ID: ${id}, Reason: Not ACTIVE or deleted)`,
          );
          await this.removeStrategy(id);
          removedCount++;
        }
      }

      // Log sync summary if there were changes
      if (addedCount > 0 || removedCount > 0) {
        this.logger.info(
          `🔄 [SYNC] Complete: +${addedCount} added, -${removedCount} removed. Active in TradeEngine: ${this.strategies.size}`,
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

      // 🔄 State Recovery: Attempt to recover strategy state from database
      const recoveryStartTime = new Date();
      this.stateMonitor.recordRecoveryAttempt(strategyId, recoveryStartTime);

      try {
        const recoveryResult = await this.stateManager.recoverStrategyState(strategyId);
        const recoveryEndTime = new Date();

        if (recoveryResult.recovered) {
          this.stateMonitor.recordRecoverySuccess(
            strategyId,
            recoveryStartTime,
            recoveryEndTime,
          );

          this.logger.info(
            `🔄 Strategy state recovered for ${dbStrategy.name} (ID: ${strategyId})`,
          );

          if (recoveryResult.warnings && recoveryResult.warnings.length > 0) {
            recoveryResult.warnings.forEach((warning) => {
              this.logger.warn(`⚠️  Recovery warning: ${warning}`);
            });
          }
        } else {
          this.stateMonitor.recordRecoverySuccess(
            strategyId,
            recoveryStartTime,
            recoveryEndTime,
          );

          this.logger.info(
            `🆕 No previous state found for ${dbStrategy.name} (ID: ${strategyId}) - starting fresh`,
          );
        }

        // Log recovery metrics
        if (recoveryResult.metrics) {
          const { savedStates, openOrders, totalPosition } = recoveryResult.metrics;
          this.logger.debug(
            `📊 Recovery metrics - States: ${savedStates}, Open Orders: ${openOrders}, Position: ${totalPosition}`,
          );
        }
      } catch (recoveryError) {
        this.stateMonitor.recordRecoveryFailure(
          strategyId,
          (recoveryError as Error).message,
        );

        this.logger.error(
          `❌ State recovery failed for strategy ${strategyId}: ${(recoveryError as Error).message}`,
        );
        this.logger.warn('🔄 Strategy will start with fresh state');

        // Emit recovery failure event for monitoring
        this.eventBus.emit('strategyRecoveryFailed', {
          strategyId,
          strategyName: dbStrategy.name,
          error: (recoveryError as Error).message,
        });
      }

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
      const displaySymbol =
        (dbStrategy as any).normalizedSymbol || dbStrategy.symbol || 'N/A';
      this.logger.info(
        `   Type: ${dbStrategy.type}, Symbol: ${displaySymbol}, Exchange: ${dbStrategy.exchange || 'default'}`,
      );
    } catch (error) {
      this.logger.error(`Failed to add strategy ${strategyId}`, error as Error);
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

  private createStrategyInstance(dbStrategy: any): IStrategy {
    const { type, symbol, parameters, exchange } = dbStrategy;

    return createStrategyInstance(
      type as StrategyTypeKey,
      parameters, // 用户自定义参数
      {
        symbol,
        exchange,
        logger: this.logger,
      },
    );
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
    } catch (_error) {
      // PnL data might not be available yet, that's ok
    }
  }

  getActiveStrategies(): Map<number, { name: string; instance: IStrategy }> {
    return new Map(this.strategies);
  }

  getStrategyMetrics(strategyId: number): StrategyMetrics | undefined {
    return this.strategyMetrics.get(strategyId);
  }

  /**
   * Backup strategy states for all active strategies
   */
  private async backupStrategyStates(): Promise<void> {
    if (this.strategies.size === 0) {
      return; // No strategies to backup
    }

    let successCount = 0;
    let errorCount = 0;

    for (const [strategyId, { instance }] of this.strategies) {
      try {
        await this.stateManager.saveStrategyState(strategyId, await instance.saveState());
        this.stateMonitor.recordBackupSuccess(strategyId);
        successCount++;
      } catch (error) {
        this.stateMonitor.recordBackupFailure(strategyId, (error as Error).message);
        errorCount++;
        this.logger.error(
          `Failed to backup state for strategy ${strategyId}: ${(error as Error).message}`,
        );

        // Emit backup failure event for monitoring
        this.eventBus.emit('strategyBackupFailed', {
          strategyId,
          error: (error as Error).message,
        });
      }
    }

    if (successCount > 0) {
      this.logger.debug(
        `💾 Strategy state backup completed: ${successCount} successful, ${errorCount} failed`,
      );
    }

    if (errorCount > 0) {
      this.logger.warn(
        `⚠️  Strategy state backup had ${errorCount} failures out of ${this.strategies.size} strategies`,
      );
    }
  }

  /**
   * Setup monitoring event listeners
   */
  private setupMonitoringEvents(): void {
    // Setup state manager event listeners
    this.stateManager.on('dataInconsistency', (data) => {
      this.stateMonitor.recordDataInconsistency(data.strategyId, data.details);
    });

    // Setup state monitor alert listeners
    this.stateMonitor.on('alert', (alert) => {
      this.handleMonitoringAlert(alert);
    });

    // Setup strategy event listeners for monitoring
    this.eventBus.on('strategyRecoveryFailed', (data) => {
      this.logger.error(
        `🚨 Strategy recovery failed: ${data.strategyName} (ID: ${data.strategyId})`,
      );
    });

    this.eventBus.on('strategyBackupFailed', (data) => {
      this.stateMonitor.recordBackupFailure(data.strategyId, data.error);
    });
  }

  /**
   * Handle monitoring alerts
   */
  private handleMonitoringAlert(alert: any): void {
    const { type, strategyId } = alert;

    switch (type) {
      case 'excessive_failures':
        this.logger.error(
          `🚨 CRITICAL: Strategy ${strategyId} has ${alert.failures} recovery failures (threshold: ${alert.threshold})`,
        );
        // Could integrate with external alerting system here
        break;

      case 'slow_recovery':
        this.logger.warn(
          `⚠️  PERFORMANCE: Strategy ${strategyId} recovery took ${alert.recoveryTime}ms (threshold: ${alert.threshold}ms)`,
        );
        break;

      case 'state_corruption':
        this.logger.error(
          `🚨 CORRUPTION: Strategy ${strategyId} state corruption detected: ${alert.details}`,
        );
        break;

      case 'data_inconsistency':
        this.logger.warn(
          `⚠️  INCONSISTENCY: Strategy ${strategyId} data inconsistency: ${alert.details}`,
        );
        break;

      default:
        this.logger.warn(`🚨 UNKNOWN ALERT [${type}]: Strategy ${strategyId}`, alert);
    }
  }

  /**
   * Get monitoring health report
   */
  public getHealthReport(): {
    overall: {
      totalStrategies: number;
      healthyStrategies: number;
      unhealthyStrategies: number;
      successRate: number;
    };
    metrics: StateRecoveryMetrics;
    strategies: StrategyHealthStatus[];
  } {
    return this.stateMonitor.generateHealthReport();
  }

  /**
   * Get monitoring metrics
   */
  public getMonitoringMetrics(): StateRecoveryMetrics {
    return this.stateMonitor.getMetrics();
  }
}
