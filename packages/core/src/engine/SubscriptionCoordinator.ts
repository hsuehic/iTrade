import { ILogger, IExchange } from '../interfaces';
import {
  ISubscriptionCoordinator,
  ISubscriptionObserver,
  SubscriptionInfo as ISubscriptionInfo,
} from '../interfaces/ISubscriptionCoordinator';
import {
  SubscriptionKey,
  DataType,
  SubscriptionMethod,
  SubscriptionParamValue,
} from '../types';

/**
 * Internal subscription information
 */
interface InternalSubscriptionInfo extends ISubscriptionInfo {
  exchange: IExchange;
  onData: (data: unknown) => Promise<void>;
}

/**
 * Coordinates all subscription lifecycle between strategies and exchanges
 *
 * Responsibilities:
 * - Manage subscription reference counting
 * - Choose subscription method (websocket vs REST)
 * - Handle subscription/unsubscription to exchanges
 * - Manage REST polling timers
 * - Notify observers of subscription events
 * - Provide clean separation from trading engine logic
 */
export class SubscriptionCoordinator implements ISubscriptionCoordinator {
  private subscriptions = new Map<string, InternalSubscriptionInfo>();
  private observers: ISubscriptionObserver[] = [];

  constructor(private logger: ILogger) {}

  /**
   * Subscribe a strategy to market data
   */
  public async subscribe(
    strategyName: string,
    exchange: IExchange,
    symbol: string,
    type: DataType,
    params: Record<string, SubscriptionParamValue>,
    methodHint: SubscriptionMethod = 'auto',
  ): Promise<void> {
    const key: SubscriptionKey = {
      exchange: exchange.name,
      symbol,
      type,
      params,
    };

    const subscriptionId = this.getSubscriptionId(key);
    const existing = this.subscriptions.get(subscriptionId);

    if (existing) {
      // Already subscribed, increment reference count
      existing.refCount++;
      existing.strategies.add(strategyName);
      existing.lastUpdated = new Date();

      this.logger.debug(
        `Strategy ${strategyName} reusing subscription: ${subscriptionId} (refCount: ${existing.refCount})`,
      );
      return;
    }

    // Determine subscription method
    const method = this.determineSubscriptionMethod(methodHint, exchange, type, params);

    // Create data handler that will be called by the exchange
    const onData = async (_data: unknown) => {
      // Data will be emitted by exchange, which TradingEngine listens to
      // This handler is for any subscription-specific processing if needed
    };

    try {
      // Subscribe to exchange based on method
      if (method === 'websocket') {
        await this.subscribeViaWebSocket(exchange, symbol, type, params);
      } else {
        // REST polling will be handled by starting a timer
        // Timer needs a callback - we'll pass the data to exchange event emitters
      }

      // Create subscription record
      const now = new Date();
      const subscription: InternalSubscriptionInfo = {
        key,
        refCount: 1,
        strategies: new Set([strategyName]),
        method,
        exchange,
        onData,
        createdAt: now,
        lastUpdated: now,
      };

      // Start REST polling if needed
      if (method === 'rest') {
        const timerId = await this.startRESTPolling(exchange, symbol, type, params);
        subscription.timerId = timerId;
      }

      this.subscriptions.set(subscriptionId, subscription);

      this.logger.info(
        `Created new ${method} subscription: ${subscriptionId} for strategy ${strategyName}`,
      );

      // Notify observers
      this.notifyObservers('created', key, method);
    } catch (error) {
      this.logger.error(
        `Failed to subscribe ${strategyName} to ${subscriptionId}`,
        error as Error,
      );
      this.notifyObservers('error', key, undefined, error as Error);
      throw error;
    }
  }

