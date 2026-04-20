import { ILogger, EventBus, AccountInfo } from '@itrade/core';
import {
  TypeOrmDataManager,
  AccountInfoEntity,
  BalanceEntity,
} from '@itrade/data-manager';
import { Decimal } from 'decimal.js';

interface DebouncedBalanceUpdate {
  accountInfo: AccountInfo;
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
 */
export class BalanceTracker {
  private eventBus: EventBus;
  private pendingUpdates = new Map<string, DebouncedBalanceUpdate>();
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

    // Listen for balance updates using the correct event name
    this.eventBus.onBalanceUpdate((data) => {
      // 🛡️ Filter by userId if provided in the event
      if (data.userId && data.userId !== this.userId) {
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
      this.handleBalanceUpdate(data.exchange, accountInfo);
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

    const runTime = Date.now() - this.startTime.getTime(); // Replaced with same line to keep context
    const hours = (runTime / (1000 * 60 * 60)).toFixed(2);
    this.logger.debug(`   Running time: ${hours} hours`);
    this.logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }

  private handleBalanceUpdate(exchange: string, accountInfo: AccountInfo): void {
    try {
      this.totalUpdates++;

      // Create unique key for debouncing (by exchange)
      const key = exchange;

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
        accountInfo,
        exchange,
        timestamp: new Date(),
        timer,
      });

      this.logger.debug(
        `💰 Balance update queued: ${exchange} (${this.pendingUpdates.size} pending)`,
      );
    } catch (error) {
      this.logger.error('❌ Failed to queue balance update', error as Error);
    }
  }

  private async saveBalanceUpdate(key: string): Promise<void> {
    const update = this.pendingUpdates.get(key);
    if (!update) return;

    try {
      const { accountInfo, exchange } = update;
      const userId = this.userId;

      if (!userId) {
        this.logger.error('❌ userId not provided to BalanceTracker');
        return;
      }

      // Calculate totals for logging
      let totalBalance = new Decimal(0);
      let availableBalance = new Decimal(0);
      let lockedBalance = new Decimal(0);

      accountInfo.balances.forEach((balance) => {
        totalBalance = totalBalance.add(balance.total);
        availableBalance = availableBalance.add(balance.free);
        lockedBalance = lockedBalance.add(balance.locked);
      });

      // Save to database using upsert
      const accountInfoRepo =
        this.dataManager.dataSource.getRepository(AccountInfoEntity);
      const balanceRepo = this.dataManager.dataSource.getRepository(BalanceEntity);

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

      // Delete all existing balances for this account
      await balanceRepo.delete({
        accountInfoId: existingAccountInfo.id,
      });

      // Upsert new balances
      if (accountInfo.balances.length > 0) {
        // Deduplicate balances by asset (keep the last occurrence)
        const balanceMap = new Map<string, (typeof accountInfo.balances)[0]>();
        for (const balance of accountInfo.balances) {
          balanceMap.set(balance.asset, balance);
        }

        const uniqueBalances = Array.from(balanceMap.values());

        // Log if duplicates were found
        if (uniqueBalances.length < accountInfo.balances.length) {
          this.logger.warn(
            `⚠️  Duplicate assets detected for ${exchange}: ${accountInfo.balances.length} balances, ${uniqueBalances.length} unique`,
          );
        }

        const balanceEntities = uniqueBalances.map((balance) => ({
          accountInfoId: existingAccountInfo.id,
          asset: balance.asset,
          free: balance.free,
          locked: balance.locked,
          saving: balance.saving || new Decimal(0),
          total: balance.total,
        }));

        await balanceRepo.upsert(balanceEntities, {
          conflictPaths: ['accountInfoId', 'asset'],
          skipUpdateIfNoValuesChanged: true,
        });

        // Update balance history (Total Account Value)
        // DISABLED: BalanceTracker calculates total by summing balances, which ignores totalEquity (Unrealized PnL).
        // This causes it to overwrite correct values from AccountPollingService with incorrect lower values.
        // Let AccountPollingService handle history updates.
        /*
        await this.dataManager.updateBalanceHistory(
          { id: existingAccountInfo.id } as AccountInfoEntity,
          availableBalance,
          lockedBalance,
          totalBalance,
          timestamp,
        );
        */
      }

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
