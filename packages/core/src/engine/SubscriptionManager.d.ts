import { ILogger } from '../interfaces';
import { SubscriptionKey, SubscriptionInfo, DataType } from '../types/subscription';
/**
 * Manages subscriptions with reference counting to avoid duplicate subscriptions
 */
export declare class SubscriptionManager {
    private logger;
    private subscriptions;
    constructor(logger: ILogger);
    /**
     * Subscribe to data for a strategy
     */
    subscribe(strategyName: string, key: SubscriptionKey, method: 'websocket' | 'rest', timerId?: NodeJS.Timeout): void;
    /**
     * Unsubscribe from data for a strategy
     * Returns true if the subscription should be cancelled
     */
    unsubscribe(strategyName: string, key: SubscriptionKey): {
        shouldCancel: boolean;
        timerId?: NodeJS.Timeout;
    };
    /**
     * Get all subscriptions for a strategy
     */
    getStrategySubscriptions(strategyName: string): SubscriptionInfo[];
    /**
     * Get all subscriptions
     */
    getAllSubscriptions(): SubscriptionInfo[];
    /**
     * Check if a subscription exists
     */
    hasSubscription(key: SubscriptionKey): boolean;
    /**
     * Get subscription info
     */
    getSubscription(key: SubscriptionKey): SubscriptionInfo | undefined;
    /**
     * Generate unique subscription ID from key
     */
    private getSubscriptionId;
    /**
     * Clear all subscriptions (for cleanup)
     */
    clear(): void;
    /**
     * Get subscription statistics
     */
    getStats(): {
        total: number;
        byType: Record<DataType, number>;
        byMethod: Record<'websocket' | 'rest', number>;
        byExchange: Record<string, number>;
    };
}
//# sourceMappingURL=SubscriptionManager.d.ts.map