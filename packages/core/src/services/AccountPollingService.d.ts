import { EventEmitter } from 'events';
import { Decimal } from 'decimal.js';
import { IExchange, ILogger } from '../interfaces';
import { Balance, Position } from '../types';
export interface AccountPollingConfig {
    pollingInterval: number;
    enablePersistence: boolean;
    exchanges: string[];
    retryAttempts: number;
    retryDelay: number;
}
export interface PollingResult {
    exchange: string;
    timestamp: Date;
    success: boolean;
    balances?: Balance[];
    positions?: Position[];
    error?: string;
}
export interface AccountSnapshotData {
    id?: number;
    exchange: string;
    timestamp: Date;
    totalBalance: Decimal;
    availableBalance: Decimal;
    lockedBalance: Decimal;
    totalPositionValue: Decimal;
    unrealizedPnl: Decimal;
    positionCount: number;
    balances: Balance[];
    positions: Position[];
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
export declare class AccountPollingService extends EventEmitter {
    private config;
    private exchanges;
    private pollingTimer;
    private isRunning;
    private logger?;
    private dataManager?;
    constructor(config?: Partial<AccountPollingConfig>, logger?: ILogger);
    /**
     * 注册交易所
     */
    registerExchange(name: string, exchange: IExchange): void;
    /**
     * 设置数据管理器（用于持久化）
     */
    setDataManager(dataManager: any): void;
    /**
     * 启动轮询
     */
    start(): Promise<void>;
    /**
     * 停止轮询
     */
    stop(): Promise<void>;
    /**
     * 轮询所有交易所
     */
    private pollAll;
    /**
     * 轮询单个交易所
     */
    private pollExchange;
    /**
     * 保存账户快照到数据库
     */
    private saveSnapshot;
    /**
     * 手动触发一次轮询
     */
    pollNow(): Promise<PollingResult[]>;
    /**
     * 获取最新的账户数据（从缓存）
     */
    getLatestSnapshot(exchange: string): Promise<AccountSnapshotData | null>;
    /**
     * 获取历史快照
     */
    getSnapshotHistory(exchange: string, startTime: Date, endTime: Date): Promise<AccountSnapshotData[]>;
    /**
     * 更新配置
     */
    updateConfig(config: Partial<AccountPollingConfig>): void;
    /**
     * 获取当前配置
     */
    getConfig(): AccountPollingConfig;
    /**
     * 获取运行状态
     */
    getStatus(): {
        isRunning: boolean;
        registeredExchanges: string[];
        config: AccountPollingConfig;
    };
}
//# sourceMappingURL=AccountPollingService.d.ts.map