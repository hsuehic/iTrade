import {
  AccountPollingService,
  ConsoleLogger,
  IExchange,
  EventBus,
  OrderStatus,
  TradingEngine,
  type ExchangeCredentials,
  type Order,
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
  private readonly pollingConfig: {
    pollingInterval: number;
    enablePersistence: boolean;
    retryAttempts: number;
  };
  private readonly openOrdersSyncInterval: number;
  private openOrdersSyncTimer: NodeJS.Timeout | null = null;
  private isOpenOrdersSyncRunning = false;
  private exchanges = new Map<string, IExchange>();
  private exchangeAccountIds = new Map<string, number>();
  private isRunning = false;
  private exchangeSyncListeners = new Map<string, () => void>();

  constructor(
    private readonly userId: string,
    private readonly dataManager: TypeOrmDataManager,
    private readonly logger: ConsoleLogger,
  ) {
    this.riskManager = new RiskManager({
      maxDrawdown: new Decimal(20),
      maxPositionSize: new Decimal(10),
      maxDailyLoss: new Decimal(5),
    });

    this.portfolioManager = new PortfolioManager(new Decimal(10000));
    this.engine = new TradingEngine(
      this.riskManager,
      this.portfolioManager,
      this.logger,
      userId,
    );

    this.pushNotificationService = new PushNotificationService(dataManager, logger, {
      defaultUserId: userId,
    });

    this.orderTracker = new OrderTracker(
      dataManager,
      logger,
      this.pushNotificationService,
      userId,
    );
    this.balanceTracker = new BalanceTracker(userId, dataManager, logger);
    this.positionTracker = new PositionTracker(
      userId,
      dataManager,
      logger,
      (exchangeName) => this.exchanges.get(exchangeName),
    );

    this.strategyManager = new StrategyManager(this.engine, dataManager, logger, userId);

    this.pollingConfig = {
      pollingInterval: BotInstance.parseInterval(
        process.env.ACCOUNT_POLLING_INTERVAL,
        60000,
      ),
      enablePersistence: true,
      retryAttempts: 3,
    };

    this.pollingService = new AccountPollingService(this.pollingConfig, logger);
    this.pollingService.setDataManager(dataManager);

    this.openOrdersSyncInterval = BotInstance.parseInterval(
      process.env.OPEN_ORDERS_SYNC_INTERVAL,
      60000,
    );

    // Setup snapshot listener to update balance history
    this.setupPollingListeners();
  }

  private setupPollingListeners() {
    type BalanceSnapshot = {
      accountInfoId?: number;
      totalBalance: string;
      availableBalance: string;
      lockedBalance: string;
      exchange: string;
      timestamp: Date;
      savingBalance?: string;
    };

    this.pollingService.on('snapshotSaved', async (snapshot: BalanceSnapshot) => {
      try {
        if (!snapshot.accountInfoId) return;

        const accountRepo = this.dataManager.dataSource.getRepository(AccountInfoEntity);
        const accountInfo = await accountRepo.findOne({
          where: { id: snapshot.accountInfoId },
        });

        if (accountInfo) {
          const snapshotTotal = new Decimal(snapshot.totalBalance);
          const calculatedTotal = new Decimal(snapshot.availableBalance).add(
            new Decimal(snapshot.lockedBalance),
          );

          this.logger.info(
            `[BalanceSync] ${snapshot.exchange} - Snapshot Total: ${snapshotTotal}, Calc(Free+Locked): ${calculatedTotal}, Diff: ${snapshotTotal.minus(calculatedTotal)}`,
          );

          await this.dataManager.updateBalanceHistory(
            accountInfo,
            new Decimal(snapshot.availableBalance),
            new Decimal(snapshot.lockedBalance),
            new Decimal(snapshot.totalBalance),
            snapshot.timestamp,
            snapshot.savingBalance ? new Decimal(snapshot.savingBalance) : new Decimal(0),
          );
          this.logger.debug(
            `Synced balance history for ${snapshot.exchange} (User: ${this.userId})`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to sync balance history for ${snapshot.exchange}`,
          error as Error,
        );
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
    await this.syncOpenOrders();
    this.startOpenOrdersSync();
    this.isRunning = true;
    this.logger.info(`🚀 Bot started for user ${this.userId}`);
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.logger.info(`🛑 Stopping bot for user ${this.userId}...`);

    this.stopOpenOrdersSync();

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
    for (const exchange of this.exchanges.values()) {
      await exchange.disconnect();
    }
    this.exchanges.clear();

    this.isRunning = false;
    this.logger.info(`✅ Bot stopped for user ${this.userId}`);
  }

  public async syncExchanges(accounts: AccountInfoEntity[]): Promise<void> {
    const desiredAccounts = new Map<string, AccountInfoEntity>();
    for (const account of accounts) {
      if (!account.exchange) continue;
      const exchangeName = account.exchange.toLowerCase();
      if (!desiredAccounts.has(exchangeName)) {
        desiredAccounts.set(exchangeName, account);
      }
    }

    let removedAny = false;

    for (const [exchangeName, account] of desiredAccounts) {
      const existingAccountId = this.exchangeAccountIds.get(exchangeName);
      if (!this.exchanges.has(exchangeName)) {
        await this.connectExchangeForAccount(account);
        continue;
      }

      if (existingAccountId && existingAccountId !== account.id) {
        await this.removeExchangeByName(exchangeName);
        removedAny = true;
        await this.connectExchangeForAccount(account);
      }
    }

    for (const exchangeName of this.exchanges.keys()) {
      if (!desiredAccounts.has(exchangeName)) {
        await this.removeExchangeByName(exchangeName);
        removedAny = true;
      }
    }

    if (removedAny) {
      await this.rebuildPollingService();
    }
  }

  private async loadExchanges(): Promise<void> {
    const accountRepo = this.dataManager.dataSource.getRepository(AccountInfoEntity);
    const accounts = await accountRepo.find({
      where: { userId: this.userId, isActive: true },
    });

    if (accounts.length === 0) {
      throw new Error(`No active accounts found for user ${this.userId}`);
    }

    let successCount = 0;
    let skipCount = 0;

    for (const account of accounts) {
      try {
        const connected = await this.connectExchangeForAccount(account);
        if (connected) {
          successCount++;
        } else {
          skipCount++;
        }
      } catch (error) {
        this.logger.error(
          `   ❌ Failed to load ${account.exchange} for user ${this.userId}`,
          error as Error,
        );
        skipCount++;
      }
    }

    // Ensure at least one exchange was loaded successfully
    if (successCount === 0) {
      throw new Error(
        `No valid exchanges loaded for user ${this.userId}. ` +
          `Found ${accounts.length} accounts, ${skipCount} skipped/failed. ` +
          `Please ensure accounts have valid API credentials.`,
      );
    }

    this.logger.info(
      `   📊 Loaded ${successCount} exchange(s) for user ${this.userId} (${skipCount} skipped)`,
    );
  }

  public getOrderTrackers() {
    return this.orderTracker;
  }

  private async connectExchangeForAccount(account: AccountInfoEntity): Promise<boolean> {
    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY environment variable is required');
    }

    const exchangeName = account.exchange.toLowerCase();
    let exchange: IExchange | null = null;
    let connectOptions: ExchangeCredentials;

    if (!account.apiKey || !account.secretKey) {
      this.logger.warn(`   ⚠️  ${exchangeName} account missing credentials, skipping`);
      return false;
    }

    const apiKey = CryptoUtils.decrypt(account.apiKey, encryptionKey);
    const secretKey = CryptoUtils.decrypt(account.secretKey, encryptionKey);
    const passphrase = account.passphrase
      ? CryptoUtils.decrypt(account.passphrase, encryptionKey)
      : undefined;

    const USE_MAINNET_FOR_DATA = true; // Or from config

    switch (exchangeName) {
      case 'binance':
        exchange = new BinanceExchange(!USE_MAINNET_FOR_DATA);
        connectOptions = { apiKey, secretKey, sandbox: !USE_MAINNET_FOR_DATA };
        break;
      case 'okx':
        if (!passphrase) {
          this.logger.warn(`   ⚠️  OKX account missing passphrase, skipping`);
          return false;
        }
        exchange = new OKXExchange(!USE_MAINNET_FOR_DATA);
        connectOptions = {
          apiKey,
          secretKey,
          passphrase,
          sandbox: !USE_MAINNET_FOR_DATA,
        };
        break;
      case 'coinbase':
        exchange = new CoinbaseExchange();
        connectOptions = { apiKey, secretKey, sandbox: !USE_MAINNET_FOR_DATA };
        break;
      default:
        this.logger.warn(`   ⚠️  Unknown exchange type: ${exchangeName}, skipping`);
        return false;
    }

    await exchange.connect(connectOptions);
    await this.engine.addExchange(exchangeName, exchange);

    // Add to polling service
    this.pollingService.registerExchange(exchangeName, exchange, {
      accountInfoId: account.id,
    });

    this.exchanges.set(exchangeName, exchange);
    this.exchangeAccountIds.set(exchangeName, account.id);
    this.registerExchangeSyncListeners(exchangeName, exchange);
    this.logger.info(`   ✅ ${exchangeName} connected (User: ${this.userId})`);
    return true;
  }

  private async removeExchangeByName(exchangeName: string): Promise<void> {
    const exchange = this.exchanges.get(exchangeName);
    if (!exchange) return;
    this.unregisterExchangeSyncListeners(exchangeName, exchange);

    try {
      await exchange.disconnect();
    } catch (error) {
      this.logger.warn(
        `   ⚠️  Failed to disconnect ${exchangeName} for user ${this.userId}`,
        {
          error: (error as Error).message,
        },
      );
    }

    try {
      this.engine.removeExchange(exchangeName);
    } catch (error) {
      this.logger.warn(
        `   ⚠️  Failed to remove ${exchangeName} from engine for user ${this.userId}`,
        {
          error: (error as Error).message,
        },
      );
    }

    this.exchanges.delete(exchangeName);
    this.exchangeAccountIds.delete(exchangeName);
  }

  private async rebuildPollingService(): Promise<void> {
    const wasRunning = this.isRunning;
    await this.pollingService.stop();
    this.pollingService.removeAllListeners();

    this.pollingService = new AccountPollingService(this.pollingConfig, this.logger);
    this.pollingService.setDataManager(this.dataManager);
    this.setupPollingListeners();

    for (const [exchangeName, exchange] of this.exchanges) {
      this.pollingService.registerExchange(exchangeName, exchange, {
        accountInfoId: this.exchangeAccountIds.get(exchangeName),
      });
    }

    if (wasRunning) {
      await this.pollingService.start();
    }
  }

  private startOpenOrdersSync(): void {
    if (this.openOrdersSyncTimer) {
      return;
    }

    this.openOrdersSyncTimer = setInterval(() => {
      void this.syncOpenOrders();
    }, this.openOrdersSyncInterval);

    this.logger.info(
      `⏱️ Open orders sync enabled every ${Math.round(
        this.openOrdersSyncInterval / 1000,
      )}s (User: ${this.userId})`,
    );
  }

  private stopOpenOrdersSync(): void {
    if (!this.openOrdersSyncTimer) {
      return;
    }

    clearInterval(this.openOrdersSyncTimer);
    this.openOrdersSyncTimer = null;
    this.logger.info(`⏹️ Open orders sync stopped (User: ${this.userId})`);
  }

  private async syncOpenOrders(): Promise<void> {
    if (this.isOpenOrdersSyncRunning) {
      return;
    }

    if (this.exchanges.size === 0) {
      return;
    }

    this.isOpenOrdersSyncRunning = true;
    const orderManager = this.orderTracker.getOrderManager();

    try {
      for (const [exchangeName, exchange] of this.exchanges) {
        await this.syncExchangeOpenOrders(exchangeName, exchange, orderManager);
      }
    } finally {
      this.isOpenOrdersSyncRunning = false;
    }
  }

  private async persistOpenOrderSnapshot(
    orderManager: ReturnType<OrderTracker['getOrderManager']>,
    order: Order,
    exchangeName: string,
  ): Promise<void> {
    const exchange = order.exchange ?? exchangeName;
    const existingOrder = orderManager.getOrder(order.id);
    const normalizedOrder: Order = {
      ...existingOrder,
      ...order,
      exchange,
      userId: order.userId ?? existingOrder?.userId ?? this.userId,
      strategyId: order.strategyId ?? existingOrder?.strategyId,
      strategyType: order.strategyType ?? existingOrder?.strategyType,
      strategyName: order.strategyName ?? existingOrder?.strategyName,
    };

    if (orderManager.getOrder(normalizedOrder.id)) {
      orderManager.updateOrder(normalizedOrder.id, normalizedOrder);
    } else {
      orderManager.addOrder(normalizedOrder);
      EventBus.getInstance().emitOrderCreated({
        order: normalizedOrder,
        timestamp: new Date(),
      });
    }

    await this.dataManager.saveOrder({
      id: normalizedOrder.id,
      clientOrderId: normalizedOrder.clientOrderId,
      userId: normalizedOrder.userId,
      symbol: normalizedOrder.symbol,
      side: normalizedOrder.side,
      type: normalizedOrder.type,
      quantity: normalizedOrder.quantity,
      price: normalizedOrder.price,
      status: normalizedOrder.status,
      timeInForce: normalizedOrder.timeInForce,
      timestamp: normalizedOrder.timestamp,
      updateTime: normalizedOrder.updateTime ?? normalizedOrder.timestamp,
      executedQuantity: normalizedOrder.executedQuantity,
      cummulativeQuoteQuantity: normalizedOrder.cummulativeQuoteQuantity,
      exchange,
      strategyId: normalizedOrder.strategyId,
      strategyType: normalizedOrder.strategyType,
      strategyName: normalizedOrder.strategyName,
    });
  }

  private registerExchangeSyncListeners(exchangeName: string, exchange: IExchange): void {
    if (this.exchangeSyncListeners.has(exchangeName)) {
      return;
    }

    const handleReconnect = () => {
      if (!this.isRunning) {
        return;
      }
      this.logger.info(
        `🔌 ${exchangeName} WebSocket reconnected - refreshing open order status (User: ${this.userId})`,
      );
      void this.syncOpenOrders();
    };

    exchange.on('ws_connected', handleReconnect);
    this.exchangeSyncListeners.set(exchangeName, handleReconnect);
  }

  private unregisterExchangeSyncListeners(
    exchangeName: string,
    exchange: IExchange,
  ): void {
    const listener = this.exchangeSyncListeners.get(exchangeName);
    if (!listener) {
      return;
    }
    exchange.off('ws_connected', listener);
    this.exchangeSyncListeners.delete(exchangeName);
  }

  private async syncExchangeOpenOrders(
    exchangeName: string,
    exchange: IExchange,
    orderManager: ReturnType<OrderTracker['getOrderManager']>,
  ): Promise<void> {
    try {
      const [openOrders, dbOpenOrders] = await Promise.all([
        exchange.getOpenOrders(),
        this.getDbOpenOrdersForExchange(exchangeName),
      ]);

      if (openOrders.length > 0) {
        const results = await Promise.allSettled(
          openOrders.map((order) =>
            this.persistOpenOrderSnapshot(orderManager, order, exchangeName),
          ),
        );

        const failed = results.filter((result) => result.status === 'rejected').length;
        if (failed > 0) {
          this.logger.warn(
            `⚠️ Open orders sync partially failed for ${exchangeName} (${failed}/${openOrders.length})`,
          );
        }
      }

      const openOrderIds = new Set(openOrders.map((order) => order.id));
      const staleOrders = dbOpenOrders.filter((order) => !openOrderIds.has(order.id));
      if (staleOrders.length === 0) {
        return;
      }

      for (const order of staleOrders) {
        await this.refreshOrderStatus(exchangeName, exchange, orderManager, order);
      }
    } catch (error) {
      this.logger.warn(`⚠️ Failed to sync open orders for ${exchangeName}`, {
        error: (error as Error).message,
      });
    }
  }

  private async getDbOpenOrdersForExchange(exchangeName: string): Promise<Order[]> {
    const [newOrders, partiallyFilledOrders] = await Promise.all([
      this.dataManager.getOrders({
        exchange: exchangeName,
        status: OrderStatus.NEW,
        userId: this.userId,
      }),
      this.dataManager.getOrders({
        exchange: exchangeName,
        status: OrderStatus.PARTIALLY_FILLED,
        userId: this.userId,
      }),
    ]);

    return [...newOrders, ...partiallyFilledOrders];
  }

  private async refreshOrderStatus(
    exchangeName: string,
    exchange: IExchange,
    orderManager: ReturnType<OrderTracker['getOrderManager']>,
    order: Order,
  ): Promise<void> {
    try {
      const latestOrder = await exchange.getOrder(
        order.symbol,
        order.id,
        order.clientOrderId,
      );
      const normalizedOrder: Order = {
        ...order,
        ...latestOrder,
        exchange: latestOrder.exchange ?? order.exchange ?? exchangeName,
        userId: latestOrder.userId ?? order.userId ?? this.userId,
        strategyId: latestOrder.strategyId ?? order.strategyId,
        strategyType: latestOrder.strategyType ?? order.strategyType,
        strategyName: latestOrder.strategyName ?? order.strategyName,
      };

      if (orderManager.getOrder(normalizedOrder.id)) {
        orderManager.updateOrder(normalizedOrder.id, normalizedOrder);
      } else {
        orderManager.addOrder(normalizedOrder);
      }

      await this.dataManager.saveOrder({
        id: normalizedOrder.id,
        clientOrderId: normalizedOrder.clientOrderId,
        userId: normalizedOrder.userId,
        symbol: normalizedOrder.symbol,
        side: normalizedOrder.side,
        type: normalizedOrder.type,
        quantity: normalizedOrder.quantity,
        price: normalizedOrder.price,
        status: normalizedOrder.status,
        timeInForce: normalizedOrder.timeInForce,
        timestamp: normalizedOrder.timestamp,
        updateTime: normalizedOrder.updateTime ?? new Date(),
        executedQuantity: normalizedOrder.executedQuantity,
        cummulativeQuoteQuantity: normalizedOrder.cummulativeQuoteQuantity,
        exchange: normalizedOrder.exchange ?? exchangeName,
        strategyId: normalizedOrder.strategyId,
        strategyType: normalizedOrder.strategyType,
        strategyName: normalizedOrder.strategyName,
      });

      if (normalizedOrder.status !== order.status) {
        this.logger.info(
          `📌 Order ${order.id} status updated (${exchangeName}): ${order.status} → ${normalizedOrder.status}`,
        );

        // Emit status-specific events for the tracker and notifications
        const eventBus = EventBus.getInstance();
        const eventData = { order: normalizedOrder, timestamp: new Date() };

        switch (normalizedOrder.status) {
          case OrderStatus.FILLED:
            eventBus.emitOrderFilled(eventData);
            break;
          case OrderStatus.PARTIALLY_FILLED:
            eventBus.emitOrderPartiallyFilled(eventData);
            break;
          case OrderStatus.CANCELED:
            eventBus.emitOrderCancelled(eventData);
            break;
          case OrderStatus.REJECTED:
            eventBus.emitOrderRejected(eventData);
            break;
          case OrderStatus.EXPIRED:
            // Optional: emit if needed
            break;
        }
      }
    } catch (error) {
      this.logger.warn(
        `⚠️ Failed to refresh order ${order.id} status for ${exchangeName}`,
        {
          error: (error as Error).message,
        },
      );
    }
  }

  private static parseInterval(value: string | undefined, fallbackMs: number): number {
    const parsed = Number.parseInt(value ?? '', 10);
    if (Number.isNaN(parsed) || parsed < 1000) {
      return fallbackMs;
    }
    return parsed;
  }
}
