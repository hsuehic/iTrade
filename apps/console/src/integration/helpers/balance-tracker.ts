import { ILogger, EventBus, AccountInfo, Balance } from '@itrade/core';
import { TypeOrmDataManager, AccountInfoEntity } from '@itrade/data-manager';
import { Decimal } from 'decimal.js';

interface DebouncedBalanceUpdate {
  exchange: string;
  timestamp: Date;
  timer: NodeJS.Timeout;
}

/**
 * BalanceTracker - 监听并持久化账户余额信息
 *
 * 功能：
 * 1. 监听 accountUpdate 事件
 * 2. 使用 debounce 机制批量保存（按 exchange 分组）
 * 3. 处理高频更新场景
 * 4. 对 Binance 等分钱包交易所，按 spot/futures 分别缓存后合并写入
 */
export class BalanceTracker {
  private eventBus: EventBus;
  private pendingUpdates = new Map<string, DebouncedBalanceUpdate>();
  private walletBalanceCache = new Map<string, Map<string, Balance>>();
  private totalUpdates = 0;
  private totalSaved = 0;
  private startTime: Date;

  // Debounce configuration
  private readonly DEBOUNCE_MS = 2000; // 2 seconds debounce

  constructor(
    private userId: string,
    private dataManager: TypeOrmDataManager,
    private logger: ILogger,
  ) {
    this.eventBus = EventBus.getInstance();
    this.startTime = new Date();
  }

  async start(): Promise<void> {
    this.logger.debug('Starting Balance Tracker...');

    await this.seedWalletCachesFromDatabase();

    // Listen for balance updates using the correct event name
    this.eventBus.onBalanceUpdate((data) => {
      // 🛡️ Filter by userId if provided in the event
      if (data.userId && data.userId !== this.userId) {
        return;
      }

      if (data.balances.length === 0) {
        return;
      }

      // Convert Balance[] to AccountInfo for backwards compatibility
      const accountInfo: AccountInfo = {
        balances: data.balances,
        canTrade: true,
        canWithdraw: true,
        canDeposit: true,
        updateTime: data.timestamp,
      };
      this.handleBalanceUpdate(data.exchange, accountInfo, data.wallet);
    });

    this.logger.debug(
      `✅ Balance Tracker started (debounce: ${this.DEBOUNCE_MS}ms per exchange)`,
    );
  }

  async stop(): Promise<void> {
    // Flush all pending updates
    await this.flushAllPendingUpdates();

    this.logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.debug('📊 Balance Tracker Final Report');
    this.logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.debug(`   Total Updates Received: ${this.totalUpdates}`);
    this.logger.debug(`   Total Saved to Database: ${this.totalSaved}`);
    this.logger.debug(
      `   Debounce Efficiency: ${((1 - this.totalSaved / Math.max(this.totalUpdates, 1)) * 100).toFixed(1)}% reduction`,
    );

    const runTime = Date.now() - this.startTime.getTime();
    const hours = (runTime / (1000 * 60 * 60)).toFixed(2);
    this.logger.debug(`   Running time: ${hours} hours`);
    this.logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }

  private getWalletKey(exchange: string, wallet?: string): string {
    return `${exchange.toLowerCase()}:${(wallet ?? 'default').toLowerCase()}`;
  }

  private mergePartialIntoWalletCache(walletKey: string, balances: Balance[]): void {
    const cache = this.walletBalanceCache.get(walletKey) ?? new Map<string, Balance>();

    for (const balance of balances) {
      if (balance.total.isZero() && balance.free.isZero() && balance.locked.isZero()) {
        cache.delete(balance.asset);
        continue;
      }

      cache.set(balance.asset, {
        asset: balance.asset,
        free: new Decimal(balance.free),
        locked: new Decimal(balance.locked),
        total: new Decimal(balance.total),
        saving: balance.saving ? new Decimal(balance.saving) : undefined,
      });
    }

    this.walletBalanceCache.set(walletKey, cache);
  }

  private mergeExchangeWallets(exchange: string): Balance[] {
    const exchangeKey = exchange.toLowerCase();
    const merged = new Map<string, Balance>();

    for (const [walletKey, cache] of this.walletBalanceCache) {
      if (!walletKey.startsWith(`${exchangeKey}:`)) continue;

      for (const balance of cache.values()) {
        const existing = merged.get(balance.asset);
        if (existing) {
          existing.free = existing.free.add(balance.free);
          existing.locked = existing.locked.add(balance.locked);
          existing.total = existing.total.add(balance.total);
        } else {
          merged.set(balance.asset, {
            asset: balance.asset,
            free: new Decimal(balance.free),
            locked: new Decimal(balance.locked),
            total: new Decimal(balance.total),
            saving: balance.saving ? new Decimal(balance.saving) : undefined,
          });
        }
      }
    }

    return Array.from(merged.values());
  }

