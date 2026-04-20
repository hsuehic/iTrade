import { Decimal } from 'decimal.js';
import { EventBus, IExchange, ILogger, Position } from '@itrade/core';
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
  private okxRestPositionsCache = new Map<string, Position>(); // key: symbol:side
  private okxRestLastSync = 0;
  private okxRestInFlight?: Promise<Map<string, Position>>; // key: symbol:side
  private lastPersistAt = 0;

  // Debounce configuration
  private readonly DEBOUNCE_MS = 2000; // 2 seconds debounce
  private readonly OKX_REST_ENRICH_INTERVAL_MS = 5000; // 5 seconds throttle
  private readonly PERSIST_THROTTLE_MS = 5000; // 5 seconds throttle
  private readonly DUST_THRESHOLD = new Decimal('1e-10'); // Anything smaller than this is treated as zero
  private timer?: NodeJS.Timeout;

  constructor(
    private userId: string,
    private dataManager: TypeOrmDataManager,
    private logger: ILogger,
    private getExchangeByName: (exchange: string) => IExchange | undefined = () =>
      undefined,
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
      if (data.userId && data.userId !== this.userId) {
        return;
      }
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

      // Create unique key for debouncing (by exchange + symbol + side)
      const key = `${exchange}:${position.symbol}:${position.side}`;

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

    const now = Date.now();
    if (now - this.lastPersistAt < this.PERSIST_THROTTLE_MS) {
      return;
    }

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
    const userId = this.userId;

    if (!userId) {
      this.logger.error('❌ userId not provided to PositionTracker');
      return;
    }

    const enrichedUpdates = await this.enrichOkxPositionsIfNeeded(updates);

    const toUpsert: Array<Partial<PositionEntity>> = [];
    const toDelete: DebouncedPositionUpdate[] = [];

    for (const update of enrichedUpdates) {
      const absQuantity = update.position.quantity.abs();
      // Treatment of zero or dust positions
      if (absQuantity.lt(this.DUST_THRESHOLD)) {
        toDelete.push(update);
        this.logger.debug(
          `🧹 Position ${update.exchange}:${update.symbol}:${update.position.side} is dust/closed (qty: ${update.position.quantity}), marking for deletion`,
        );
      } else {
        toUpsert.push({
          ...update.position,
          userId,
          exchange: update.exchange,
          symbol: update.symbol,
          timestamp: update.timestamp,
        });
      }
    }

    try {
      // 1. Handle Deletions
      if (toDelete.length > 0) {
        for (const update of toDelete) {
          await this.dataManager
            .getPositionRepository()
            .deleteBySymbol(update.symbol, update.exchange, userId, update.position.side);
        }
        this.logger.debug(
          `🗑️ Deleted ${toDelete.length} closed position(s) from database`,
        );
      }

      // 2. Handle Upserts
      if (toUpsert.length > 0) {
        // Use the correct conflict target - TypeORM will map 'user' to 'userId' column
        await repo.upsert(toUpsert as Parameters<typeof repo.upsert>[0], {
          conflictPaths: ['userId', 'exchange', 'symbol', 'side'],
          skipUpdateIfNoValuesChanged: true,
        });
        this.logger.debug(`💾 Saved ${toUpsert.length} position(s) to database`);
      }

      this.totalSaved += enrichedUpdates.length;
      this.pendingUpdates.clear();
      this.lastPersistAt = Date.now();
    } catch (error) {
      this.logger.error('❌ Failed to process position updates', error as Error);
    }
  }

  private async enrichOkxPositionsIfNeeded(
    updates: DebouncedPositionUpdate[],
  ): Promise<DebouncedPositionUpdate[]> {
    const okxUpdates = updates.filter((update) => update.exchange === 'okx');
    if (okxUpdates.length === 0) {
      return updates;
    }

    const needsEnrichment = okxUpdates.some((update) =>
      this.isOkxPnlMissing(update.position),
    );
    if (!needsEnrichment) {
      return updates;
    }

    const okxExchange = this.getExchangeByName('okx');
    if (!okxExchange) {
      this.logger.warn('⚠️ OKX exchange not available for PnL enrichment');
      return updates;
    }

    try {
      const restPositions = await this.getOkxRestPositions(okxExchange);
      if (restPositions.size === 0) {
        return updates;
      }

      return updates.map((update) => {
        if (update.exchange !== 'okx') return update;
        const side = update.position.side;
        const restPosition = restPositions.get(`${update.symbol}:${side}`);
        if (!restPosition) return update;

        return {
          ...update,
          position: {
            ...update.position,
            avgPrice: restPosition.avgPrice,
            markPrice: restPosition.markPrice,
            unrealizedPnl: restPosition.unrealizedPnl,
            leverage: restPosition.leverage,
            marketValue: restPosition.marketValue,
            notionalUsd: restPosition.notionalUsd,
          },
        };
      });
    } catch (error) {
      this.logger.warn('⚠️ Failed to enrich OKX positions with REST data', {
        error: (error as Error).message,
      });
      return updates;
    }
  }

  private isOkxPnlMissing(position: Position): boolean {
    const hasQuantity = position.quantity.abs().gt(0);
    if (!hasQuantity) return false;

    const isMarkMissing = position.markPrice.isZero();
    const isAvgMissing = position.avgPrice.isZero();
    const isPnlZero = position.unrealizedPnl.isZero();

    return isPnlZero && (isMarkMissing || isAvgMissing);
  }

  private async getOkxRestPositions(exchange: IExchange): Promise<Map<string, Position>> {
    const now = Date.now();
    if (
      this.okxRestPositionsCache.size > 0 &&
      now - this.okxRestLastSync < this.OKX_REST_ENRICH_INTERVAL_MS
    ) {
      return this.okxRestPositionsCache;
    }

    if (this.okxRestInFlight) {
      return this.okxRestInFlight;
    }

    this.okxRestInFlight = exchange
      .getPositions()
      .then((positions) => {
        const map = new Map<string, Position>();
        positions.forEach((position) => {
          map.set(`${position.symbol}:${position.side}`, position);
        });
        this.okxRestPositionsCache = map;
        this.okxRestLastSync = Date.now();
        return map;
      })
      .finally(() => {
        this.okxRestInFlight = undefined;
      });

    return this.okxRestInFlight;
  }
}
