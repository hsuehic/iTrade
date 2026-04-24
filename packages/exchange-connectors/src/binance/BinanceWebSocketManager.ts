import WebSocket from 'ws';
import { EventEmitter } from 'events';

/**
 * Binance market type
 * 'futures-public' is used internally for high-frequency public streams (depth, bookTicker)
 * that must route to wss://fstream.binance.com/public/stream (new April 2026 endpoints).
 */
export type BinanceMarketType = 'spot' | 'futures' | 'futures-public';

/**
 * WebSocket connection state
 */
interface WebSocketState {
  ws: WebSocket;
  subscriptions: Map<string, Set<string>>; // type -> symbols
  streamToSymbol: Map<string, string>; // streamName -> symbol (for depth snapshots)
  reconnectAttempts: number;
  heartbeatTimer?: NodeJS.Timeout;
  lastActivityAt?: number;
}

/**
 * Configuration for Binance WebSocket Manager
 * April 2026: futuresUrl should point to /market/stream, futuresPublicUrl to /public/stream.
 */
export interface BinanceWebSocketConfig {
  spotUrl: string;
  futuresUrl: string;
  /** New April 2026: for depth/@bookTicker streams that belong to the /public endpoint */
  futuresPublicUrl?: string;
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
  private config: Required<Omit<BinanceWebSocketConfig, 'futuresPublicUrl'>> &
    Pick<BinanceWebSocketConfig, 'futuresPublicUrl'>;
  private subscriptionIdCounter = 0;
  private symbolToMarketType = new Map<string, BinanceMarketType>();

  constructor(config: BinanceWebSocketConfig) {
    super();
    this.config = {
      ...config,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 0,
      reconnectDelay: config.reconnectDelay ?? 5000,
      heartbeatInterval: config.heartbeatInterval ?? 180000, // 3 minutes
    };
  }

  /**
   * Determine whether a futures stream belongs to the /public endpoint.
   * Depth and bookTicker are high-frequency and must use /public (April 2026 routing).
   */
  private isFuturesPublicStream(streamName: string): boolean {
    // @depth, @depth5, @depth10, @depth20, @depth@100ms, @depth@500ms, @bookTicker, !bookTicker
    return (
      streamName.includes('@depth') ||
      streamName.includes('@bookTicker') ||
      streamName === '!bookTicker'
    );
  }