  private async seedWalletCachesFromDatabase(): Promise<void> {
    try {
      const accountInfoRepo =
        this.dataManager.dataSource.getRepository(AccountInfoEntity);
      const accounts = await accountInfoRepo.find({
        where: { userId: this.userId, isActive: true },
      });

      for (const account of accounts) {
        const balances = await this.dataManager.getAccountBalances(account.id);
        if (balances.length === 0) continue;

        const exchange = account.exchange.toLowerCase();
        // Binance uses separate spot/futures wallet caches populated by subscribeToUserData.
        if (exchange === 'binance') {
          continue;
        }

        const walletKey = this.getWalletKey(exchange);
        const cache = new Map<string, Balance>();

        for (const balance of balances) {
          cache.set(balance.asset, {
            asset: balance.asset,
            free: new Decimal(balance.free),
            locked: new Decimal(balance.locked),
            total: new Decimal(balance.total),
          });
        }

        this.walletBalanceCache.set(walletKey, cache);
      }
    } catch (error) {
      this.logger.warn('⚠️  Failed to seed wallet balance caches from database', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private handleBalanceUpdate(
    exchange: string,
    accountInfo: AccountInfo,
    wallet?: string,
  ): void {
    try {
      this.totalUpdates++;

      const exchangeKey = exchange.toLowerCase();
      const walletKey = this.getWalletKey(exchangeKey, wallet);
      this.mergePartialIntoWalletCache(walletKey, accountInfo.balances);

      // Create unique key for debouncing (by exchange)
      const key = exchangeKey;

      // Cancel existing timer if present
      const existing = this.pendingUpdates.get(key);
      if (existing?.timer) {
        clearTimeout(existing.timer);
      }

      // Create new debounced update
      const timer = setTimeout(() => {
        this.saveBalanceUpdate(key);
      }, this.DEBOUNCE_MS);

      this.pendingUpdates.set(key, {
        exchange: exchangeKey,
        timestamp: new Date(),
        timer,
      });

      this.logger.debug(
        `💰 Balance update queued: ${exchangeKey}${wallet ? `/${wallet}` : ''} (${this.pendingUpdates.size} pending)`,
      );
    } catch (error) {
      this.logger.error('❌ Failed to queue balance update', error as Error);
    }
  }

  private async saveBalanceUpdate(key: string): Promise<void> {
    const update = this.pendingUpdates.get(key);
    if (!update) return;

    try {
      const { exchange } = update;
      const userId = this.userId;

      if (!userId) {
        this.logger.error('❌ userId not provided to BalanceTracker');
        return;
      }

      const mergedBalances = this.mergeExchangeWallets(exchange);
      if (mergedBalances.length === 0) {
        this.pendingUpdates.delete(key);
        return;
      }

      // Avoid persisting partial Binance futures-only updates before spot wallet is initialized.
      if (exchange === 'binance') {
        const spotCache = this.walletBalanceCache.get(
          this.getWalletKey(exchange, 'spot'),
        );
        if (!spotCache || spotCache.size === 0) {
          this.pendingUpdates.delete(key);
          return;
        }
      }

      const accountInfoRepo =
        this.dataManager.dataSource.getRepository(AccountInfoEntity);

      const existingAccountInfo = await accountInfoRepo.findOne({
        where: {
          userId,
          exchange,
        },
      });

      if (
        !existingAccountInfo ||
        !existingAccountInfo.apiKey ||
        !existingAccountInfo.secretKey
      ) {
        this.logger.warn(
          `⚠️  Skipping balance update for ${exchange} (missing stored credentials for user ${userId})`,
        );
        return;
      }

      await this.dataManager.updateAccountBalances(
        existingAccountInfo.id,
        mergedBalances.map((balance) => ({
          asset: balance.asset,
          free: balance.free,
          locked: balance.locked,
          total: balance.total,
        })),
      );

      this.totalSaved++;
      this.pendingUpdates.delete(key);
    } catch (error) {
      this.logger.error(`❌ Failed to save balance for ${key}`, error as Error);
      this.pendingUpdates.delete(key);
    }
  }

  private async flushAllPendingUpdates(): Promise<void> {
    if (this.pendingUpdates.size === 0) return;

    this.logger.debug(
      `🔄 Flushing ${this.pendingUpdates.size} pending balance updates...`,
    );
    // Cancel all timers and save immediately
    const promises: Promise<void>[] = [];
    for (const [key, update] of this.pendingUpdates) {
      if (update.timer) {
        clearTimeout(update.timer);
      }
      promises.push(this.saveBalanceUpdate(key));
    }

    await Promise.allSettled(promises);
    this.logger.debug('✅ All pending balance updates flushed');
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