  /**
   * Unsubscribe a strategy from market data
   */
  public async unsubscribe(
    strategyName: string,
    exchange: IExchange,
    symbol: string,
    type: DataType,
    params: Record<string, SubscriptionParamValue>,
  ): Promise<void> {
    const key: SubscriptionKey = {
      exchange: exchange.name,
      symbol,
      type,
      params,
    };

    const subscriptionId = this.getSubscriptionId(key);
    const subscription = this.subscriptions.get(subscriptionId);

    if (!subscription) {
      this.logger.warn(
        `Attempted to unsubscribe ${strategyName} from non-existent subscription: ${subscriptionId}`,
      );
      return;
    }

    // Remove strategy from subscription
    subscription.strategies.delete(strategyName);
    subscription.refCount--;
    subscription.lastUpdated = new Date();

    this.logger.debug(
      `Strategy ${strategyName} unsubscribed from: ${subscriptionId} (refCount: ${subscription.refCount})`,
    );

    // If no strategies are using this subscription, cancel it
    if (subscription.refCount === 0) {
      await this.cancelSubscription(subscriptionId, subscription);
      this.subscriptions.delete(subscriptionId);

      this.logger.info(
        `Cancelled subscription: ${subscriptionId} (no more strategies using it)`,
      );

      // Notify observers
      this.notifyObservers('removed', key);
    }
  }

  /**
   * Get all subscriptions for a strategy
   */
  public getStrategySubscriptions(strategyName: string): ISubscriptionInfo[] {
    const result: ISubscriptionInfo[] = [];

    for (const subscription of this.subscriptions.values()) {
      if (subscription.strategies.has(strategyName)) {
        result.push(this.toPublicSubscriptionInfo(subscription));
      }
    }

    return result;
  }

  /**
   * Get all subscriptions
   */
  public getAllSubscriptions(): ISubscriptionInfo[] {
    return Array.from(this.subscriptions.values()).map((sub) =>
      this.toPublicSubscriptionInfo(sub),
    );
  }

  /**
   * Check if a subscription exists
   */
  public hasSubscription(key: SubscriptionKey): boolean {
    const subscriptionId = this.getSubscriptionId(key);
    return this.subscriptions.has(subscriptionId);
  }

  /**
   * Clear all subscriptions (cleanup)
   */
  public async clear(): Promise<void> {
    this.logger.info('Clearing all subscriptions...');

    // Cancel all subscriptions
    for (const [id, subscription] of this.subscriptions.entries()) {
      await this.cancelSubscription(id, subscription);
    }

    this.subscriptions.clear();
    this.logger.info('All subscriptions cleared');
  }

