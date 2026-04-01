import { EventEmitter } from 'events';
import WebSocket from 'ws';

interface SubscriptionInfo {
  productIds: Set<string>;
  params?: Record<string, any>; // Store additional params like granularity
}

interface WebSocketState {
  ws: WebSocket | null;
  reconnectAttempts: number;
  reconnectTimer: NodeJS.Timeout | null;
  heartbeatInterval: NodeJS.Timeout | null;
  subscriptions: Map<string, SubscriptionInfo>; // channel -> SubscriptionInfo
  authenticated: boolean;
  jwtToken: string | null;
  lastActivityAt: number | null;
  connectionTimer: NodeJS.Timeout | null;
}

/**
 * CoinbaseWebSocketManager
 *
 * Manages WebSocket connections for Coinbase Advanced Trade API
 * - Handles both public and private (user) channels
 * - Dynamic subscribe/unsubscribe for market data
 * - JWT authentication for user data streams
 * - Auto-reconnection with exponential backoff
 * - Keep-alive connections with heartbeat
 */
export class CoinbaseWebSocketManager extends EventEmitter {
  private state: WebSocketState;
  private readonly wsUrl: string;
  private readonly maxReconnectAttempts = 0;
  private readonly baseReconnectDelay = 1000;
  private readonly heartbeatInterval = 10000; // 10 seconds checking
  private isConnecting: boolean = false; // Track if connection is in progress
  // JWT generation callback (provided by CoinbaseExchange)
  private generateJWT: (() => string) | null = null;

  constructor(wsUrl: string) {
    super();
    this.wsUrl = wsUrl;
    this.state = {
      ws: null,
      reconnectAttempts: 0,
      reconnectTimer: null,
      heartbeatInterval: null,
      subscriptions: new Map(),
      authenticated: false,
      jwtToken: null,
      lastActivityAt: null,
      connectionTimer: null,
    };
  }

  /**
   * Set JWT generation callback
   */
  public setJWTGenerator(generator: () => string): void {
    this.generateJWT = generator;
  }

