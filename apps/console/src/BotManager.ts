import { TypeOrmDataManager, AccountInfoEntity } from '@itrade/data-manager';
import { ConsoleLogger } from '@itrade/core';
import { BotInstance } from './BotInstance';

export class BotManager {
  private bots = new Map<string, BotInstance>();
  private isRunning = false;
  private readonly refreshIntervalMs: number;
  private pgListenRelease: (() => void) | null = null;
  private notifyDebounceTimer: NodeJS.Timeout | null = null;

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

    // Set up periodic refresh to catch new users/accounts.
    // This is the FALLBACK — PG LISTEN/NOTIFY is the primary push path.
    // Prod raises this to 600s via BOT_REFRESH_INTERVAL_MS env.
    setInterval(() => this.refreshBots(), this.refreshIntervalMs);

    // Subscribe to pg_notify pushes from web for immediate wake-up
    await this.setupConfigChangeListener();
  }

  public async stop(): Promise<void> {
    // Release the dedicated LISTEN connection first so we don't process
    // notifications during teardown.
    if (this.pgListenRelease) {
      try {
        this.pgListenRelease();
      } catch {
        // best-effort — ignore release errors
      }
      this.pgListenRelease = null;
    }
    if (this.notifyDebounceTimer) {
      clearTimeout(this.notifyDebounceTimer);
      this.notifyDebounceTimer = null;
    }

    for (const [, bot] of this.bots) {
      await bot.stop();
    }
    this.bots.clear();
    this.isRunning = false;
  }

  /**
   * Wake-up path for pg_notify from web.
   * Holds a dedicated PoolClient from TypeORM's master pool in LISTEN mode.
   * Debounces bursts of notifications (e.g. user editing multiple rows)
   * into a single refreshBots call.
   *
   * Failure here is non-fatal — the periodic setInterval above still runs,
   * so we log and continue; worst case the system falls back to the 60s/600s
   * polling path.
   */
  private async setupConfigChangeListener(): Promise<void> {
    try {
      const driver = this.dataManager.dataSource.driver as unknown as {
        obtainMasterConnection?: () => Promise<
          [
            {
              on: (
                evt: string,
                cb: (msg: { channel: string; payload: string }) => void,
              ) => void;
              query: (sql: string) => Promise<unknown>;
            },
            () => void,
          ]
        >;
      };

      if (typeof driver.obtainMasterConnection !== 'function') {
        this.logger.warn(
          'driver lacks obtainMasterConnection — LISTEN disabled, polling fallback active',
        );
        return;
      }

      const [client, release] = await driver.obtainMasterConnection();

      try {
        client.on('notification', (msg) => {
          if (msg.channel !== 'itrade_config_changed') return;
          // Debounce bursts of writes (bulk edit, retry loops) into one refresh.
          if (this.notifyDebounceTimer) clearTimeout(this.notifyDebounceTimer);
          this.notifyDebounceTimer = setTimeout(() => {
            this.notifyDebounceTimer = null;
            this.logger.info('pg_notify received — refreshing bots/strategies');
            this.refreshBots().catch((err) => {
              this.logger.warn(
                `refreshBots after pg_notify failed: ${(err as Error).message}`,
              );
            });
          }, 50);
        });

        await client.query('LISTEN itrade_config_changed');
        // Only remember the release AFTER LISTEN succeeds — otherwise the
        // catch below releases it immediately and stop() shouldn't double-release.
        this.pgListenRelease = release;
        this.logger.info('LISTEN itrade_config_changed registered');
      } catch (err) {
        // LISTEN failed after we acquired the client — release the pool slot
        // immediately so we don't permanently leak a pg client from the pool.
        try {
          release();
        } catch {
          // ignore double-release
        }
        throw err;
      }
    } catch (err) {
      this.logger.warn(
        `LISTEN setup failed (polling fallback intact): ${(err as Error).message}`,
      );
    }
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

        // Also push strategy changes immediately (NOTIFY also covers strategy
        // writes — wake the strategy manager instead of waiting for its own
        // periodic timer). Falls back gracefully if BotInstance doesn't expose it.
        try {
          await bot.syncStrategiesNow();
        } catch {
          // strategy sync failure must not break account-sync flow
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
