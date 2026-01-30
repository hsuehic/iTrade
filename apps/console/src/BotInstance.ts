import {
  ConsoleLogger,
  TradingEngine,
  LogLevel,
  IExchange,
  AccountPollingService,
} from '@itrade/core';
import { RiskManager } from '@itrade/risk-manager';
import { PortfolioManager } from '@itrade/portfolio-manager';
import {
  BinanceExchange,
  CoinbaseExchange,
  OKXExchange,
} from '@itrade/exchange-connectors';
import { TypeOrmDataManager, AccountInfoEntity } from '@itrade/data-manager';
import { Decimal } from 'decimal.js';
import { StrategyManager } from './integration/helpers/strategy-manager';
import { OrderTracker } from './integration/helpers/order-tracker';
import { BalanceTracker } from './integration/helpers/balance-tracker';
import { PositionTracker } from './integration/helpers/position-tracker';
import { PushNotificationService } from './services/push-notification-service';
import { CryptoUtils } from '@itrade/utils/CryptoUtils';

export class BotInstance {
  public engine: TradingEngine;
  private riskManager: RiskManager;
  private portfolioManager: PortfolioManager;
  private strategyManager: StrategyManager;
  private orderTracker: OrderTracker;
  private balanceTracker: BalanceTracker;
  private positionTracker: PositionTracker;
  private pushNotificationService: PushNotificationService;
  private pollingService: AccountPollingService;
  private exchanges = new Map<string, IExchange>();
  private isRunning = false;

  constructor(
    private readonly userId: string,
    private readonly dataManager: TypeOrmDataManager,
    private readonly logger: ConsoleLogger
  ) {
    this.riskManager = new RiskManager({
      maxDrawdown: new Decimal(20),
      maxPositionSize: new Decimal(10),
      maxDailyLoss: new Decimal(5),
    });

    this.portfolioManager = new PortfolioManager(new Decimal(10000));
    this.engine = new TradingEngine(this.riskManager, this.portfolioManager, this.logger);

    this.pushNotificationService = new PushNotificationService(dataManager, logger, {
      defaultUserId: userId,
    });
    
    this.orderTracker = new OrderTracker(dataManager, logger, this.pushNotificationService);
    this.balanceTracker = new BalanceTracker(userId, dataManager, logger);
    this.positionTracker = new PositionTracker(userId, dataManager, logger);
    
    this.strategyManager = new StrategyManager(
      this.engine,
      dataManager,
      logger,
      userId
    );

    this.pollingService = new AccountPollingService({
      pollingInterval: 60000, // 1 minute
      enablePersistence: true,
      retryAttempts: 3,
    }, logger);
    this.pollingService.setDataManager(dataManager);

    // Setup snapshot listener to update balance history
    this.setupPollingListeners();
  }

  private setupPollingListeners() {
    this.pollingService.on('snapshotSaved', async (snapshot: any) => {
      try {
        if (!snapshot.accountInfoId) return;

        const accountRepo = this.dataManager.dataSource.getRepository(AccountInfoEntity);
        const accountInfo = await accountRepo.findOne({ where: { id: snapshot.accountInfoId } });

        if (accountInfo) {
          const snapshotTotal = new Decimal(snapshot.totalBalance);
          const calculatedTotal = new Decimal(snapshot.availableBalance).add(new Decimal(snapshot.lockedBalance));
          
          this.logger.info(`[BalanceSync] ${snapshot.exchange} - Snapshot Total: ${snapshotTotal}, Calc(Free+Locked): ${calculatedTotal}, Diff: ${snapshotTotal.minus(calculatedTotal)}`);

          await this.dataManager.updateBalanceHistory(
            accountInfo,
            snapshot.availableBalance,
            snapshot.lockedBalance,
            snapshot.totalBalance,
            snapshot.timestamp,
            snapshot.savingBalance
          );
          this.logger.debug(`Synced balance history for ${snapshot.exchange} (User: ${this.userId})`);
        }
      } catch (error) {
        this.logger.error(`Failed to sync balance history for ${snapshot.exchange}`, error as Error);
      }
    });
  }

