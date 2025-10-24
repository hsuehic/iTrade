import WebSocket from 'ws';
import { EventEmitter } from 'events';

/**
 * Binance market type
 */
export type BinanceMarketType = 'spot' | 'futures';

/**
 * WebSocket connection state
 */
interface WebSocketState {
  ws: WebSocket;
  subscriptions: Map<string, Set<string>>; // type -> symbols
  reconnectAttempts: number;
  heartbeatTimer?: NodeJS.Timeout;
}

/**
 * Configuration for Binance WebSocket Manager
 */
export interface BinanceWebSocketConfig {
  spotUrl: string;
  futuresUrl: string;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  heartbeatInterval?: number;
}

/**
 * Manages multiple WebSocket connections for Binance (spot and futures)
 * Each market type (spot/futures) has its own WebSocket connection
 */
export class BinanceWebSocketManager extends EventEmitter {
  private connections = new Map<BinanceMarketType, WebSocketState>();
  private config: Required<BinanceWebSocketConfig>;
  private subscriptionIdCounter = 0;
  private symbolToMarketType = new Map<string, BinanceMarketType>();

  constructor(config: BinanceWebSocketConfig) {
    super();
    this.config = {
      ...config,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
      reconnectDelay: config.reconnectDelay ?? 5000,
      heartbeatInterval: config.heartbeatInterval ?? 180000, // 3 minutes
    };
  }

  /**
   * Get WebSocket URL for market type
   */
  private getUrl(marketType: BinanceMarketType): string {
    return marketType === 'spot' ? this.config.spotUrl : this.config.futuresUrl;
  }

  /**
   * Determine market type from symbol
   * Spot: BTC/USDT, ETH/USDT
   * Futures/Perpetual: BTC/USDT:USDT, ETH/USDT:USDT
   */
  public getMarketType(symbol: string): BinanceMarketType {
    // Check cache first
    if (this.symbolToMarketType.has(symbol)) {
      return this.symbolToMarketType.get(symbol)!;
    }

    // Determine from symbol format
    const marketType = symbol.includes(':') ? 'futures' : 'spot';
    this.symbolToMarketType.set(symbol, marketType);
    return marketType;
  }

