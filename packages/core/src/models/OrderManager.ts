import { EventEmitter } from 'events';

import { Decimal } from 'decimal.js';

import { Order, OrderStatus, OrderSide } from '../types';

export class OrderManager extends EventEmitter {
  private orders = new Map<string, Order>();
  private ordersBySymbol = new Map<string, Set<string>>();
  private ordersByStatus = new Map<OrderStatus, Set<string>>();
  private ordersByExchange = new Map<string, Set<string>>();

  public addOrder(order: Order): void {
    const existingOrder = this.orders.get(order.id);

    // If order already exists, clean up old indexes before re-adding
    if (existingOrder) {
      // Remove from old status index if status changed
      if (existingOrder.status !== order.status) {
        this.ordersByStatus.get(existingOrder.status)?.delete(order.id);
      }

      // Remove from old symbol index if symbol changed
      if (existingOrder.symbol !== order.symbol) {
        this.ordersBySymbol.get(existingOrder.symbol)?.delete(order.id);
      }

      // Remove from old exchange index if exchange changed
      if (existingOrder.exchange !== order.exchange) {
        if (existingOrder.exchange) {
          this.ordersByExchange.get(existingOrder.exchange)?.delete(order.id);
        }
      }
    }

    this.orders.set(order.id, order);

    // Index by symbol
    if (!this.ordersBySymbol.has(order.symbol)) {
      this.ordersBySymbol.set(order.symbol, new Set());
    }
    this.ordersBySymbol.get(order.symbol)!.add(order.id);

    // Index by status
    if (!this.ordersByStatus.has(order.status)) {
      this.ordersByStatus.set(order.status, new Set());
    }
    this.ordersByStatus.get(order.status)!.add(order.id);

    // Index by exchange
    if (order.exchange) {
      if (!this.ordersByExchange.has(order.exchange)) {
        this.ordersByExchange.set(order.exchange, new Set());
      }
      this.ordersByExchange.get(order.exchange)!.add(order.id);
    }

    this.emit('orderAdded', order);
  }

  public updateOrder(orderId: string, updates: Partial<Order>): Order | null {
    const order = this.orders.get(orderId);
    if (!order) {
      return null;
    }

    const oldStatus = order.status;
    const oldExchange = order.exchange;
    const updatedOrder = { ...order, ...updates, updateTime: new Date() };

    this.orders.set(orderId, updatedOrder);

    // Update status index if status changed
    if (updates.status && updates.status !== oldStatus) {
      this.ordersByStatus.get(oldStatus)?.delete(orderId);
      if (!this.ordersByStatus.has(updates.status)) {
        this.ordersByStatus.set(updates.status, new Set());
      }
      this.ordersByStatus.get(updates.status)!.add(orderId);
    }

    // Update exchange index if exchange changed
    if (updates.exchange && updates.exchange !== oldExchange) {
      if (oldExchange) {
        this.ordersByExchange.get(oldExchange)?.delete(orderId);
      }
      if (!this.ordersByExchange.has(updates.exchange)) {
        this.ordersByExchange.set(updates.exchange, new Set());
      }
      this.ordersByExchange.get(updates.exchange)!.add(orderId);
    }

    this.emit('orderUpdated', updatedOrder, order);
    return updatedOrder;
  }

  public removeOrder(orderId: string): Order | null {
    const order = this.orders.get(orderId);
    if (!order) {
      return null;
    }

    this.orders.delete(orderId);
    this.ordersBySymbol.get(order.symbol)?.delete(orderId);
    this.ordersByStatus.get(order.status)?.delete(orderId);
    if (order.exchange) {
      this.ordersByExchange.get(order.exchange)?.delete(orderId);
    }

    this.emit('orderRemoved', order);
    return order;
  }

  public getOrder(orderId: string): Order | undefined {
    return this.orders.get(orderId);
  }

