import { EventEmitter } from 'events';

import { Decimal } from 'decimal.js';

import { IExchange, ILogger } from '../interfaces';
import { Balance, Position } from '../types';

export interface AccountPollingConfig {
  pollingInterval: number; // 轮询间隔（毫秒）
  enablePersistence: boolean; // 是否启用持久化
  exchanges: string[]; // 要轮询的交易所列表
  retryAttempts: number; // 失败重试次数
  retryDelay: number; // 重试延迟（毫秒）
}

export interface PollingResult {
  exchange: string;
  timestamp: Date;
  success: boolean;
  balances?: Balance[];
  positions?: Position[];
  totalEquity?: Decimal;
  error?: string;
}

export interface AccountSnapshotData {
  id?: number;
  accountInfoId?: number; // Optional account link
  exchange: string;
  timestamp: Date;
  totalBalance: Decimal;
  availableBalance: Decimal;
  lockedBalance: Decimal;
  savingBalance?: Decimal;
  totalPositionValue: Decimal;
  unrealizedPnl: Decimal;
  positionCount: number;
  balances: Balance[];
  positions: Position[];
}

/**
 * Data manager interface for account snapshot persistence
 */
export interface IAccountDataManager {
  saveAccountSnapshot?(snapshot: AccountSnapshotData): Promise<void>;
  getLatestAccountSnapshot?(exchange: string): Promise<AccountSnapshotData | null>;
  getAccountSnapshotHistory?(
    exchange: string,
    startTime: Date,
    endTime: Date,
  ): Promise<AccountSnapshotData[]>;
}

/**
 * AccountPollingService - 定时轮询交易所账户信息
 *
 * 功能：
 * - 定时轮询多个交易所的 balance 和 position
 * - 持久化数据到数据库
 * - 为 risk-manager 提供实时数据
 * - 为 web 应用提供历史数据
 */
export class AccountPollingService extends EventEmitter {
  private config: AccountPollingConfig;
  private exchanges: Map<string, IExchange> = new Map();
  private pollingTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private logger?: ILogger;
  private dataManager?: IAccountDataManager;

  constructor(config: Partial<AccountPollingConfig> = {}, logger?: ILogger) {
    super();

    this.config = {
      pollingInterval: config.pollingInterval || 60000, // 默认1分钟
      enablePersistence: config.enablePersistence ?? true,
      exchanges: config.exchanges || ['binance', 'okx', 'coinbase'],
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 5000,
    };

    this.logger = logger;

    this.logger?.info('AccountPollingService initialized', {
      config: this.config,
    });
  }

  private exchangeMetadata: Map<string, { accountInfoId?: number }> = new Map();

  /**
   * 注册交易所
   */
  registerExchange(
    name: string,
    exchange: IExchange,
    metadata: { accountInfoId?: number } = {},
  ): void {
    const key = name.toLowerCase();
    this.exchanges.set(key, exchange);
    this.exchangeMetadata.set(key, metadata);
    
    // Ensure it's in the polling list
    if (!this.config.exchanges.includes(key)) {
      this.config.exchanges.push(key);
    }
    
    this.logger?.info('Exchange registered and added to polling list', { exchange: name, metadata });
  }

  /**
   * 设置数据管理器（用于持久化）
   */
  setDataManager(dataManager: IAccountDataManager): void {
    this.dataManager = dataManager;
    this.logger?.info('DataManager set for AccountPollingService');
  }

