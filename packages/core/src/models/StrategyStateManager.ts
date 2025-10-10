/**
 * 策略状态管理器
 *
 * 负责策略运行状态的持久化和恢复，确保应用重启后策略能完整恢复运行状态
 */

import { EventEmitter } from 'events';

import { Decimal } from 'decimal.js';

import type { ILogger } from '../interfaces';
import { OrderStatus } from '../types';

// 策略状态数据结构
export interface StrategyState {
  strategyId: number;
  internalState: Record<string, unknown>; // 策略内部状态
  indicatorData: Record<string, unknown>; // 技术指标历史数据
  lastSignal?: string; // 最后交易信号
  signalTime?: Date; // 信号时间
  currentPosition: string; // 当前持仓（Decimal字符串）
  averagePrice?: string; // 持仓均价（Decimal字符串）
  lastUpdateTime: Date; // 最后更新时间
}

// 订单恢复信息
export interface OrderRecoveryInfo {
  orderId: string;
  status: OrderStatus;
  executedQuantity: string;
  remainingQuantity: string;
  averagePrice?: string;
  lastUpdateTime: Date;
}

// 策略恢复结果
export interface StrategyRecoveryResult {
  strategyId: number;
  success: boolean;
  recovered: boolean; // 是否成功恢复状态
  recoveredState?: StrategyState;
  openOrders: OrderRecoveryInfo[];
  partialOrders: OrderRecoveryInfo[];
  totalPosition: string;
  unrealizedPnl?: string;
  warnings?: string[]; // 警告信息数组
  issues: Array<{
    type: 'warning' | 'error' | 'info';
    message: string;
    timestamp: Date;
  }>;
  metrics?: {
    savedStates: number;
    openOrders: number;
    totalPosition: string;
  };
  recoveryTime: number; // 恢复耗时(ms)
}

// 数据管理器接口
export interface IStrategyStateManager {
  saveStrategyState(
    strategyId: number,
    state: Partial<StrategyState>
  ): Promise<void>;
  getStrategyState(strategyId: number): Promise<StrategyState | null>;
  deleteStrategyState(strategyId: number): Promise<void>;
  getOrdersByStrategy(strategyId: number): Promise<OrderRecoveryInfo[]>;
  syncOrderWithExchange(
    orderId: string,
    exchangeName: string
  ): Promise<OrderRecoveryInfo>;
}

export class StrategyStateManager extends EventEmitter {
  private stateCache = new Map<number, StrategyState>();
  private recoveryInProgress = new Set<number>();

  constructor(
    private dataManager: IStrategyStateManager,
    private logger: ILogger,
    private config: {
      autosaveInterval?: number; // 自动保存间隔(ms)
      cacheTimeout?: number; // 缓存超时(ms)
      maxRecoveryTime?: number; // 最大恢复时间(ms)
    } = {}
  ) {
    super();

    // 设置默认配置
    this.config = {
      autosaveInterval: 30000, // 30秒自动保存
      cacheTimeout: 300000, // 5分钟缓存
      maxRecoveryTime: 60000, // 60秒最大恢复时间
      ...config,
    };

    // 启动自动保存
    if (this.config.autosaveInterval) {
      this.startAutosave();
    }
  }

  /**
   * 保存策略状态
   */
  async saveStrategyState(
    strategyId: number,
    partialState: Partial<StrategyState>
  ): Promise<void> {
    try {
      const currentState = this.stateCache.get(strategyId) || {
        strategyId,
        internalState: {},
        indicatorData: {},
        currentPosition: '0',
        lastUpdateTime: new Date(),
      };

      const newState: StrategyState = {
        ...currentState,
        ...partialState,
        strategyId,
        lastUpdateTime: new Date(),
      };

      // 更新缓存
      this.stateCache.set(strategyId, newState);

      // 持久化到数据库
      await this.dataManager.saveStrategyState(strategyId, newState);

      this.emit('stateSaved', { strategyId, state: newState });

      this.logger.debug(`💾 Strategy ${strategyId} state saved`);
    } catch (error) {
      this.logger.error(
        `❌ Failed to save strategy ${strategyId} state:`,
        error as Error
      );
      throw error;
    }
  }

