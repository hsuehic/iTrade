import {
  SubscriptionKey,
  DataType,
  SubscriptionMethod,
  SubscriptionParamValue,
} from '../types/subscription';

import { IExchange } from './index';

/**
 * Observer interface for subscription events
 */
export interface ISubscriptionObserver {
  onSubscriptionCreated(key: SubscriptionKey, method: SubscriptionMethod): void;
  onSubscriptionRemoved(key: SubscriptionKey): void;
  onSubscriptionError(key: SubscriptionKey, error: Error): void;
}

/**
 * Coordinates all subscription lifecycle between strategies and exchanges
 */
export interface ISubscriptionCoordinator {
  /**
   * Subscribe a strategy to market data
   * @param strategyName Name of the strategy subscribing
   * @param exchange Exchange instance to subscribe to
   * @param symbol Symbol to subscribe to
   * @param type Type of data (ticker, orderbook, trades, klines)
   * @param params Additional parameters (e.g., interval for klines)
   * @param methodHint Subscription method preference (websocket, rest, auto)
   * @returns Promise that resolves when subscription is active
   */
  subscribe(
    strategyName: string,
    exchange: IExchange,
    symbol: string,
    type: DataType,
    params: Record<string, SubscriptionParamValue>,
    methodHint?: SubscriptionMethod
  ): Promise<void>;

  /**
   * Unsubscribe a strategy from market data
   * @param strategyName Name of the strategy unsubscribing
   * @param exchange Exchange instance
   * @param symbol Symbol to unsubscribe from
   * @param type Type of data
   * @param params Parameters that match the original subscription
   * @returns Promise that resolves when unsubscription is complete
   */
  unsubscribe(
    strategyName: string,
    exchange: IExchange,
    symbol: string,
    type: DataType,
    params: Record<string, SubscriptionParamValue>
  ): Promise<void>;

  /**
   * Get all subscriptions for a specific strategy
   */
  getStrategySubscriptions(strategyName: string): SubscriptionInfo[];

  /**
   * Get all active subscriptions
   */
  getAllSubscriptions(): SubscriptionInfo[];

  /**
   * Check if a subscription exists
   */
  hasSubscription(key: SubscriptionKey): boolean;

  /**
   * Clear all subscriptions (cleanup)
   */
  clear(): Promise<void>;

  /**
   * Get subscription statistics
   */
  getStats(): {
    total: number;
    byType: Record<DataType, number>;
    byMethod: Record<'websocket' | 'rest', number>;
    byExchange: Record<string, number>;
  };

  /**
   * Register an observer for subscription events
   */
  addObserver(observer: ISubscriptionObserver): void;

  /**
   * Remove an observer
   */
  removeObserver(observer: ISubscriptionObserver): void;
}

/**
 * Subscription information with full details
 */
export interface SubscriptionInfo {
  key: SubscriptionKey;
  refCount: number;
  strategies: Set<string>;
  method: 'websocket' | 'rest';
  timerId?: NodeJS.Timeout;
  createdAt: Date;
  lastUpdated: Date;
}