  public async initialize(): Promise<void> {
    this.logger.info(`🤖 Initializing bot for user ${this.userId}...`);

    // Initialize Trackers
    await this.orderTracker.start();
    await this.balanceTracker.start();
    await this.positionTracker.start();
    // pollingService will be started after exchanges are loaded


    // Load Exchanges
    await this.loadExchanges();

    // Initialize Strategy Manager
    await this.strategyManager.start();

    this.logger.info(`✅ Bot initialized for user ${this.userId}`);
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;
    
    await this.engine.start();
    await this.pollingService.start();
    this.isRunning = true;
    this.logger.info(`🚀 Bot started for user ${this.userId}`);
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.logger.info(`🛑 Stopping bot for user ${this.userId}...`);

    // Stop Strategy Manager
    await this.strategyManager.stop();

    // Stop Trackers
    await this.orderTracker.stop();
    await this.balanceTracker.stop();
    await this.positionTracker.stop();

    // Stop Polling Service
    await this.pollingService.stop();

    // Stop Engine
    await this.engine.stop();

    // Disconnect Exchanges
    for (const [name, exchange] of this.exchanges) {
      await exchange.disconnect();
    }
    this.exchanges.clear();

    this.isRunning = false;
    this.logger.info(`✅ Bot stopped for user ${this.userId}`);
  }

  private async loadExchanges(): Promise<void> {
    const accountRepo = this.dataManager.dataSource.getRepository(AccountInfoEntity);
    const accounts = await accountRepo.find({
      where: { user: { id: this.userId }, isActive: true },
    });

    if (accounts.length === 0) {
      throw new Error(`No active accounts found for user ${this.userId}`);
    }

    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY environment variable is required');
    }

    const USE_MAINNET_FOR_DATA = true; // Or from config
    let successCount = 0;
    let skipCount = 0;

    for (const account of accounts) {
      try {
        const exchangeName = account.exchange.toLowerCase();
        let exchange: IExchange | null = null;
        let connectOptions: any = {};

        // Validate credentials exist
        if (!account.apiKey || !account.secretKey) {
          this.logger.warn(`   ⚠️  ${exchangeName} account missing credentials, skipping`);
          skipCount++;
          continue;
        }

        const apiKey = CryptoUtils.decrypt(account.apiKey, encryptionKey);
        const secretKey = CryptoUtils.decrypt(account.secretKey, encryptionKey);
        const passphrase = account.passphrase
          ? CryptoUtils.decrypt(account.passphrase, encryptionKey)
          : undefined;

        switch (exchangeName) {
          case 'binance':
            exchange = new BinanceExchange(!USE_MAINNET_FOR_DATA);
            connectOptions = { apiKey, secretKey, sandbox: !USE_MAINNET_FOR_DATA };
            break;
          case 'okx':
            if (!passphrase) {
              this.logger.warn(`   ⚠️  OKX account missing passphrase, skipping`);
              skipCount++;
              continue;
            }
            exchange = new OKXExchange(!USE_MAINNET_FOR_DATA);
            connectOptions = { apiKey, secretKey, passphrase, sandbox: !USE_MAINNET_FOR_DATA };
            break;
          case 'coinbase':
            exchange = new CoinbaseExchange();
            connectOptions = { apiKey, secretKey, sandbox: !USE_MAINNET_FOR_DATA };
            break;
          default:
            this.logger.warn(`   ⚠️  Unknown exchange type: ${exchangeName}, skipping`);
            skipCount++;
            continue;
        }

        if (exchange) {
          await exchange.connect(connectOptions);
          await this.engine.addExchange(exchangeName, exchange);
          
          // Add to polling service
          this.pollingService.registerExchange(exchangeName, exchange, { accountInfoId: account.id });
          
          this.exchanges.set(exchangeName, exchange);
          this.logger.info(`   ✅ ${exchangeName} connected (User: ${this.userId})`);
          successCount++;
        }
      } catch (error) {
        this.logger.error(`   ❌ Failed to load ${account.exchange} for user ${this.userId}`, error as Error);
        skipCount++;
      }
    }

    // Ensure at least one exchange was loaded successfully
    if (successCount === 0) {
      throw new Error(
        `No valid exchanges loaded for user ${this.userId}. ` +
        `Found ${accounts.length} accounts, ${skipCount} skipped/failed. ` +
        `Please ensure accounts have valid API credentials.`
      );
    }

    this.logger.info(`   📊 Loaded ${successCount} exchange(s) for user ${this.userId} (${skipCount} skipped)`);
  }

  public getOrderTrackers() {
      return this.orderTracker;
  }
}