  /**
   * Create and establish WebSocket connection
   */
  public createConnection(): void {
    if (this.state.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    if (this.state.ws) {
      this.state.ws.removeAllListeners();
      if (this.state.ws.readyState !== WebSocket.CLOSED) {
        this.state.ws.terminate();
      }
    }

    // Set a connection timeout to prevent hanging in "connecting" state
    this.state.connectionTimer = setTimeout(() => {
      if (this.isConnecting) {
        this.isConnecting = false;
        if (this.state.ws) {
          this.state.ws.terminate(); // This should trigger 'close' event
        } else {
          // If no ws instance, we must manually schedule reconnect
          this.scheduleReconnect();
        }
      }
    }, 15000); // 15 seconds timeout

    try {
      this.state.ws = new WebSocket(this.wsUrl);
    } catch {
      this.isConnecting = false;
      if (this.state.connectionTimer) clearTimeout(this.state.connectionTimer);
      this.scheduleReconnect();
      return;
    }

    this.state.ws.on('open', () => {
      // Clear connection timeout
      if (this.state.connectionTimer) {
        clearTimeout(this.state.connectionTimer);
        this.state.connectionTimer = null;
      }

      // Delay resetting reconnect attempts to prevent flapping
      // Only reset if connection stays stable for 5 seconds
      setTimeout(() => {
        if (this.state.ws?.readyState === WebSocket.OPEN) {
          this.state.reconnectAttempts = 0;
        }
      }, 5000);

      this.state.lastActivityAt = Date.now();
      this.isConnecting = false;
      this.emit('connected');
      this.startHeartbeat();

      // Resubscribe to all previous subscriptions
      if (this.state.subscriptions.size > 0) {
        this.resubscribeAll();
      }
    });

    this.state.ws.on('message', (data: WebSocket.Data) => {
      try {
        this.state.lastActivityAt = Date.now();
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      } catch {
        // ignore
      }
    });

    this.state.ws.on('pong', () => {
      this.state.lastActivityAt = Date.now();
    });

    this.state.ws.on('ping', () => {
      this.state.lastActivityAt = Date.now();
      this.state.ws?.pong();
    });

    this.state.ws.on('close', (code: number) => {
      if (this.state.connectionTimer) {
        clearTimeout(this.state.connectionTimer);
        this.state.connectionTimer = null;
      }
      this.isConnecting = false;
      this.stopHeartbeat();
      this.state.authenticated = false;
      this.state.lastActivityAt = null;
      this.emit('disconnected', code);
      this.scheduleReconnect();
    });

    this.state.ws.on('error', (error: Error) => {
      if (this.state.connectionTimer) {
        clearTimeout(this.state.connectionTimer);
        this.state.connectionTimer = null;
      }
      this.isConnecting = false;
      this.emit('error', error);

      // Ensure we trigger a close event if it hasn't happened yet
      // This is crucial for the reconnection logic to kick in
      if (this.state.ws && this.state.ws.readyState !== WebSocket.CLOSED) {
        try {
          this.state.ws.terminate();
        } catch {
          // If terminate fails, forcefully schedule reconnect as a fallback
          this.scheduleReconnect();
        }
      }
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(message: any): void {
    // Emit raw message for processing in CoinbaseExchange
    this.emit('data', message);
  }

  /**
   * Subscribe to a channel
   */
  public subscribe(
    channel: string,
    productIds: string[],
    additionalParams?: Record<string, any>,
  ): void {
    // Track subscription first with params
    if (!this.state.subscriptions.has(channel)) {
      this.state.subscriptions.set(channel, {
        productIds: new Set(),
        params: additionalParams,
      });
    }
    const channelSub = this.state.subscriptions.get(channel)!;
    productIds.forEach((pid) => channelSub.productIds.add(pid));

    // Update params if provided (in case of re-subscription with different params)
    if (additionalParams) {
      channelSub.params = additionalParams;
    }

    if (!this.state.ws || this.state.ws.readyState !== WebSocket.OPEN) {
      this.createConnection();
      // Don't retry here - resubscribeAll() will be called when connection opens
      return;
    }

    // Build subscription message
    const subscribeMessage: any = {
      type: 'subscribe',
      channel: channel,
      ...additionalParams,
    };

    if (productIds.length > 0) {
      subscribeMessage.product_ids = productIds;
    }

    // Add JWT authentication for user channel
    if (channel === 'user' && this.generateJWT) {
      const jwt = this.generateJWT();
      subscribeMessage.jwt = jwt;
      this.state.jwtToken = jwt;
    }

    this.state.ws.send(JSON.stringify(subscribeMessage));
  }

  /**
   * Unsubscribe from a channel
   */
  public unsubscribe(channel: string, productIds: string[]): void {
    // Remove from tracking first
    const channelSub = this.state.subscriptions.get(channel);
    if (channelSub) {
      productIds.forEach((pid) => channelSub.productIds.delete(pid));
      if (channelSub.productIds.size === 0) {
        this.state.subscriptions.delete(channel);
      }
    }

    if (!this.state.ws || this.state.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // Send unsubscribe message
    const unsubscribeMessage = {
      type: 'unsubscribe',
      product_ids: productIds,
      channel: channel,
    };

    this.state.ws.send(JSON.stringify(unsubscribeMessage));

    // Keep connection alive (don't close even if no subscriptions)
  }

  /**
   * Resubscribe to all tracked subscriptions
   */
  private resubscribeAll(): void {
    for (const [channel, subInfo] of this.state.subscriptions.entries()) {
      const productIdsArray = Array.from(subInfo.productIds);
      const subscribeMessage: any = {
        type: 'subscribe',
        channel: channel,
        ...subInfo.params, // ✅ Include stored params (granularity, etc.)
      };

      if (productIdsArray.length > 0) {
        subscribeMessage.product_ids = productIdsArray;
      }

      // Add JWT for user channel
      if (channel === 'user' && this.generateJWT) {
        const jwt = this.generateJWT();
        subscribeMessage.jwt = jwt;
        this.state.jwtToken = jwt;
      }

      this.state.ws?.send(JSON.stringify(subscribeMessage));
    }
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.state.heartbeatInterval = setInterval(() => {
      if (!this.state.ws || this.state.ws.readyState !== WebSocket.OPEN) {
        return;
      }

      const lastActivityAt = this.state.lastActivityAt ?? 0;
      const now = Date.now();
      const idleTime = now - lastActivityAt;

      // Stale threshold: 30 seconds (3 missed checks)
      const staleThreshold = 30000;

      if (idleTime > staleThreshold) {
        this.state.ws.terminate(); // Trigger 'close' -> reconnect
        return;
      }

      // If idle for more than `heartbeatInterval` (10s), send a ping to check connection
      if (idleTime > this.heartbeatInterval) {
        this.state.ws.ping();
      }
    }, this.heartbeatInterval);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.state.heartbeatInterval) {
      clearInterval(this.state.heartbeatInterval);
      this.state.heartbeatInterval = null;
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.state.reconnectTimer) {
      return; // Already scheduled
    }

    if (
      this.maxReconnectAttempts > 0 &&
      this.state.reconnectAttempts >= this.maxReconnectAttempts
    ) {
      this.emit('max_reconnect_failed');
      return;
    }

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.state.reconnectAttempts),
      30000, // Max 30 seconds
    );

    this.state.reconnectTimer = setTimeout(() => {
      this.state.reconnectTimer = null;
      this.state.reconnectAttempts++;
      this.createConnection();
    }, delay);
  }

  /**
   * Explicitly close the WebSocket connection
   */
  public closeConnection(): void {
    // Clear timers
    if (this.state.reconnectTimer) {
      clearTimeout(this.state.reconnectTimer);
      this.state.reconnectTimer = null;
    }
    this.stopHeartbeat();

    // Close WebSocket
    if (this.state.ws) {
      this.state.ws.removeAllListeners();
      if (this.state.ws.readyState === WebSocket.OPEN) {
        this.state.ws.close();
      }
      this.state.ws = null;
    }

    // Clear subscriptions
    this.state.subscriptions.clear();
    this.state.authenticated = false;
    this.state.jwtToken = null;
  }

  /**
   * Get connection status
   */
  public getConnectionStatus(): {
    connected: boolean;
    authenticated: boolean;
    reconnectAttempts: number;
    subscriptions: number;
  } {
    return {
      connected: this.state.ws?.readyState === WebSocket.OPEN,
      authenticated: this.state.authenticated,
      reconnectAttempts: this.state.reconnectAttempts,
      subscriptions: this.state.subscriptions.size,
    };
  }

  /**
   * Check if connected
   */
  public isConnected(): boolean {
    return this.state.ws?.readyState === WebSocket.OPEN;
  }
}
