import { TypeOrmDataManager, AccountInfoEntity } from '@itrade/data-manager';
import { ConsoleLogger } from '@itrade/core';
import { BotInstance } from './BotInstance';

export class BotManager {
  private bots = new Map<string, BotInstance>();
  private isRunning = false;
  private readonly refreshIntervalMs: number;

  constructor(
    private readonly dataManager: TypeOrmDataManager,
    private readonly logger: ConsoleLogger,
  ) {
    this.refreshIntervalMs = BotManager.parseInterval(
      process.env.BOT_REFRESH_INTERVAL_MS,
      60000,
    );
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // Load all users from DB
    await this.refreshBots();

    // Set up periodic refresh to catch new users/accounts
    setInterval(() => this.refreshBots(), this.refreshIntervalMs);
  }

  public async stop(): Promise<void> {
    for (const [, bot] of this.bots) {
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
        select: {
          id: true,
          userId: true,
          apiKey: true,
          secretKey: true,
          passphrase: true,
          exchange: true,
        },
      });

      // Filter accounts to only include those with valid credentials
      const validAccounts = accounts.filter((acc) => {
        // Must have userId, apiKey, and secretKey
        if (!acc.userId || !acc.apiKey || !acc.secretKey) {
          return false;
        }

        // OKX requires passphrase
        if (acc.exchange.toLowerCase() === 'okx' && !acc.passphrase) {
          return false;
        }

        return true;
      });

      // Get unique user IDs who have at least one valid account
      const activeUserIds = new Set<string>();
      validAccounts.forEach((acc) => {
        if (acc.userId) activeUserIds.add(acc.userId);
      });

      const accountsByUser = new Map<string, AccountInfoEntity[]>();
      for (const account of validAccounts) {
        if (!account.userId) continue;
        const list = accountsByUser.get(account.userId) ?? [];
        list.push(account);
        accountsByUser.set(account.userId, list);
      }

      // Start new bots
      for (const userId of activeUserIds) {
        if (!this.bots.has(userId)) {
          const bot = new BotInstance(userId, this.dataManager, this.logger);

          try {
            await bot.initialize(); // Load exchanges, trackers
            await bot.start(); // Start engine
            this.bots.set(userId, bot);
          } catch {
            // Clean up if initialization failed
            try {
              await bot.stop();
            } catch {
              // Ignore stop errors
            }
          }
        }
      }

      // Refresh existing bots and stop removed bots
      for (const [userId, bot] of this.bots) {
        const userAccounts = accountsByUser.get(userId) ?? [];
        if (!activeUserIds.has(userId) || userAccounts.length === 0) {
          await bot.stop();
          this.bots.delete(userId);
          continue;
        }

        try {
          await bot.syncExchanges(userAccounts);
        } catch {
          return;
        }
      }
    } catch {
      return;
    }
  }

  // Helper to get stats from all bots
  public getAllOrderStats() {
    // Aggregate or return list
    return Array.from(this.bots.values()).map((bot) => ({
      userId: bot['userId'],
      trackers: bot.getOrderTrackers(),
      activeStrategyIds: bot.getActiveStrategyIds(),
    }));
  }

  private static parseInterval(value: string | undefined, fallbackMs: number): number {
    const parsed = Number.parseInt(value ?? '', 10);
    if (Number.isNaN(parsed) || parsed < 1000) {
      return fallbackMs;
    }
    return parsed;
  }
}