  /**
   * 启动轮询
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger?.warn('AccountPollingService already running');
      return;
    }

    this.isRunning = true;
    this.logger?.info('Starting AccountPollingService');

    // 立即执行一次
    await this.pollAll();

    // 设置定时轮询
    this.pollingTimer = setInterval(async () => {
      await this.pollAll();
    }, this.config.pollingInterval);

    this.emit('started');
  }

  /**
   * 停止轮询
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }

    this.logger?.info('AccountPollingService stopped');
    this.emit('stopped');
  }

  /**
   * 轮询所有交易所
   */
  private async pollAll(): Promise<void> {
    this.logger?.debug('Polling all exchanges');

    const results: PollingResult[] = [];

    for (const exchangeName of this.config.exchanges) {
      const exchange = this.exchanges.get(exchangeName.toLowerCase());

      if (!exchange) {
        this.logger?.warn('Exchange not registered', {
          exchange: exchangeName,
        });
        continue;
      }

      if (!exchange.isConnected) {
        this.logger?.warn('Exchange not connected', { exchange: exchangeName });
        continue;
      }

      const result = await this.pollExchange(exchangeName, exchange);
      results.push(result);

      // 如果轮询成功且启用持久化，保存数据
      if (
        result.success &&
        this.config.enablePersistence &&
        result.balances &&
        result.positions
      ) {
        const metadata = this.exchangeMetadata.get(exchangeName.toLowerCase());
        await this.saveSnapshot(
          exchangeName, 
          result.balances, 
          result.positions, 
          result.totalEquity,
          metadata?.accountInfoId
        );
      }
    }

    this.emit('pollingComplete', results);
  }

  /**
   * 轮询单个交易所
   */
  private async pollExchange(
    exchangeName: string,
    exchange: IExchange,
  ): Promise<PollingResult> {
    const timestamp = new Date();
    let attempt = 0;

    while (attempt < this.config.retryAttempts) {
      try {
        this.logger?.debug('Polling exchange', {
          exchange: exchangeName,
          attempt: attempt + 1,
        });

        // 并行获取 accountInfo 和 positions
        const [accountInfo, positions] = await Promise.all([
          exchange.getAccountInfo(),
          exchange.getPositions(),
        ]);
        const balances = accountInfo.balances;

        this.logger?.info('Exchange poll successful', {
          exchange: exchangeName,
          balanceCount: balances.length,
          positionCount: positions.length,
        });

        // 发出事件
        this.emit('exchangePolled', {
          exchange: exchangeName,
          balances,
          positions,
          totalEquity: accountInfo.totalEquity,
          timestamp,
        });

        return {
          exchange: exchangeName,
          timestamp,
          success: true,
          balances,
          positions,
          totalEquity: accountInfo.totalEquity,
        };
      } catch (error) {
        attempt++;
        const errorMessage = error instanceof Error ? error.message : String(error);

        this.logger?.error(
          'Exchange poll failed',
          error instanceof Error ? error : new Error(errorMessage),
          {
            exchange: exchangeName,
            attempt,
            maxAttempts: this.config.retryAttempts,
          },
        );

        if (attempt < this.config.retryAttempts) {
          // 等待后重试
          await new Promise((resolve) => setTimeout(resolve, this.config.retryDelay));
        } else {
          // 达到最大重试次数
          this.emit('pollingError', {
            exchange: exchangeName,
            error: errorMessage,
            timestamp,
          });

          return {
            exchange: exchangeName,
            timestamp,
            success: false,
            error: errorMessage,
          };
        }
      }
    }

    // 理论上不会到这里
    return {
      exchange: exchangeName,
      timestamp,
      success: false,
      error: 'Max retry attempts reached',
    };
  }

