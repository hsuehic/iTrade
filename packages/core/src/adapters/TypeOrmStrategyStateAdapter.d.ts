import { IStrategyStateManager, StrategyState, OrderRecoveryInfo } from '../models/StrategyStateManager';
/**
 * TypeORM Data Manager 适配器
 * 将 TypeOrmDataManager 适配为 IStrategyStateManager 接口
 */
export declare class TypeOrmStrategyStateAdapter implements IStrategyStateManager {
    private dataManager;
    constructor(dataManager: any);
    saveStrategyState(strategyId: number, state: Partial<StrategyState>): Promise<void>;
    getStrategyState(strategyId: number): Promise<StrategyState | null>;
    deleteStrategyState(strategyId: number): Promise<void>;
    getOrdersByStrategy(strategyId: number): Promise<OrderRecoveryInfo[]>;
    syncOrderWithExchange(orderId: string, exchangeName: string): Promise<OrderRecoveryInfo>;
}
//# sourceMappingURL=TypeOrmStrategyStateAdapter.d.ts.map