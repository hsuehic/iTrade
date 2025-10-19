import { EventEmitter } from 'events';
import { Decimal } from 'decimal.js';
import { OrderStatus } from '../types';
import { EventBus } from '../events';
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
export class OrderSyncService extends EventEmitter {
    exchanges;
    dataManager;
    syncInterval = null;
    eventBus;
    isRunning = false;
    lastKnownStatuses = new Map();
    stats = {
        totalSyncs: 0,
        successfulSyncs: 0,
        failedSyncs: 0,
        ordersUpdated: 0,
        lastSyncTime: new Date(),
        errors: [],
    };
    config;
    constructor(exchanges, dataManager, config = {}) {
        super();
        this.exchanges = exchanges;
        this.dataManager = dataManager;
        this.config = {
            syncInterval: config.syncInterval ?? 5000,
            batchSize: config.batchSize ?? 5,
            autoStart: config.autoStart ?? false,
            maxErrorRecords: config.maxErrorRecords ?? 10,
        };
        this.eventBus = EventBus.getInstance();
        if (this.config.autoStart) {
            this.start().catch((error) => {
                this.emit('error', error);
            });
        }
    }
    /**
     * 启动订单同步服务
     */
    async start() {
        if (this.isRunning) {
            this.emit('warn', 'OrderSyncService is already running');
            return;
        }
        this.emit('info', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        this.emit('info', '🔄 Starting Order Sync Service');
        this.emit('info', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        this.emit('info', `   Sync interval: ${this.config.syncInterval / 1000}s`);
        this.emit('info', `   Batch size: ${this.config.batchSize}`);
        this.emit('info', '   Monitoring: NEW and PARTIALLY_FILLED orders');
        this.emit('info', '   Protection: Duplicate event prevention enabled');
        this.emit('info', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        this.isRunning = true;
        // 立即执行一次同步
        this.syncOpenOrders().catch((error) => {
            this.emit('error', error);
        });
        // 启动定时同步
        this.syncInterval = setInterval(() => {
            this.syncOpenOrders().catch((error) => {
                this.emit('error', error);
            });
        }, this.config.syncInterval);
        this.emit('started');
    }
    /**
     * 停止订单同步服务
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        this.isRunning = false;
        // 生成最终报告
        this.emit('info', '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        this.emit('info', '📊 Order Sync Service Final Report');
        this.emit('info', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        this.emit('info', `   Total syncs: ${this.stats.totalSyncs}`);
        this.emit('info', `   Successful: ${this.stats.successfulSyncs}`);
        this.emit('info', `   Failed: ${this.stats.failedSyncs}`);
        this.emit('info', `   Orders updated: ${this.stats.ordersUpdated}`);
        if (this.stats.errors.length > 0) {
            this.emit('info', `   ⚠️  Recent errors: ${this.stats.errors.length}`);
        }
        this.emit('info', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        this.emit('stopped');
    }
    /**
     * 同步所有未完成的订单
     */
    async syncOpenOrders() {
        if (!this.isRunning) {
            return;
        }
        this.stats.totalSyncs++;
        this.stats.lastSyncTime = new Date();
        try {
            // 从数据库获取所有未完成的订单
            const openOrders = await this.dataManager.getOrders({
                status: OrderStatus.NEW,
            });
            const partiallyFilledOrders = await this.dataManager.getOrders({
                status: OrderStatus.PARTIALLY_FILLED,
            });
            const allOpenOrders = [...openOrders, ...partiallyFilledOrders];
            if (allOpenOrders.length === 0) {
                this.stats.successfulSyncs++;
                return;
            }
            this.emit('debug', `🔄 Syncing ${allOpenOrders.length} open orders...`);
            // 按交易所分组订单
            const ordersByExchange = this.groupOrdersByExchange(allOpenOrders);
            // 为每个交易所同步订单
            for (const [exchangeName, orders] of ordersByExchange) {
                await this.syncExchangeOrders(exchangeName, orders);
            }
            this.stats.successfulSyncs++;
        }
        catch (error) {
            this.stats.failedSyncs++;
            this.addError({
                time: new Date(),
                error: error.message,
            });
            this.emit('error', error);
        }
    }
    /**
     * 按交易所分组订单
     */
    groupOrdersByExchange(orders) {
        const grouped = new Map();
        for (const order of orders) {
            const exchangeName = order.exchange || 'binance';
            if (!grouped.has(exchangeName)) {
                grouped.set(exchangeName, []);
            }
            grouped.get(exchangeName).push(order);
        }
        return grouped;
    }
    /**
     * 同步特定交易所的订单
     */
    async syncExchangeOrders(exchangeName, orders) {
        const exchange = this.exchanges.get(exchangeName);
        if (!exchange || !exchange.isConnected) {
            this.emit('warn', `Exchange ${exchangeName} not available for order sync`);
            return;
        }
        // 并发同步所有订单（带限制）
        const { batchSize } = this.config;
        for (let i = 0; i < orders.length; i += batchSize) {
            const batch = orders.slice(i, i + batchSize);
            await Promise.all(batch.map((order) => this.syncSingleOrder(exchange, order)));
        }
    }
    /**
     * 同步单个订单状态
     */
    async syncSingleOrder(exchange, dbOrder) {
        try {
            const exchangeOrder = await exchange.getOrder(dbOrder.symbol, dbOrder.id, dbOrder.clientOrderId);
            const hasChanged = this.hasOrderChanged(dbOrder, exchangeOrder);
            if (!hasChanged) {
                return;
            }
            await this.updateOrderInDatabase(dbOrder, exchangeOrder);
            await this.emitOrderEvents(dbOrder, exchangeOrder);
            this.stats.ordersUpdated++;
            this.emit('info', `✅ Order ${dbOrder.id} synced: ${dbOrder.status} → ${exchangeOrder.status}`);
        }
        catch (error) {
            this.addError({
                time: new Date(),
                error: error.message,
                orderId: dbOrder.id,
            });
            this.emit('debug', `Failed to sync order ${dbOrder.id}: ${error.message}`);
        }
    }
    /**
     * 检查订单是否发生了变化
     */
    hasOrderChanged(dbOrder, exchangeOrder) {
        if (dbOrder.status !== exchangeOrder.status) {
            return true;
        }
        const dbExecutedQty = dbOrder.executedQuantity
            ? new Decimal(dbOrder.executedQuantity)
            : new Decimal(0);
        const exchangeExecutedQty = exchangeOrder.executedQuantity || new Decimal(0);
        if (!dbExecutedQty.equals(exchangeExecutedQty)) {
            return true;
        }
        const dbCumulativeQty = dbOrder.cummulativeQuoteQuantity
            ? new Decimal(dbOrder.cummulativeQuoteQuantity)
            : new Decimal(0);
        const exchangeCumulativeQty = exchangeOrder.cummulativeQuoteQuantity || new Decimal(0);
        if (!dbCumulativeQty.equals(exchangeCumulativeQty)) {
            return true;
        }
        return false;
    }
    /**
     * 更新数据库中的订单
     */
    async updateOrderInDatabase(dbOrder, exchangeOrder) {
        try {
            await this.dataManager.updateOrder(dbOrder.internalId, {
                status: exchangeOrder.status,
                executedQuantity: exchangeOrder.executedQuantity,
                cummulativeQuoteQuantity: exchangeOrder.cummulativeQuoteQuantity,
                updateTime: exchangeOrder.updateTime || new Date(),
            });
            this.emit('debug', `💾 Database updated for order ${dbOrder.id}`);
        }
        catch (error) {
            this.emit('error', error);
            throw error;
        }
    }
    /**
     * 触发订单状态变化事件
     */
    async emitOrderEvents(_oldOrder, newOrder) {
        const lastStatus = this.lastKnownStatuses.get(newOrder.id);
        if (lastStatus === newOrder.status) {
            return;
        }
        this.lastKnownStatuses.set(newOrder.id, newOrder.status);
        const eventData = {
            order: newOrder,
            timestamp: new Date(),
        };
        switch (newOrder.status) {
            case OrderStatus.FILLED:
                this.emit('info', `📨 Emitting orderFilled event for ${newOrder.id}`);
                this.eventBus.emitOrderFilled(eventData);
                break;
            case OrderStatus.PARTIALLY_FILLED:
                this.emit('info', `📨 Emitting orderPartiallyFilled event for ${newOrder.id}`);
                this.eventBus.emitOrderPartiallyFilled(eventData);
                break;
            case OrderStatus.CANCELED:
                this.emit('info', `📨 Emitting orderCancelled event for ${newOrder.id}`);
                this.eventBus.emitOrderCancelled(eventData);
                break;
            case OrderStatus.REJECTED:
                this.emit('info', `📨 Emitting orderRejected event for ${newOrder.id}`);
                this.eventBus.emitOrderRejected(eventData);
                break;
            case OrderStatus.EXPIRED:
                this.emit('info', `📨 Emitting orderExpired event for ${newOrder.id}`);
                break;
        }
    }
    /**
     * 添加错误记录
     */
    addError(error) {
        this.stats.errors.push(error);
        if (this.stats.errors.length > this.config.maxErrorRecords) {
            this.stats.errors.shift();
        }
    }
    /**
     * 获取统计信息
     */
    getStats() {
        return { ...this.stats };
    }
    /**
     * 手动触发一次同步
     */
    async syncNow() {
        this.emit('info', '🔄 Manual sync triggered');
        await this.syncOpenOrders();
    }
    /**
     * 清理已知状态缓存
     */
    clearCache() {
        this.lastKnownStatuses.clear();
        this.emit('info', '🧹 Order status cache cleared');
    }
    /**
     * 更新同步间隔
     */
    updateSyncInterval(intervalMs) {
        if (intervalMs < 1000) {
            this.emit('warn', 'Sync interval too short, minimum is 1000ms');
            return;
        }
        this.config.syncInterval = intervalMs;
        if (this.isRunning && this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = setInterval(() => {
                this.syncOpenOrders().catch((error) => {
                    this.emit('error', error);
                });
            }, this.config.syncInterval);
            this.emit('info', `🔄 Sync interval updated to ${intervalMs / 1000}s`);
        }
    }
    /**
     * 获取当前配置
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * 检查服务是否正在运行
     */
    get running() {
        return this.isRunning;
    }
}
//# sourceMappingURL=OrderSyncService.js.map