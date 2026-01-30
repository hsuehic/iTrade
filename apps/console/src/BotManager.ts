
import { TypeOrmDataManager, AccountInfoEntity } from '@itrade/data-manager';
import { ConsoleLogger } from '@itrade/core';
import { BotInstance } from './BotInstance';

export class BotManager {
  private bots = new Map<string, BotInstance>();
  private isRunning = false;

  constructor(
    private readonly dataManager: TypeOrmDataManager,
    private readonly logger: ConsoleLogger
  ) {}

  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    this.logger.info('🤖 Starting BotManager...');
    
    // Load all users from DB
    await this.refreshBots();

    // Set up periodic refresh to catch new users/accounts
    setInterval(() => this.refreshBots(), 60000 * 5); // Every 5 minutes
  }

  public async stop(): Promise<void> {
    this.logger.info('🛑 Stopping all bots...');
    for (const [userId, bot] of this.bots) {
      await bot.stop();
    }
    this.bots.clear();
    this.isRunning = false;
  }

  private async refreshBots(): Promise<void> {
    try {
      const accountRepo = this.dataManager.dataSource.getRepository(AccountInfoEntity);
      const accounts = await accountRepo.find({
        where: { isActive: true },
        relations: ['user'],
        select: {
            user: { id: true },
            exchange: true,
        }
      });

      const activeUserIds = new Set<string>();
      accounts.forEach(acc => {
        if (acc.user?.id) activeUserIds.add(acc.user.id);
      });

      // Start new bots
      for (const userId of activeUserIds) {
        if (!this.bots.has(userId)) {
          this.logger.info(`🆕 Found new active user: ${userId}. Starting bot...`);
          const bot = new BotInstance(userId, this.dataManager, this.logger);
          await bot.initialize(); // Load exchanges, trackers
          await bot.start();      // Start engine
          this.bots.set(userId, bot);
        }
      }

      // Stop removed bots
      for (const [userId, bot] of this.bots) {
        if (!activeUserIds.has(userId)) {
           this.logger.info(`🗑️ User ${userId} no longer active. Stopping bot...`);
           await bot.stop();
           this.bots.delete(userId);
        }
      }

    } catch (error) {
      this.logger.error('❌ Error refreshing bots:', error as Error);
    }
  }

  // Helper to get stats from all bots
  public getAllOrderStats() {
      // Aggregate or return list
      return Array.from(this.bots.values()).map(bot => ({
          userId: bot['userId'],
          trackers: bot.getOrderTrackers()
      }));
  }
}