  /**
   * 获取策略状态
   */
  async getStrategyState(strategyId: number): Promise<StrategyState | null> {
    try {
      // 先尝试从缓存获取
      const cached = this.stateCache.get(strategyId);
      if (cached && this.isCacheValid(cached)) {
        return cached;
      }

      // 从数据库获取
      const state = await this.dataManager.getStrategyState(strategyId);
      if (state) {
        this.stateCache.set(strategyId, state);
      }

      return state;
    } catch (error) {
      this.logger.error(
        `❌ Failed to get strategy ${strategyId} state:`,
        error as Error
      );
      return null;
    }
  }

  /**
   * 恢复策略完整状态
   */
  async recoverStrategyState(
    strategyId: number,
    exchangeName?: string
  ): Promise<StrategyRecoveryResult> {
    const startTime = Date.now();

    if (this.recoveryInProgress.has(strategyId)) {
      throw new Error(`Strategy ${strategyId} recovery already in progress`);
    }

    this.recoveryInProgress.add(strategyId);

    const result: StrategyRecoveryResult = {
      strategyId,
      success: false,
      openOrders: [],
      partialOrders: [],
      totalPosition: '0',
      issues: [],
      recoveryTime: 0,
    };

    try {
      this.logger.info(`🔄 Starting recovery for strategy ${strategyId}...`);

      // 1. 恢复保存的策略状态
      const savedState = await this.getStrategyState(strategyId);
      if (savedState) {
        result.recoveredState = savedState;
        result.issues.push({
          type: 'info',
          message: `Recovered state from ${savedState.lastUpdateTime.toISOString()}`,
          timestamp: new Date(),
        });
      } else {
        result.issues.push({
          type: 'warning',
          message: 'No saved state found, starting with clean state',
          timestamp: new Date(),
        });
      }

      // 2. 恢复订单状态
      const orders = await this.dataManager.getOrdersByStrategy(strategyId);

      // 3. 分类订单并与交易所同步
      for (const order of orders) {
        try {
          // 如果订单未完成，与交易所同步最新状态
          if (
            order.status === OrderStatus.NEW ||
            order.status === OrderStatus.PARTIALLY_FILLED
          ) {
            if (exchangeName) {
              const syncedOrder = await this.dataManager.syncOrderWithExchange(
                order.orderId,
                exchangeName
              );
              if (syncedOrder.status === OrderStatus.NEW) {
                result.openOrders.push(syncedOrder);
              } else if (syncedOrder.status === OrderStatus.PARTIALLY_FILLED) {
                result.partialOrders.push(syncedOrder);
              }
            }
          }
        } catch (syncError) {
          result.issues.push({
            type: 'warning',
            message: `Failed to sync order ${order.orderId}: ${(syncError as Error).message}`,
            timestamp: new Date(),
          });
        }
      }

      // 4. 计算总持仓
      result.totalPosition = this.calculateTotalPosition(orders);

      // 5. 计算未实现盈亏 (需要当前价格)
      if (savedState?.averagePrice && result.totalPosition !== '0') {
        // 这里需要获取当前市场价格来计算未实现盈亏
        // result.unrealizedPnl = this.calculateUnrealizedPnl(...)
      }

      // 6. 验证数据一致性
      const consistencyIssues = this.validateDataConsistency(result);
      result.issues.push(...consistencyIssues);

      result.success = true;
      result.recoveryTime = Date.now() - startTime;

      this.emit('recoveryCompleted', result);

      this.logger.info(
        `✅ Strategy ${strategyId} recovery completed in ${result.recoveryTime}ms`,
        {
          openOrders: result.openOrders.length,
          partialOrders: result.partialOrders.length,
          position: result.totalPosition,
          issues: result.issues.length,
        }
      );
    } catch (error) {
      result.success = false;
      result.recoveryTime = Date.now() - startTime;
      result.issues.push({
        type: 'error',
        message: `Recovery failed: ${(error as Error).message}`,
        timestamp: new Date(),
      });

      this.emit('recoveryFailed', {
        strategyId,
        error: error as Error,
        result,
      });

      this.logger.error(
        `❌ Strategy ${strategyId} recovery failed:`,
        error as Error
      );
    } finally {
      this.recoveryInProgress.delete(strategyId);
    }

    return result;
  }

