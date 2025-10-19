/**
 * 策略状态管理器
 *
 * 负责策略运行状态的持久化和恢复，确保应用重启后策略能完整恢复运行状态
 */
import { EventEmitter } from 'events';
import type { ILogger } from '../interfaces';
import { OrderStatus } from '../types';
export interface StrategyState {
    strategyId: number;
    internalState: Record<string, unknown>;
    indicatorData: Record<string, unknown>;
    lastSignal?: string;
    signalTime?: Date;
    currentPosition: string;
    averagePrice?: string;
    lastUpdateTime: Date;
}
export interface OrderRecoveryInfo {
    orderId: string;
    status: OrderStatus;
    executedQuantity: string;
    remainingQuantity: string;
    averagePrice?: string;
    lastUpdateTime: Date;
}
export interface StrategyRecoveryResult {
    strategyId: number;
    success: boolean;
    recovered: boolean;
    recoveredState?: StrategyState;
    openOrders: OrderRecoveryInfo[];
    partialOrders: OrderRecoveryInfo[];
    totalPosition: string;
    unrealizedPnl?: string;
    warnings?: string[];
    issues: Array<{
        type: 'warning' | 'error' | 'info';
        message: string;
        timestamp: Date;
    }>;
    metrics?: {
        savedStates: number;
        openOrders: number;
        totalPosition: string;
    };
    recoveryTime: number;
}
export interface IStrategyStateManager {
    saveStrategyState(strategyId: number, state: Partial<StrategyState>): Promise<void>;
    getStrategyState(strategyId: number): Promise<StrategyState | null>;
    deleteStrategyState(strategyId: number): Promise<void>;
    getOrdersByStrategy(strategyId: number): Promise<OrderRecoveryInfo[]>;
    syncOrderWithExchange(orderId: string, exchangeName: string): Promise<OrderRecoveryInfo>;
}
export declare class StrategyStateManager extends EventEmitter {
    private dataManager;
    private logger;
    private config;
    private stateCache;
    private recoveryInProgress;
    constructor(dataManager: IStrategyStateManager, logger: ILogger, config?: {
        autosaveInterval?: number;
        cacheTimeout?: number;
        maxRecoveryTime?: number;
    });
    /**
     * 保存策略状态
     */
    saveStrategyState(strategyId: number, partialState: Partial<StrategyState>): Promise<void>;
    /**
     * 获取策略状态
     */
    getStrategyState(strategyId: number): Promise<StrategyState | null>;
    /**
     * 恢复策略完整状态
     */
    recoverStrategyState(strategyId: number, exchangeName?: string): Promise<StrategyRecoveryResult>;
    /**
     * 清理策略状态
     */
    cleanupStrategyState(strategyId: number): Promise<void>;
    /**
     * 获取恢复统计信息
     */
    getRecoveryStats(): {
        inProgress: number;
        cacheSize: number;
        lastAutosave: Date | null;
    };
    /**
     * 启动自动保存
     */
    private startAutosave;
    /**
     * 检查缓存是否有效
     */
    private isCacheValid;
    /**
     * 计算总持仓
     */
    private calculateTotalPosition;
    /**
     * 验证数据一致性
     */
    private validateDataConsistency;
    /**
     * 停止服务
     */
    shutdown(): Promise<void>;
}
//# sourceMappingURL=StrategyStateManager.d.ts.map