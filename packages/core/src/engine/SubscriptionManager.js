/**
 * Manages subscriptions with reference counting to avoid duplicate subscriptions
 */
export class SubscriptionManager {
    logger;
    subscriptions = new Map();
    constructor(logger) {
        this.logger = logger;
    }
    /**
     * Subscribe to data for a strategy
     */
    subscribe(strategyName, key, method, timerId) {
        const subscriptionId = this.getSubscriptionId(key);
        const existing = this.subscriptions.get(subscriptionId);
        if (existing) {
            // Already subscribed, increment reference count
            existing.refCount++;
            existing.strategies.add(strategyName);
            this.logger.debug(`Strategy ${strategyName} reusing subscription: ${subscriptionId} (refCount: ${existing.refCount})`);
        }
        else {
            // New subscription
            this.subscriptions.set(subscriptionId, {
                key,
                refCount: 1,
                strategies: new Set([strategyName]),
                method,
                timerId,
            });
            this.logger.info(`Created new subscription: ${subscriptionId} for strategy ${strategyName}`);
        }
    }
    /**
     * Unsubscribe from data for a strategy
     * Returns true if the subscription should be cancelled
     */
    unsubscribe(strategyName, key) {
        const subscriptionId = this.getSubscriptionId(key);
        const subscription = this.subscriptions.get(subscriptionId);
        if (!subscription) {
            this.logger.warn(`Attempted to unsubscribe from non-existent subscription: ${subscriptionId}`);
            return { shouldCancel: false };
        }
        // Remove strategy from subscription
        subscription.strategies.delete(strategyName);
        subscription.refCount--;
        this.logger.debug(`Strategy ${strategyName} unsubscribed from: ${subscriptionId} (refCount: ${subscription.refCount})`);
        // If no strategies are using this subscription, cancel it
        if (subscription.refCount === 0) {
            this.subscriptions.delete(subscriptionId);
            this.logger.info(`Cancelled subscription: ${subscriptionId} (no more strategies using it)`);
            return { shouldCancel: true, timerId: subscription.timerId };
        }
        return { shouldCancel: false };
    }
    /**
     * Get all subscriptions for a strategy
     */
    getStrategySubscriptions(strategyName) {
        const result = [];
        for (const subscription of this.subscriptions.values()) {
            if (subscription.strategies.has(strategyName)) {
                result.push(subscription);
            }
        }
        return result;
    }
    /**
     * Get all subscriptions
     */
    getAllSubscriptions() {
        return Array.from(this.subscriptions.values());
    }
    /**
     * Check if a subscription exists
     */
    hasSubscription(key) {
        const subscriptionId = this.getSubscriptionId(key);
        return this.subscriptions.has(subscriptionId);
    }
    /**
     * Get subscription info
     */
    getSubscription(key) {
        const subscriptionId = this.getSubscriptionId(key);
        return this.subscriptions.get(subscriptionId);
    }
    /**
     * Generate unique subscription ID from key
     */
    getSubscriptionId(key) {
        const parts = [key.exchange, key.symbol, key.type];
        if (key.params) {
            // Add params to make the ID unique
            const paramsStr = JSON.stringify(key.params);
            parts.push(paramsStr);
        }
        return parts.join(':');
    }
    /**
     * Clear all subscriptions (for cleanup)
     */
    clear() {
        // Clear all timers
        for (const subscription of this.subscriptions.values()) {
            if (subscription.timerId) {
                clearInterval(subscription.timerId);
            }
        }
        this.subscriptions.clear();
        this.logger.info('Cleared all subscriptions');
    }
    /**
     * Get subscription statistics
     */
    getStats() {
        const stats = {
            total: this.subscriptions.size,
            byType: {},
            byMethod: { websocket: 0, rest: 0 },
            byExchange: {},
        };
        for (const subscription of this.subscriptions.values()) {
            // Count by type
            const type = subscription.key.type;
            stats.byType[type] = (stats.byType[type] || 0) + 1;
            // Count by method
            stats.byMethod[subscription.method]++;
            // Count by exchange
            const exchange = subscription.key.exchange;
            stats.byExchange[exchange] = (stats.byExchange[exchange] || 0) + 1;
        }
        return stats;
    }
}
//# sourceMappingURL=SubscriptionManager.js.map