import { EventEmitter } from 'events';
import { IExchange } from '../interfaces';
import { OrderStatus } from '../types';
/**
 * 订单同步服务配置
 */
export interface OrderSyncConfig {
    /** 同步间隔（毫秒），默认 5000ms */
    syncInterval?: number;
    /** 批量处理大小，默认 5 */
    batchSize?: number;
    /** 是否自动启动，默认 true */
    autoStart?: boolean;
    /** 最大错误记录数，默认 10 */
    maxErrorRecords?: number;
}
/**
 * 订单同步统计
 */
export interface OrderSyncStats {
    totalSyncs: number;
    successfulSyncs: number;
    failedSyncs: number;
    ordersUpdated: number;
    lastSyncTime: Date;
    errors: Array<{
        time: Date;
        error: string;
        orderId?: string;
    }>;
}
/**
 * 订单数据管理器接口（用于数据库操作）
 */
export interface IOrderDataManager {
    getOrders(filters: {
        status?: OrderStatus;
    }): Promise<any[]>;
    updateOrder(id: number | string, updates: any): Promise<void>;
}
/**
 * OrderSyncService - 订单状态同步服务
 *
 * 核心功能：
 * - 定时轮询未完成订单的状态
 * - 从交易所获取最新状态并更新数据库
 * - 检测状态变化并触发 EventBus 事件
 * - 防止重复事件触发
 *
 * 使用场景：
 * - WebSocket 推送失败或延迟
 * - 网络不稳定导致消息丢失
 * - 应用重启后状态恢复
 *
 * @example
 * ```typescript
 * const syncService = new OrderSyncService(exchanges, dataManager, {
 *   syncInterval: 5000,
 *   batchSize: 5
 * });
 *
 * await syncService.start();
 * ```
 */
export declare class OrderSyncService extends EventEmitter {
    private exchanges;
    private dataManager;
    private syncInterval;
    private eventBus;
    private isRunning;
    private lastKnownStatuses;
    private stats;
    private config;
    constructor(exchanges: Map<string, IExchange>, dataManager: IOrderDataManager, config?: OrderSyncConfig);
    /**
     * 启动订单同步服务
     */
    start(): Promise<void>;
    /**
     * 停止订单同步服务
     */
    stop(): Promise<void>;
    /**
     * 同步所有未完成的订单
     */
    private syncOpenOrders;
    /**
     * 按交易所分组订单
     */
    private groupOrdersByExchange;
    /**
     * 同步特定交易所的订单
     */
    private syncExchangeOrders;
    /**
     * 同步单个订单状态
     */
    private syncSingleOrder;
    /**
     * 检查订单是否发生了变化
     */
    private hasOrderChanged;
    /**
     * 更新数据库中的订单
     */
    private updateOrderInDatabase;
    /**
     * 触发订单状态变化事件
     */
    private emitOrderEvents;
    /**
     * 添加错误记录
     */
    private addError;
    /**
     * 获取统计信息
     */
    getStats(): OrderSyncStats;
    /**
     * 手动触发一次同步
     */
    syncNow(): Promise<void>;
    /**
     * 清理已知状态缓存
     */
    clearCache(): void;
    /**
     * 更新同步间隔
     */
    updateSyncInterval(intervalMs: number): void;
    /**
     * 获取当前配置
     */
    getConfig(): Required<OrderSyncConfig>;
    /**
     * 检查服务是否正在运行
     */
    get running(): boolean;
}
//# sourceMappingURL=OrderSyncService.d.ts.map