  /**
   * Get WebSocket URL for market type
   */
  private getUrl(marketType: BinanceMarketType): string {
    if (marketType === 'spot') return this.config.spotUrl;
    if (marketType === 'futures-public')
      return this.config.futuresPublicUrl ?? this.config.futuresUrl;
    return this.config.futuresUrl;
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
    const ws = new WebSocket(url);
    const state: WebSocketState = {
      ws,
      subscriptions: new Map(),
      streamToSymbol: new Map(),
      reconnectAttempts: 0,
      lastActivityAt: Date.now(),
    };

    this.connections.set(marketType, state);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`WebSocket connection timeout for ${marketType}`));
      }, 10000);

      ws.on('open', () => {
        clearTimeout(timeout);
        state.reconnectAttempts = 0;
        state.lastActivityAt = Date.now();
        this.startHeartbeat(marketType);
        this.emit('connected', marketType);
        resolve();
      });

      ws.on('pong', () => {
        state.lastActivityAt = Date.now();
      });

      ws.on('message', (data: string) => {
        try {
          state.lastActivityAt = Date.now();
          const message = JSON.parse(data);
          this.handleMessage(message, marketType);
        } catch (error) {
          this.emit('error', marketType, error);
        }
      });

      ws.on('close', () => {
        this.stopHeartbeat(marketType);
        this.emit('disconnected', marketType);
        this.scheduleReconnect(marketType);
      });

      ws.on('error', (err: Error) => {
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
      return;
    }

    // Handle error
    if (message.error) {
      this.emit('error', marketType, new Error(JSON.stringify(message.error)));
      return;
    }

    // Handle data messages
    if (message.e) {
      // Regular event messages (depthUpdate, trade, kline, etc.)
      this.emit('data', marketType, message);
    } else if (message.lastUpdateId && message.bids && message.asks) {
      // Depth snapshot messages (@depth5/@depth10/@depth20)
      // These don't have an event type or symbol, but have lastUpdateId, bids, asks
      // Find the symbol from active orderbook subscriptions
      const state = this.connections.get(marketType);
      if (state) {
        const orderbookSubs = state.subscriptions.get('orderbook');
        if (orderbookSubs && orderbookSubs.size > 0) {
          // Use the first (or only) orderbook subscription
          const symbol = Array.from(orderbookSubs)[0];
          // Inject event type and symbol for consistent handling
          const enrichedMessage = {
            ...message,
            e: 'depthSnapshot',
            s: this.normalizeSymbol(symbol).toUpperCase(), // Add symbol in Binance format
          };
          this.emit('data', marketType, enrichedMessage);
        }
      }
    }
  }

  /**
   * Normalize symbol to Binance format
   */
  private normalizeSymbol(symbol: string): string {
    return symbol.toUpperCase().replace('/', '').replace('-', '').replace(':', '');
  }

  /**
   * Subscribe to a stream
   * For futures, depth/@bookTicker streams are automatically routed to the
   * 'futures-public' connection (/public/stream) per Binance's April 2026 endpoint split.
   */
  public async subscribe(
    marketType: BinanceMarketType,
    type: string,
    symbol: string,
    streamName: string,
  ): Promise<void> {
    // Route futures depth/bookTicker streams to the dedicated public endpoint
    if (marketType === 'futures' && this.isFuturesPublicStream(streamName)) {
      marketType = 'futures-public';
    }

    // Ensure connection exists
    if (!this.connections.has(marketType)) {
      await this.createConnection(marketType);
    }

    const state = this.connections.get(marketType)!;

    // ✅ Check if already subscribed to avoid duplicate subscriptions
    if (!state.subscriptions.has(type)) {
      state.subscriptions.set(type, new Set());
    }

    const subscriptions = state.subscriptions.get(type)!;
    const alreadySubscribed = subscriptions.has(symbol);

    // Add to subscriptions tracking
    subscriptions.add(symbol);

    // Store stream-to-symbol mapping for depth snapshots
    state.streamToSymbol.set(streamName, symbol);

    // ✅ Only send SUBSCRIBE message if not already subscribed
    if (!alreadySubscribed) {
      if (state.ws.readyState === WebSocket.OPEN) {
        const subscribeMsg = {
          method: 'SUBSCRIBE',
          params: [streamName],
          id: ++this.subscriptionIdCounter,
        };

        state.ws.send(JSON.stringify(subscribeMsg));
      }
    }
  }

  /**
   * Unsubscribe from a stream
   * Mirrors the same routing logic as subscribe().
   */
  public async unsubscribe(
    marketType: BinanceMarketType,
    type: string,
    symbol: string,
    streamName: string,
  ): Promise<void> {
    if (marketType === 'futures' && this.isFuturesPublicStream(streamName)) {
      marketType = 'futures-public';
    }

    const state = this.connections.get(marketType);
    if (!state) {
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

    // Remove stream-to-symbol mapping
    state.streamToSymbol.delete(streamName);

    // Send UNSUBSCRIBE message
    if (state.ws.readyState === WebSocket.OPEN) {
      const unsubscribeMsg = {
        method: 'UNSUBSCRIBE',
        params: [streamName],
        id: ++this.subscriptionIdCounter,
      };

      state.ws.send(JSON.stringify(unsubscribeMsg));
    }

    // Keep connection alive even with no subscriptions
    // This allows for faster re-subscription and maintains the heartbeat
    if (state.subscriptions.size === 0) {
      // Keep connection alive
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

      const lastActivityAt = state.lastActivityAt ?? 0;
      const now = Date.now();
      const staleThreshold = this.config.heartbeatInterval * 2;
      if (lastActivityAt && now - lastActivityAt > staleThreshold) {
        state.ws.terminate();
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

    if (
      this.config.maxReconnectAttempts > 0 &&
      state.reconnectAttempts >= this.config.maxReconnectAttempts
    ) {
      this.emit('max_reconnect_reached', marketType);
      return;
    }

    const delay = this.config.reconnectDelay * Math.pow(2, state.reconnectAttempts);
    state.reconnectAttempts++;

    setTimeout(async () => {
      try {
        await this.reconnect(marketType);
      } catch {
        // noop
      }
    }, delay);
  }

  /**
   * Reconnect and resubscribe
   */
  private async reconnect(marketType: BinanceMarketType): Promise<void> {
    const state = this.connections.get(marketType);
    if (!state) return;

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