  public getOrdersBySymbol(symbol: string): Order[] {
    const orderIds = this.ordersBySymbol.get(symbol);
    if (!orderIds) {
      return [];
    }

    return Array.from(orderIds)
      .map((id) => this.orders.get(id))
      .filter((order) => order !== undefined) as Order[];
  }

  public getOrdersByStatus(status: OrderStatus): Order[] {
    const orderIds = this.ordersByStatus.get(status);
    if (!orderIds) {
      return [];
    }

    return Array.from(orderIds)
      .map((id) => this.orders.get(id))
      .filter((order) => order !== undefined) as Order[];
  }

  public getOrdersByExchange(exchange: string): Order[] {
    const orderIds = this.ordersByExchange.get(exchange);
    if (!orderIds) {
      return [];
    }

    return Array.from(orderIds)
      .map((id) => this.orders.get(id))
      .filter((order) => order !== undefined) as Order[];
  }

  public getOrdersByExchangeAndSymbol(exchange: string, symbol: string): Order[] {
    return this.getOrdersByExchange(exchange).filter((order) => order.symbol === symbol);
  }

  public getAllExchanges(): string[] {
    return Array.from(this.ordersByExchange.keys());
  }

  public getOpenOrders(symbol?: string): Order[] {
    const openStatuses: OrderStatus[] = [OrderStatus.NEW, OrderStatus.PARTIALLY_FILLED];
    let openOrders: Order[] = [];

    for (const status of openStatuses) {
      openOrders.push(...this.getOrdersByStatus(status));
    }

    if (symbol) {
      openOrders = openOrders.filter((order) => order.symbol === symbol);
    }

    return openOrders;
  }

  public getAllOrders(): Order[] {
    return Array.from(this.orders.values());
  }

  public getTotalQuantityForSymbol(symbol: string, side: OrderSide): Decimal {
    const orders = this.getOrdersBySymbol(symbol);
    return orders
      .filter(
        (order) =>
          order.side === side &&
          (order.status === 'NEW' || order.status === 'PARTIALLY_FILLED'),
      )
      .reduce((total, order) => total.add(order.quantity), new Decimal(0));
  }

  public getAveragePrice(symbol: string, side: OrderSide): Decimal | null {
    const orders = this.getOrdersBySymbol(symbol).filter(
      (order) => order.side === side && order.status === 'FILLED' && order.price,
    );

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

  public cancelAllOrders(symbol?: string): Order[] {
    const ordersToCancel = this.getOpenOrders(symbol);
    const cancelledOrders: Order[] = [];

    for (const order of ordersToCancel) {
      const cancelledOrder = this.updateOrder(order.id, {
        status: 'CANCELED' as OrderStatus,
        updateTime: new Date(),
      });
      if (cancelledOrder) {
        cancelledOrders.push(cancelledOrder);
      }
    }

    return cancelledOrders;
  }

  public getOrderStats(filters?: { symbol?: string; exchange?: string }): {
    total: number;
    open: number;
    filled: number;
    cancelled: number;
    rejected: number;
    totalVolume: Decimal;
    totalValue: Decimal;
  } {
    let orders = this.getAllOrders();

    // Apply filters
    if (filters?.exchange) {
      orders = orders.filter((order) => order.exchange === filters.exchange);
    }
    if (filters?.symbol) {
      orders = orders.filter((order) => order.symbol === filters.symbol);
    }

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

  public getOrdersGroupedByExchangeAndSymbol(): Map<string, Map<string, Order[]>> {
    const grouped = new Map<string, Map<string, Order[]>>();

    for (const order of this.orders.values()) {
      const exchange = order.exchange || 'unknown';

      if (!grouped.has(exchange)) {
        grouped.set(exchange, new Map<string, Order[]>());
      }

      const exchangeMap = grouped.get(exchange)!;
      if (!exchangeMap.has(order.symbol)) {
        exchangeMap.set(order.symbol, []);
      }

      exchangeMap.get(order.symbol)!.push(order);
    }

    return grouped;
  }
}
