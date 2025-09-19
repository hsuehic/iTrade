import { EventEmitter } from 'events';
import { Decimal } from 'decimal.js';
import { Order, OrderStatus, OrderSide } from '../types';
export declare class OrderManager extends EventEmitter {
    private orders;
    private ordersBySymbol;
    private ordersByStatus;
    addOrder(order: Order): void;
    updateOrder(orderId: string, updates: Partial<Order>): Order | null;
    removeOrder(orderId: string): Order | null;
    getOrder(orderId: string): Order | undefined;
    getOrdersBySymbol(symbol: string): Order[];
    getOrdersByStatus(status: OrderStatus): Order[];
    getOpenOrders(symbol?: string): Order[];
    getAllOrders(): Order[];
    getTotalQuantityForSymbol(symbol: string, side: OrderSide): Decimal;
    getAveragePrice(symbol: string, side: OrderSide): Decimal | null;
    cancelAllOrders(symbol?: string): Order[];
    getOrderStats(symbol?: string): {
        total: number;
        open: number;
        filled: number;
        cancelled: number;
        rejected: number;
        totalVolume: Decimal;
        totalValue: Decimal;
    };
}
//# sourceMappingURL=OrderManager.d.ts.map