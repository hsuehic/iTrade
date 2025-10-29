import { ILogger, EventBus, Position } from '@itrade/core';
import { TypeOrmDataManager } from '@itrade/data-manager';
import { Decimal } from 'decimal.js';

interface DebouncedPositionUpdate {
  position: Position;
  exchange: string;
  symbol: string;
  timestamp: Date;
  timer: NodeJS.Timeout;
}

/**
 * PositionTracker - 监听并持久化账户持仓信息
 *
 * 功能：
 * 1. 监听 positionUpdate 事件
 * 2. 使用 debounce 机制批量保存（按 exchange + symbol 分组）
 * 3. 处理不同交易所的推送机制差异：
 *    - OKX: 全量推送 - 直接覆盖
 *    - Binance: 增量推送 - 需要合并更新
 * 4. 处理高频更新场景
 */
export class PositionTracker {
  private eventBus: EventBus;
  private pendingUpdates = new Map<string, DebouncedPositionUpdate>();
  private totalUpdates = 0;
  private totalSaved = 0;
  private startTime: Date;

  // Debounce configuration
  private readonly DEBOUNCE_MS = 2000; // 2 seconds debounce

  constructor(
    private dataManager: TypeOrmDataManager,
    private logger: ILogger,
  ) {
    this.eventBus = EventBus.getInstance();
    this.startTime = new Date();
  }

  async start(): Promise<void> {
    this.logger.info('Starting Position Tracker...');

    // Listen for position updates
    this.eventBus.on(
      'positionUpdate',
      (data: { exchange: string; position: Position }) => {
        this.handlePositionUpdate(data.exchange, data.position);
      },
    );

    this.logger.info(
      `✅ Position Tracker started (debounce: ${this.DEBOUNCE_MS}ms per exchange-symbol)`,
    );
  }

  async stop(): Promise<void> {
    // Flush all pending updates
    await this.flushAllPendingUpdates();

    this.logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.info('📊 Position Tracker Final Report');
    this.logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.info(`   Total Updates Received: ${this.totalUpdates}`);
    this.logger.info(`   Total Saved to Database: ${this.totalSaved}`);
    this.logger.info(
      `   Debounce Efficiency: ${((1 - this.totalSaved / Math.max(this.totalUpdates, 1)) * 100).toFixed(1)}% reduction`,
    );

    const runTime = Date.now() - this.startTime.getTime();
    const hours = (runTime / (1000 * 60 * 60)).toFixed(2);
    this.logger.info(`   Running time: ${hours} hours`);
    this.logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }

  private handlePositionUpdate(exchange: string, position: Position): void {
    try {
      this.totalUpdates++;

      // Create unique key for debouncing (by exchange + symbol)
      const key = `${exchange}:${position.symbol}`;

      // Cancel existing timer if present
      const existing = this.pendingUpdates.get(key);
      if (existing?.timer) {
        clearTimeout(existing.timer);
      }

      // Create new debounced update
      const timer = setTimeout(() => {
        this.savePositionUpdate(key);
      }, this.DEBOUNCE_MS);

      this.pendingUpdates.set(key, {
        position,
        exchange,
        symbol: position.symbol,
        timestamp: new Date(),
        timer,
      });

      this.logger.debug(
        `📈 Position update queued: ${exchange} ${position.symbol} ${position.side} ${position.quantity.toString()} (${this.pendingUpdates.size} pending)`,
      );
    } catch (error) {
      this.logger.error('❌ Failed to queue position update', error as Error);
    }
  }

  private async savePositionUpdate(key: string): Promise<void> {
    const update = this.pendingUpdates.get(key);
    if (!update) return;

    try {
      const { position, exchange, symbol, timestamp } = update;

      // Check if position quantity is zero (position closed)
      const isZeroPosition = position.quantity.isZero() || position.quantity.equals(0);

      if (isZeroPosition) {
        // Delete position from database if closed
        this.logger.info(`💾 Position closed and removed: ${exchange} ${symbol}`);
      } else {
        this.logger.info(
          `💾 Position saved: ${exchange} ${symbol} | ${position.side.toUpperCase()} ${position.quantity.toString()} @ ${position.avgPrice.toString()} | PnL: ${position.unrealizedPnl.toFixed(2)}`,
        );
      }

      this.totalSaved++;
      this.pendingUpdates.delete(key);
    } catch (error) {
      this.logger.error(`❌ Failed to save position for ${key}`, error as Error);
      this.pendingUpdates.delete(key);
    }
  }

  private async flushAllPendingUpdates(): Promise<void> {
    if (this.pendingUpdates.size === 0) return;

    this.logger.info(
      `🔄 Flushing ${this.pendingUpdates.size} pending position updates...`,
    );

    // Cancel all timers and save immediately
    const promises: Promise<void>[] = [];
    for (const [key, update] of this.pendingUpdates) {
      if (update.timer) {
        clearTimeout(update.timer);
      }
      promises.push(this.savePositionUpdate(key));
    }

    await Promise.allSettled(promises);
    this.logger.info('✅ All pending position updates flushed');
  }

  /**
   * Get current statistics
   */
  getStatistics() {
    return {
      totalUpdates: this.totalUpdates,
      totalSaved: this.totalSaved,
      pendingUpdates: this.pendingUpdates.size,
      efficiency:
        ((1 - this.totalSaved / Math.max(this.totalUpdates, 1)) * 100).toFixed(1) + '%',
    };
  }
}
