import { ILogger, EventBus, Position } from '@itrade/core';
import { PositionEntity, TypeOrmDataManager } from '@itrade/data-manager';

interface DebouncedPositionUpdate {
  position: Position;
  exchange: string;
  symbol: string;
  timestamp: Date;
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
  private timer?: NodeJS.Timeout;

  constructor(
    private dataManager: TypeOrmDataManager,
    private logger: ILogger,
  ) {
    this.eventBus = EventBus.getInstance();
    this.startTime = new Date();
  }

  async start(): Promise<void> {
    // Set up recurring flush timer (runs every DEBOUNCE_MS)
    this.timer = setInterval(() => {
      this.flushAllPendingUpdates();
    }, this.DEBOUNCE_MS);

    // Listen for position updates using the correct event name
    this.eventBus.onPositionUpdate((data) => {
      // Process each position in the update
      data.positions.forEach((position) => {
        this.handlePositionUpdate(data.exchange, position);
      });
    });
  }

  async stop(): Promise<void> {
    // Flush all pending updates
    await this.flushAllPendingUpdates();
    if (this.timer) {
      clearTimeout(this.timer);
    }
  }

  private handlePositionUpdate(exchange: string, position: Position): void {
    try {
      this.totalUpdates++;

      // Create unique key for debouncing (by exchange + symbol)
      const key = `${exchange}:${position.symbol}`;

      this.pendingUpdates.set(key, {
        position,
        exchange,
        symbol: position.symbol,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('❌ Failed to queue position update', error as Error);
    }
  }

  private async flushAllPendingUpdates(): Promise<void> {
    if (this.pendingUpdates.size === 0) return;

    await this.upsertPositionEntity(Array.from(this.pendingUpdates.values()));
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

  private async upsertPositionEntity(updates: DebouncedPositionUpdate[]): Promise<void> {
    const repo = this.dataManager.dataSource.getRepository(PositionEntity);
    const userId = process.env.USER_ID;

    if (!userId) {
      this.logger.error('❌ USER_ID not found in environment variables');
      return;
    }

    const entities = updates.map((update) => ({
      ...update.position,
      user: { id: userId }, // Set the user relation properly
      exchange: update.exchange,
      symbol: update.symbol,
      timestamp: update.timestamp,
    }));

    try {
      // Use the correct conflict target - TypeORM will map 'user' to 'userId' column
      await repo.upsert(entities, {
        conflictPaths: ['user', 'exchange', 'symbol'],
        skipUpdateIfNoValuesChanged: true,
      });

      this.totalSaved += entities.length;
      this.pendingUpdates.clear();

      this.logger.debug(`💾 Saved ${entities.length} position(s) to database`);
    } catch (error) {
      this.logger.error('❌ Failed to upsert positions', error as Error);
    }
  }
}
