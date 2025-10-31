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
    private dataManager: TypeOrmDataManager,
    private logger: ILogger,
  ) {
    this.eventBus = EventBus.getInstance();
    this.startTime = new Date();
  }

  async start(): Promise<void> {
    this.logger.info('Starting Balance Tracker...');

    // Listen for balance updates using the correct event name
    this.eventBus.onBalanceUpdate((data) => {
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

    this.logger.info(
      `✅ Balance Tracker started (debounce: ${this.DEBOUNCE_MS}ms per exchange)`,
    );
  }

  async stop(): Promise<void> {
    // Flush all pending updates
    await this.flushAllPendingUpdates();

    this.logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.info('📊 Balance Tracker Final Report');
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
      const { accountInfo, exchange, timestamp } = update;
      const userId = process.env.USER_ID;

      if (!userId) {
        this.logger.error('❌ USER_ID not found in environment variables');
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

      // Upsert AccountInfoEntity
      await accountInfoRepo.upsert(
        {
          user: { id: userId },
          exchange,
          accountId: exchange, // Use exchange as accountId
          canTrade: accountInfo.canTrade,
          canWithdraw: accountInfo.canWithdraw,
          canDeposit: accountInfo.canDeposit,
          updateTime: accountInfo.updateTime || timestamp,
        },
        {
          conflictPaths: ['user', 'exchange'],
          skipUpdateIfNoValuesChanged: true,
        },
      );

      // Get the account info to retrieve its ID
      const existingAccountInfo = await accountInfoRepo.findOne({
        where: {
          user: { id: userId },
          exchange,
        },
      });

      if (!existingAccountInfo) {
        throw new Error(`Failed to find AccountInfo after upsert for ${exchange}`);
      }

      // Delete all existing balances for this account
      await balanceRepo.delete({
        accountInfo: { id: existingAccountInfo.id },
      });

      // Upsert new balances
      if (accountInfo.balances.length > 0) {
        const balanceEntities = accountInfo.balances.map((balance) => ({
          accountInfo: { id: existingAccountInfo.id },
          asset: balance.asset,
          free: balance.free,
          locked: balance.locked,
          total: balance.total,
        }));

        await balanceRepo.upsert(balanceEntities, {
          conflictPaths: ['accountInfo', 'asset'],
          skipUpdateIfNoValuesChanged: true,
        });
      }

      this.totalSaved++;
      this.pendingUpdates.delete(key);

      this.logger.info(
        `💾 Balance saved: ${exchange} | Total: ${totalBalance.toFixed(2)} | Available: ${availableBalance.toFixed(2)} | Locked: ${lockedBalance.toFixed(2)}`,
      );
    } catch (error) {
      this.logger.error(`❌ Failed to save balance for ${key}`, error as Error);
      this.pendingUpdates.delete(key);
    }
  }

  private async flushAllPendingUpdates(): Promise<void> {
    if (this.pendingUpdates.size === 0) return;

    this.logger.info(
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
    this.logger.info('✅ All pending balance updates flushed');
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