  /**
   * Get subscription statistics
   */
  public getStats(): {
    total: number;
    byType: Record<DataType, number>;
    byMethod: Record<'websocket' | 'rest', number>;
    byExchange: Record<string, number>;
  } {
    const stats = {
      total: this.subscriptions.size,
      byType: {} as Record<DataType, number>,
      byMethod: { websocket: 0, rest: 0 },
      byExchange: {} as Record<string, number>,
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

  /**
   * Add observer for subscription events
   */
  public addObserver(observer: ISubscriptionObserver): void {
    this.observers.push(observer);
  }

  /**
   * Remove observer
   */
  public removeObserver(observer: ISubscriptionObserver): void {
    const index = this.observers.indexOf(observer);
    if (index > -1) {
      this.observers.splice(index, 1);
    }
  }

  /**
   * Determine subscription method based on hint and exchange capabilities
   */
  private determineSubscriptionMethod(
    hint: SubscriptionMethod,
    exchange: IExchange,
    type?: DataType,
    params?: Record<string, unknown>,
  ): 'websocket' | 'rest' {
    // Force REST for Coinbase klines with non-5m intervals
    // Coinbase WebSocket candles channel only supports 5-minute intervals
    if (exchange.name === 'coinbase' && type === 'klines') {
      let interval: string | undefined;
      if (params?.intervals && Array.isArray(params.intervals)) {
        interval = params.intervals[0] as string;
      } else if (params?.interval) {
        interval = params.interval as string;
      }

      if (interval && interval !== '5m') {
        this.logger.info(
          `[Coinbase] Forcing REST API for ${interval} klines (WebSocket only supports 5m)`,
        );
        return 'rest';
      }
    }

    if (hint === 'rest') {
      return 'rest';
    }

    if (hint === 'websocket') {
      return 'websocket';
    }

    // Auto: prefer WebSocket if exchange is connected
    if (exchange.isConnected) {
      return 'websocket';
    }

    return 'rest';
  }

  /**
   * Subscribe via WebSocket
   */
  private async subscribeViaWebSocket(
    exchange: IExchange,
    symbol: string,
    type: DataType,
    params: Record<string, unknown>,
  ): Promise<void> {
    try {
      switch (type) {
        case 'ticker':
          await exchange.subscribeToTicker(symbol);
          break;
        case 'orderbook': {
          const depth = params.depth as number | undefined;
          await exchange.subscribeToOrderBook(symbol, depth);
          break;
        }
        case 'trades':
          await exchange.subscribeToTrades(symbol);
          break;
        case 'klines': {
          // Support both intervals array (new) and interval string (legacy)
          let interval: string;
          if (params.intervals && Array.isArray(params.intervals)) {
            // Use first interval from intervals array
            interval = params.intervals[0] as string;
          } else if (params.interval) {
            // Legacy single interval
            interval = params.interval as string;
          } else {
            // Default fallback
            interval = '1m';
          }
          await exchange.subscribeToKlines(symbol, interval);
          break;
        }
      }

      this.logger.info(`Subscribed via WebSocket: ${exchange.name} ${symbol} ${type}`);
    } catch (error) {
      this.logger.error(
        `Failed to subscribe via WebSocket: ${exchange.name} ${symbol} ${type}`,
        error as Error,
      );
      throw error;
    }
  }

  /**
   * Start REST polling for market data
   */
  private async startRESTPolling(
    exchange: IExchange,
    symbol: string,
    type: DataType,
    params: Record<string, unknown>,
  ): Promise<NodeJS.Timeout> {
    const interval = this.getPollingInterval(type, params);

    this.logger.info(
      `Starting REST polling: ${exchange.name} ${symbol} ${type} (interval: ${interval}ms)`,
    );

    const timerId = setInterval(async () => {
      try {
        switch (type) {
          case 'ticker': {
            const ticker = await exchange.getTicker(symbol);
            // Emit via exchange event (TradingEngine listens to this)
            exchange.emit('ticker', symbol, ticker);
            break;
          }
          case 'orderbook': {
            const depth = (params.depth as number | undefined) || 20;
            const orderbook = await exchange.getOrderBook(symbol, depth);
            exchange.emit('orderbook', symbol, orderbook);
            break;
          }
          case 'trades': {
            const limit = (params.limit as number | undefined) || 10;
            const trades = await exchange.getTrades(symbol, limit);
            // Emit each trade individually for consistency with WebSocket
            trades.forEach((trade) => {
              exchange.emit('trade', symbol, trade);
            });
            break;
          }
          case 'klines': {
            // Support both intervals array (new) and interval string (legacy)
            let klineInterval: string;
            if (params.intervals && Array.isArray(params.intervals)) {
              klineInterval = params.intervals[0] as string;
            } else if (params.interval) {
              klineInterval = params.interval as string;
            } else {
              klineInterval = '1m';
            }
            const klineLimit = (params.limit as number | undefined) || 1;
            const klines = await exchange.getKlines(
              symbol,
              klineInterval,
              undefined,
              undefined,
              klineLimit,
            );
            if (klines.length > 0) {
              exchange.emit('kline', symbol, klines[0]);
            }
            break;
          }
        }
      } catch (error) {
        this.logger.error(
          `Failed to poll ${type} for ${symbol} on ${exchange.name}`,
          error as Error,
        );
      }
    }, interval);

    return timerId;
  }

  /**
   * Cancel a subscription
   */
  private async cancelSubscription(
    id: string,
    subscription: InternalSubscriptionInfo,
  ): Promise<void> {
    // Clear REST polling timer if exists
    if (subscription.timerId) {
      clearInterval(subscription.timerId);
    }

    // Call exchange unsubscribe for WebSocket subscriptions
    if (subscription.method === 'websocket') {
      try {
        const { symbol, type, params } = subscription.key;
        await this.unsubscribeViaWebSocket(
          subscription.exchange,
          symbol,
          type,
          params || {},
        );
      } catch (error) {
        this.logger.error(`Failed to unsubscribe from ${id}`, error as Error);
      }
    }

    this.logger.debug(`Cancelled subscription: ${id}`);
  }

  /**
   * Unsubscribe via WebSocket
   */
  private async unsubscribeViaWebSocket(
    exchange: IExchange,
    symbol: string,
    type: DataType,
    params: Record<string, unknown>,
  ): Promise<void> {
    try {
      switch (type) {
        case 'ticker':
          await exchange.unsubscribe(symbol, type);
          break;
        case 'orderbook': {
          // For orderbook, we need to pass depth info for proper unsubscribe
          // Store depth in subscription key, retrieve it here
          const depth = params.depth as number | undefined;
          // Note: Exchange implementations should handle depth internally
          // For now, pass symbol with depth metadata if needed
          await exchange.unsubscribe(symbol, type);
          break;
        }
        case 'trades':
          await exchange.unsubscribe(symbol, type);
          break;
        case 'klines': {
          // Support both intervals array (new) and interval string (legacy)
          let interval: string;
          if (params.intervals && Array.isArray(params.intervals)) {
            interval = params.intervals[0] as string;
          } else if (params.interval) {
            interval = params.interval as string;
          } else {
            interval = '1m';
          }
          const klinesSymbol = `${symbol}@${interval}`;
          await exchange.unsubscribe(klinesSymbol, type);
          break;
        }
      }

      this.logger.info(`Unsubscribed via WebSocket: ${exchange.name} ${symbol} ${type}`);
    } catch (error) {
      this.logger.error(
        `Failed to unsubscribe via WebSocket: ${exchange.name} ${symbol} ${type}`,
        error as Error,
      );
      throw error;
    }
  }

  /**
   * Generate unique subscription ID from key
   */
  private getSubscriptionId(key: SubscriptionKey): string {
    const parts = [key.exchange, key.symbol, key.type];

    if (key.params && Object.keys(key.params).length > 0) {
      const paramsStr = JSON.stringify(key.params);
      parts.push(paramsStr);
    }

    return parts.join(':');
  }

  /**
   * Get polling interval for REST
   */
  private getPollingInterval(type: DataType, params: Record<string, unknown>): number {
    if (params.interval !== undefined && typeof params.interval === 'number') {
      return params.interval;
    }

    if (params.pollInterval !== undefined && typeof params.pollInterval === 'number') {
      return params.pollInterval;
    }

    // Default intervals based on data type
    switch (type) {
      case 'ticker':
        return 5000; // 5 seconds
      case 'orderbook':
        return 500; // 0.5 seconds
      case 'trades':
        return 5000; // 5 seconds
      case 'klines':
        return 60000; // 1 minute
      default:
        return 5000;
    }
  }

  /**
   * Notify observers of subscription events
   */
  private notifyObservers(
    event: 'created' | 'removed' | 'error',
    key: SubscriptionKey,
    method?: SubscriptionMethod,
    error?: Error,
  ): void {
    for (const observer of this.observers) {
      try {
        switch (event) {
          case 'created':
            observer.onSubscriptionCreated(key, method || 'auto');
            break;
          case 'removed':
            observer.onSubscriptionRemoved(key);
            break;
          case 'error':
            if (error) {
              observer.onSubscriptionError(key, error);
            }
            break;
        }
      } catch (err) {
        this.logger.error('Error notifying subscription observer', err as Error);
      }
    }
  }

  /**
   * Convert internal subscription info to public interface
   */
  private toPublicSubscriptionInfo(
    internal: InternalSubscriptionInfo,
  ): ISubscriptionInfo {
    return {
      key: internal.key,
      refCount: internal.refCount,
      strategies: internal.strategies,
      method: internal.method,
      timerId: internal.timerId,
      createdAt: internal.createdAt,
      lastUpdated: internal.lastUpdated,
    };
  }
}
