import Decimal from 'decimal.js';
import {
  IStrategyStateManager,
  StrategyState,
  OrderRecoveryInfo,
} from '../models/StrategyStateManager';
import { OrderStatus } from '../types';

/**
 * Minimal interface for data manager to avoid circular dependencies
 */
interface IDataManager {
  getOrders(filter: { strategyId: number }): Promise<
    Array<{
      id: string;
      status: string;
      executedQuantity?: string | Decimal;
      quantity?: string | Decimal;
      averagePrice?: string | Decimal;
      updatedAt?: Date;
    }>
  >;
  getOrder(id: string): Promise<{
    status: string;
    executedQuantity?: string | Decimal;
    quantity?: string | Decimal;
    averagePrice?: string | Decimal;
  } | null>;
}

/**
 * TypeORM Data Manager 适配器
 * 将 TypeOrmDataManager 适配为 IStrategyStateManager 接口
 */
export class TypeOrmStrategyStateAdapter implements IStrategyStateManager {
  constructor(private dataManager: IDataManager) {}

  async saveStrategyState(
    strategyId: number,
    state: Partial<StrategyState>,
  ): Promise<void> {
    // TODO: 实现策略状态保存逻辑
    console.log(`Saving strategy state for ${strategyId}:`, state);
  }

  async getStrategyState(strategyId: number): Promise<StrategyState | null> {
    // TODO: 实现策略状态获取逻辑
    console.log(`Getting strategy state for ${strategyId}`);
    return null;
  }

  async deleteStrategyState(strategyId: number): Promise<void> {
    // TODO: 实现策略状态删除逻辑
    console.log(`Deleting strategy state for ${strategyId}`);
  }

  async getOrdersByStrategy(strategyId: number): Promise<OrderRecoveryInfo[]> {
    try {
      const orders = await this.dataManager.getOrders({ strategyId });

      return orders.map((order) => ({
        orderId: order.id.toString(),
        status: order.status as OrderStatus,
        executedQuantity: order.executedQuantity?.toString() || '0',
        remainingQuantity: (
          parseFloat(order.quantity?.toString() || '0') -
          parseFloat(order.executedQuantity?.toString() || '0')
        ).toString(),
        averagePrice: order.averagePrice?.toString(),
        lastUpdateTime: order.updatedAt || new Date(),
      }));
    } catch (error) {
      console.error(`Failed to get orders for strategy ${strategyId}:`, error);
      return [];
    }
  }

  async syncOrderWithExchange(
    orderId: string,
    exchangeName: string,
  ): Promise<OrderRecoveryInfo> {
    try {
      // TODO: 实现与交易所同步订单状态的逻辑
      // 这里应该调用相应的交易所API来获取最新的订单状态

      const order = await this.dataManager.getOrder(orderId);

      if (!order) {
        throw new Error(`Order ${orderId} not found`);
      }

      return {
        orderId: orderId,
        status: order.status as OrderStatus,
        executedQuantity: order.executedQuantity?.toString() || '0',
        remainingQuantity: (
          parseFloat(order.quantity?.toString() || '0') -
          parseFloat(order.executedQuantity?.toString() || '0')
        ).toString(),
        averagePrice: order.averagePrice?.toString(),
        lastUpdateTime: new Date(),
      };
    } catch (error) {
      console.error(`Failed to sync order ${orderId} with ${exchangeName}:`, error);
      throw error;
    }
  }
}