  /**
   * 清理策略状态
   */
  async cleanupStrategyState(strategyId: number): Promise<void> {
    try {
      this.stateCache.delete(strategyId);
      await this.dataManager.deleteStrategyState(strategyId);

      this.emit('stateCleanedUp', { strategyId });
      this.logger.info(`🗑️ Strategy ${strategyId} state cleaned up`);
    } catch (error) {
      this.logger.error(
        `❌ Failed to cleanup strategy ${strategyId} state:`,
        error as Error
      );
      throw error;
    }
  }

  /**
   * 获取恢复统计信息
   */
  getRecoveryStats(): {
    inProgress: number;
    cacheSize: number;
    lastAutosave: Date | null;
  } {
    return {
      inProgress: this.recoveryInProgress.size,
      cacheSize: this.stateCache.size,
      lastAutosave: null, // TODO: 实现自动保存时间跟踪
    };
  }

  /**
   * 启动自动保存
   */
  private startAutosave(): void {
    if (!this.config.autosaveInterval) return;

    setInterval(async () => {
      try {
        const activeStrategies = Array.from(this.stateCache.keys());
        this.logger.debug(
          `🔄 Autosaving ${activeStrategies.length} strategy states...`
        );

        for (const strategyId of activeStrategies) {
          const state = this.stateCache.get(strategyId);
          if (state) {
            await this.dataManager.saveStrategyState(strategyId, state);
          }
        }

        this.emit('autosaveCompleted', { count: activeStrategies.length });
      } catch (error) {
        this.logger.error('❌ Autosave failed:', error as Error);
        this.emit('autosaveFailed', { error: error as Error });
      }
    }, this.config.autosaveInterval);
  }

  /**
   * 检查缓存是否有效
   */
  private isCacheValid(state: StrategyState): boolean {
    if (!this.config.cacheTimeout) return true;

    const age = Date.now() - state.lastUpdateTime.getTime();
    return age < this.config.cacheTimeout;
  }

  /**
   * 计算总持仓
   */
  private calculateTotalPosition(orders: OrderRecoveryInfo[]): string {
    let totalPosition = new Decimal(0);

    for (const order of orders) {
      if (
        order.status === OrderStatus.FILLED ||
        order.status === OrderStatus.PARTIALLY_FILLED
      ) {
        const executedQty = new Decimal(order.executedQuantity);
        // 这里需要根据订单方向(buy/sell)来计算持仓
        // 简化实现，实际需要考虑订单方向
        totalPosition = totalPosition.plus(executedQty);
      }
    }

    return totalPosition.toString();
  }

  /**
   * 验证数据一致性
   */
  private validateDataConsistency(result: StrategyRecoveryResult): Array<{
    type: 'warning' | 'error' | 'info';
    message: string;
    timestamp: Date;
  }> {
    const issues: Array<{
      type: 'warning' | 'error' | 'info';
      message: string;
      timestamp: Date;
    }> = [];

    // 检查持仓计算是否合理
    const totalPos = new Decimal(result.totalPosition);
    if (totalPos.lt(0)) {
      issues.push({
        type: 'warning',
        message: 'Negative position detected, please verify order directions',
        timestamp: new Date(),
      });
    }

    // 检查未完成订单数量
    const totalOpenOrders =
      result.openOrders.length + result.partialOrders.length;
    if (totalOpenOrders > 10) {
      issues.push({
        type: 'warning',
        message: `Large number of open orders (${totalOpenOrders}), may need manual review`,
        timestamp: new Date(),
      });
    }

    return issues;
  }

  /**
   * 停止服务
   */
  async shutdown(): Promise<void> {
    this.logger.info('🔄 Shutting down StrategyStateManager...');

    // 保存所有缓存状态
    const savePromises = Array.from(this.stateCache.entries()).map(
      ([strategyId, state]) =>
        this.dataManager
          .saveStrategyState(strategyId, state)
          .catch((error) =>
            this.logger.error(
              `Failed to save state for strategy ${strategyId}:`,
              error as Error
            )
          )
    );

    await Promise.allSettled(savePromises);

    this.stateCache.clear();
    this.recoveryInProgress.clear();

    this.emit('shutdown');
    this.logger.info('✅ StrategyStateManager shutdown complete');
  }
}