  /**
   * Create WebSocket connection for market type
   */
  private async createConnection(marketType: BinanceMarketType): Promise<void> {
    const url = this.getUrl(marketType);
    console.log(`[BinanceWS] Creating ${marketType} connection to ${url}`);

    const ws = new WebSocket(url);
    const state: WebSocketState = {
      ws,
      subscriptions: new Map(),
      reconnectAttempts: 0,
    };

    this.connections.set(marketType, state);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`WebSocket connection timeout for ${marketType}`));
      }, 10000);

      ws.on('open', () => {
        clearTimeout(timeout);
        console.log(`[BinanceWS] ${marketType} connection opened`);
        state.reconnectAttempts = 0;
        this.startHeartbeat(marketType);
        this.emit('connected', marketType);
        resolve();
      });

      ws.on('message', (data: string) => {
        try {
          const message = JSON.parse(data);
          this.handleMessage(message, marketType);
        } catch (error) {
          this.emit('error', marketType, error);
        }
      });

      ws.on('close', () => {
        console.log(`[BinanceWS] ${marketType} connection closed`);
        this.stopHeartbeat(marketType);
        this.emit('disconnected', marketType);
        this.scheduleReconnect(marketType);
      });

      ws.on('error', (err: Error) => {
        console.error(`[BinanceWS] ${marketType} error:`, err.message);
        clearTimeout(timeout);
        this.emit('error', marketType, err);
      });
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(message: any, marketType: BinanceMarketType): void {
    // Emit raw message
    this.emit('message', marketType, message);

    // Handle subscription confirmation
    if (message.result === null && message.id) {
      console.log(`[BinanceWS] ${marketType} subscription confirmed (ID: ${message.id})`);
      return;
    }

    // Handle error
    if (message.error) {
      console.error(`[BinanceWS] ${marketType} error:`, message.error);
      this.emit('error', marketType, new Error(JSON.stringify(message.error)));
      return;
    }

    // Handle data messages
    if (message.e) {
      this.emit('data', marketType, message);
    }
  }

  /**
   * Subscribe to a stream
   */
  public async subscribe(
    marketType: BinanceMarketType,
    type: string,
    symbol: string,
    streamName: string,
  ): Promise<void> {
    // Ensure connection exists
    if (!this.connections.has(marketType)) {
      await this.createConnection(marketType);
    }

    const state = this.connections.get(marketType)!;

    // Add to subscriptions tracking
    if (!state.subscriptions.has(type)) {
      state.subscriptions.set(type, new Set());
    }
    state.subscriptions.get(type)!.add(symbol);

    // Send SUBSCRIBE message
    if (state.ws.readyState === WebSocket.OPEN) {
      const subscribeMsg = {
        method: 'SUBSCRIBE',
        params: [streamName],
        id: ++this.subscriptionIdCounter,
      };

      console.log(
        `[BinanceWS] Subscribing: ${streamName} on ${marketType} (ID: ${subscribeMsg.id})`,
      );
      state.ws.send(JSON.stringify(subscribeMsg));
    } else {
      console.warn(
        `[BinanceWS] Cannot subscribe to ${streamName}, ${marketType} WebSocket not open`,
      );
    }
  }

  /**
   * Unsubscribe from a stream
   */
  public async unsubscribe(
    marketType: BinanceMarketType,
    type: string,
    symbol: string,
    streamName: string,
  ): Promise<void> {
    const state = this.connections.get(marketType);
    if (!state) {
      console.warn(`[BinanceWS] No ${marketType} connection to unsubscribe from`);
      return;
    }

    // Remove from subscriptions tracking
    const typeSubs = state.subscriptions.get(type);
    if (typeSubs) {
      typeSubs.delete(symbol);
      if (typeSubs.size === 0) {
        state.subscriptions.delete(type);
      }
    }

    // Send UNSUBSCRIBE message
    if (state.ws.readyState === WebSocket.OPEN) {
      const unsubscribeMsg = {
        method: 'UNSUBSCRIBE',
        params: [streamName],
        id: ++this.subscriptionIdCounter,
      };

      console.log(`[BinanceWS] Unsubscribing: ${streamName} on ${marketType}`);
      state.ws.send(JSON.stringify(unsubscribeMsg));
    }

    // Keep connection alive even with no subscriptions
    // This allows for faster re-subscription and maintains the heartbeat
    if (state.subscriptions.size === 0) {
      console.log(
        `[BinanceWS] No more subscriptions for ${marketType}, but keeping connection alive`,
      );
    }
  }

  /**
   * Start heartbeat/ping for connection
   */
  private startHeartbeat(marketType: BinanceMarketType): void {
    const state = this.connections.get(marketType);
    if (!state) return;

    this.stopHeartbeat(marketType);

    state.heartbeatTimer = setInterval(() => {
      if (state.ws.readyState === WebSocket.OPEN) {
        state.ws.ping();
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(marketType: BinanceMarketType): void {
    const state = this.connections.get(marketType);
    if (state?.heartbeatTimer) {
      clearInterval(state.heartbeatTimer);
      state.heartbeatTimer = undefined;
    }
  }

  /**
   * Schedule reconnection
   */
  private scheduleReconnect(marketType: BinanceMarketType): void {
    const state = this.connections.get(marketType);
    if (!state) return;

    if (state.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error(`[BinanceWS] Max reconnect attempts reached for ${marketType}`);
      this.emit('max_reconnect_reached', marketType);
      return;
    }

    const delay = this.config.reconnectDelay * Math.pow(2, state.reconnectAttempts);
    state.reconnectAttempts++;

    console.log(
      `[BinanceWS] Scheduling reconnect for ${marketType} in ${delay}ms (attempt ${state.reconnectAttempts})`,
    );

    setTimeout(async () => {
      try {
        await this.reconnect(marketType);
      } catch (error) {
        console.error(`[BinanceWS] Reconnect failed for ${marketType}:`, error);
      }
    }, delay);
  }

  /**
   * Reconnect and resubscribe
   */
  private async reconnect(marketType: BinanceMarketType): Promise<void> {
    const state = this.connections.get(marketType);
    if (!state) return;

    console.log(`[BinanceWS] Reconnecting ${marketType}...`);

    // Store subscriptions before recreating connection
    const savedSubscriptions = new Map(state.subscriptions);

    // Close old connection
    if (state.ws.readyState === WebSocket.OPEN) {
      state.ws.close();
    }

    // Create new connection
    await this.createConnection(marketType);

    // Resubscribe to all streams
    for (const [type, symbols] of savedSubscriptions) {
      for (const symbol of symbols) {
        // Note: The actual streamName needs to be rebuilt by the caller
        // This is just tracking that we need to resubscribe
        this.emit('resubscribe_needed', marketType, type, symbol);
      }
    }
  }

  /**
   * Close connection for market type
   */
  private closeConnection(marketType: BinanceMarketType): void {
    const state = this.connections.get(marketType);
    if (!state) return;

    this.stopHeartbeat(marketType);

    if (
      state.ws.readyState === WebSocket.OPEN ||
      state.ws.readyState === WebSocket.CONNECTING
    ) {
      state.ws.close();
    }

    this.connections.delete(marketType);
  }

  /**
   * Close all connections (called during shutdown)
   */
  public closeAll(): void {
    console.log(`[BinanceWS] Closing all connections for shutdown`);
    for (const marketType of this.connections.keys()) {
      this.closeConnection(marketType);
    }
    this.symbolToMarketType.clear();
  }

  /**
   * Get connection status
   */
  public getConnectionStatus(marketType: BinanceMarketType): {
    connected: boolean;
    subscriptionCount: number;
  } {
    const state = this.connections.get(marketType);
    if (!state) {
      return { connected: false, subscriptionCount: 0 };
    }

    let subscriptionCount = 0;
    for (const symbols of state.subscriptions.values()) {
      subscriptionCount += symbols.size;
    }

    return {
      connected: state.ws.readyState === WebSocket.OPEN,
      subscriptionCount,
    };
  }

  /**
   * Check if connected to market type
   */
  public isConnected(marketType: BinanceMarketType): boolean {
    const state = this.connections.get(marketType);
    return state?.ws.readyState === WebSocket.OPEN;
  }
}
