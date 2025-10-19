import { EventEmitter } from 'events';
import { Decimal } from 'decimal.js';
import { OrderStatus } from '../types';
export class OrderManager extends EventEmitter {
    orders = new Map();
    ordersBySymbol = new Map();
    ordersByStatus = new Map();
    addOrder(order) {
        this.orders.set(order.id, order);
        // Index by symbol
        if (!this.ordersBySymbol.has(order.symbol)) {
            this.ordersBySymbol.set(order.symbol, new Set());
        }
        this.ordersBySymbol.get(order.symbol).add(order.id);
        // Index by status
        if (!this.ordersByStatus.has(order.status)) {
            this.ordersByStatus.set(order.status, new Set());
        }
        this.ordersByStatus.get(order.status).add(order.id);
        this.emit('orderAdded', order);
    }
    updateOrder(orderId, updates) {
        const order = this.orders.get(orderId);
        if (!order) {
            return null;
        }
        const oldStatus = order.status;
        const updatedOrder = { ...order, ...updates, updateTime: new Date() };
        this.orders.set(orderId, updatedOrder);
        // Update status index if status changed
        if (updates.status && updates.status !== oldStatus) {
            this.ordersByStatus.get(oldStatus)?.delete(orderId);
            if (!this.ordersByStatus.has(updates.status)) {
                this.ordersByStatus.set(updates.status, new Set());
            }
            this.ordersByStatus.get(updates.status).add(orderId);
        }
        this.emit('orderUpdated', updatedOrder, order);
        return updatedOrder;
    }
    removeOrder(orderId) {
        const order = this.orders.get(orderId);
        if (!order) {
            return null;
        }
        this.orders.delete(orderId);
        this.ordersBySymbol.get(order.symbol)?.delete(orderId);
        this.ordersByStatus.get(order.status)?.delete(orderId);
        this.emit('orderRemoved', order);
        return order;
    }
    getOrder(orderId) {
        return this.orders.get(orderId);
    }
    getOrdersBySymbol(symbol) {
        const orderIds = this.ordersBySymbol.get(symbol);
        if (!orderIds) {
            return [];
        }
        return Array.from(orderIds)
            .map((id) => this.orders.get(id))
            .filter((order) => order !== undefined);
    }
    getOrdersByStatus(status) {
        const orderIds = this.ordersByStatus.get(status);
        if (!orderIds) {
            return [];
        }
        return Array.from(orderIds)
            .map((id) => this.orders.get(id))
            .filter((order) => order !== undefined);
    }
    getOpenOrders(symbol) {
        const openStatuses = [
            OrderStatus.NEW,
            OrderStatus.PARTIALLY_FILLED,
        ];
        let openOrders = [];
        for (const status of openStatuses) {
            openOrders.push(...this.getOrdersByStatus(status));
        }
        if (symbol) {
            openOrders = openOrders.filter((order) => order.symbol === symbol);
        }
        return openOrders;
    }
    getAllOrders() {
        return Array.from(this.orders.values());
    }
    getTotalQuantityForSymbol(symbol, side) {
        const orders = this.getOrdersBySymbol(symbol);
        return orders
            .filter((order) => order.side === side &&
            (order.status === 'NEW' || order.status === 'PARTIALLY_FILLED'))
            .reduce((total, order) => total.add(order.quantity), new Decimal(0));
    }
    getAveragePrice(symbol, side) {
        const orders = this.getOrdersBySymbol(symbol).filter((order) => order.side === side && order.status === 'FILLED' && order.price);
        if (orders.length === 0) {
            return null;
        }
        let totalValue = new Decimal(0);
        let totalQuantity = new Decimal(0);
        for (const order of orders) {
            if (order.price) {
                const value = order.price.mul(order.executedQuantity || order.quantity);
                totalValue = totalValue.add(value);
                totalQuantity = totalQuantity.add(order.executedQuantity || order.quantity);
            }
        }
        return totalQuantity.isZero() ? null : totalValue.div(totalQuantity);
    }
    cancelAllOrders(symbol) {
        const ordersToCancel = this.getOpenOrders(symbol);
        const cancelledOrders = [];
        for (const order of ordersToCancel) {
            const cancelledOrder = this.updateOrder(order.id, {
                status: 'CANCELED',
                updateTime: new Date(),
            });
            if (cancelledOrder) {
                cancelledOrders.push(cancelledOrder);
            }
        }
        return cancelledOrders;
    }
    getOrderStats(symbol) {
        const orders = symbol
            ? this.getOrdersBySymbol(symbol)
            : this.getAllOrders();
        let open = 0;
        let filled = 0;
        let cancelled = 0;
        let rejected = 0;
        let totalVolume = new Decimal(0);
        let totalValue = new Decimal(0);
        for (const order of orders) {
            switch (order.status) {
                case 'NEW':
                case 'PARTIALLY_FILLED':
                    open++;
                    break;
                case 'FILLED':
                    filled++;
                    break;
                case 'CANCELED':
                    cancelled++;
                    break;
                case 'REJECTED':
                    rejected++;
                    break;
            }
            const executedQty = order.executedQuantity || new Decimal(0);
            totalVolume = totalVolume.add(executedQty);
            if (order.price) {
                totalValue = totalValue.add(order.price.mul(executedQty));
            }
        }
        return {
            total: orders.length,
            open,
            filled,
            cancelled,
            rejected,
            totalVolume,
            totalValue,
        };
    }
}
//# sourceMappingURL=OrderManager.js.map