  /**
   * 保存账户快照到数据库
   */
  private async saveSnapshot(
    exchange: string,
    balances: Balance[],
    positions: Position[],
    totalEquity?: Decimal,
    accountInfoId?: number,
  ): Promise<void> {
    if (!this.dataManager) {
      this.logger?.warn('DataManager not set, skipping persistence');
      return;
    }

    try {
      // 计算统计数据
      const totalBalance = totalEquity ?? balances.reduce((sum, b) => sum.add(b.total), new Decimal(0));
      const availableBalance = balances.reduce(
        (sum, b) => sum.add(b.free),
        new Decimal(0),
      );
      const lockedBalance = balances.reduce(
        (sum, b) => sum.add(b.locked),
        new Decimal(0),
      );
      const savingBalance = balances.reduce(
        (sum, b) => sum.add(b.saving || new Decimal(0)),
        new Decimal(0),
      );
      const totalPositionValue = positions.reduce(
        (sum, p) => sum.add(p.quantity.mul(p.markPrice)),
        new Decimal(0),
      );
      const unrealizedPnl = positions.reduce(
        (sum, p) => sum.add(p.unrealizedPnl || new Decimal(0)),
        new Decimal(0),
      );

      const snapshot: AccountSnapshotData = {
        exchange,
        accountInfoId,
        timestamp: new Date(),
        totalBalance,
        availableBalance,
        lockedBalance,
        savingBalance,
        totalPositionValue,
        unrealizedPnl,
        positionCount: positions.length,
        balances: balances.map((b) => ({
          asset: b.asset,
          free: b.free,
          locked: b.locked,
          saving: b.saving,
          total: b.total,
        })),
        positions: positions.map((p) => ({
          symbol: p.symbol,
          side: p.side,
          quantity: p.quantity,
          avgPrice: p.avgPrice,
          markPrice: p.markPrice,
          unrealizedPnl: p.unrealizedPnl || new Decimal(0),
          leverage: p.leverage,
          timestamp: p.timestamp,
        })),
      };

      // 保存到数据库
      if (this.dataManager.saveAccountSnapshot) {
        await this.dataManager.saveAccountSnapshot(snapshot);

        this.logger?.debug('Account snapshot saved', {
          exchange,
          totalBalance: totalBalance.toString(),
          positionCount: positions.length,
        });

        this.emit('snapshotSaved', snapshot);
      }
    } catch (error) {
      this.logger?.error(
        'Failed to save account snapshot',
        error instanceof Error ? error : new Error(String(error)),
        {
          exchange,
        },
      );

      this.emit('snapshotError', {
        exchange,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 手动触发一次轮询
   */
  async pollNow(): Promise<PollingResult[]> {
    this.logger?.info('Manual polling triggered');

    const results: PollingResult[] = [];

    for (const exchangeName of this.config.exchanges) {
      const exchange = this.exchanges.get(exchangeName.toLowerCase());

      if (!exchange) {
        this.logger?.warn('Exchange not registered', {
          exchange: exchangeName,
        });
        continue;
      }

      if (!exchange.isConnected) {
        this.logger?.warn('Exchange not connected', { exchange: exchangeName });
        continue;
      }

      const result = await this.pollExchange(exchangeName, exchange);
      results.push(result);

      if (
        result.success &&
        this.config.enablePersistence &&
        result.balances &&
        result.positions
      ) {
        const metadata = this.exchangeMetadata.get(exchangeName.toLowerCase());
        await this.saveSnapshot(
          exchangeName, 
          result.balances, 
          result.positions, 
          result.totalEquity,
          metadata?.accountInfoId
        );
      }
    }

    return results;
  }

  /**
   * 获取最新的账户数据（从缓存）
   */
  async getLatestSnapshot(exchange: string): Promise<AccountSnapshotData | null> {
    if (!this.dataManager || !this.dataManager.getLatestAccountSnapshot) {
      return null;
    }

    try {
      return await this.dataManager.getLatestAccountSnapshot(exchange);
    } catch (error) {
      this.logger?.error(
        'Failed to get latest snapshot',
        error instanceof Error ? error : new Error(String(error)),
        {
          exchange,
        },
      );
      return null;
    }
  }

  /**
   * 获取历史快照
   */
  async getSnapshotHistory(
    exchange: string,
    startTime: Date,
    endTime: Date,
  ): Promise<AccountSnapshotData[]> {
    if (!this.dataManager || !this.dataManager.getAccountSnapshotHistory) {
      return [];
    }

    try {
      return await this.dataManager.getAccountSnapshotHistory(
        exchange,
        startTime,
        endTime,
      );
    } catch (error) {
      this.logger?.error(
        'Failed to get snapshot history',
        error instanceof Error ? error : new Error(String(error)),
        {
          exchange,
          startTime,
          endTime,
        },
      );
      return [];
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<AccountPollingConfig>): void {
    const wasRunning = this.isRunning;

    if (wasRunning) {
      this.stop();
    }

    this.config = { ...this.config, ...config };
    this.logger?.info('Configuration updated', { config: this.config });

    if (wasRunning) {
      this.start();
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): AccountPollingConfig {
    return { ...this.config };
  }

  /**
   * 获取运行状态
   */
  getStatus(): {
    isRunning: boolean;
    registeredExchanges: string[];
    config: AccountPollingConfig;
  } {
    return {
      isRunning: this.isRunning,
      registeredExchanges: Array.from(this.exchanges.keys()),
      config: this.config,
    };
  }
}
