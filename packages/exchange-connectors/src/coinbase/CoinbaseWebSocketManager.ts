import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { ConsoleLogger } from '@itrade/core';

interface WebSocketState {
  ws: WebSocket | null;
  reconnectAttempts: number;
  reconnectTimer: NodeJS.Timeout | null;
  heartbeatInterval: NodeJS.Timeout | null;
  subscriptions: Map<string, Set<string>>; // channel -> Set<product_ids>
  authenticated: boolean;
  jwtToken: string | null;
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
  private readonly maxReconnectAttempts = 10;
  private readonly baseReconnectDelay = 1000;
  private readonly heartbeatInterval = 15000; // 30 seconds
  private isConnecting: boolean = false; // Track if connection is in progress
  private logger: ConsoleLogger;
  // JWT generation callback (provided by CoinbaseExchange)
  private generateJWT: (() => string) | null = null;

  constructor(wsUrl: string) {
    super();
    this.wsUrl = wsUrl;
    this.logger = new ConsoleLogger();
    this.state = {
      ws: null,
      reconnectAttempts: 0,
      reconnectTimer: null,
      heartbeatInterval: null,
      subscriptions: new Map(),
      authenticated: false,
      jwtToken: null,
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
      this.logger.info('[Coinbase] WebSocket already connected');
      return;
    }

    if (this.isConnecting) {
      this.logger.info('[Coinbase] WebSocket connection already in progress');
      return;
    }

    this.logger.info('[Coinbase] Creating WebSocket connection...');
    this.isConnecting = true;

    this.state.ws = new WebSocket(this.wsUrl);

    this.state.ws.on('open', () => {
      this.logger.info('[Coinbase] WebSocket connected');
      this.state.reconnectAttempts = 0;
      this.isConnecting = false;
      this.emit('connected');
      this.startHeartbeat();

      // Resubscribe to all previous subscriptions
      if (this.state.subscriptions.size > 0) {
        this.logger.info(
          `[Coinbase] Resubscribing to ${this.state.subscriptions.size} channels...`,
        );
        this.resubscribeAll();
      }
    });

    this.state.ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      } catch (error) {
        console.error('[Coinbase] Failed to parse message:', error);
      }
    });

    this.state.ws.on('close', (code: number, reason: Buffer) => {
      console.log(`[Coinbase] WebSocket closed: ${code} - ${reason.toString()}`);
      this.isConnecting = false;
      this.stopHeartbeat();
      this.state.authenticated = false;
      this.emit('disconnected', code);
      this.scheduleReconnect();
    });

    this.state.ws.on('error', (error: Error) => {
      console.error('[Coinbase] WebSocket error:', error.message);
      this.emit('error', error);
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(message: any): void {
    // Log all non-heartbeat messages for debugging
    // if (message.type !== 'heartbeat') {
    //   this.logger.info(`[Coinbase] push:\n ${JSON.stringify(message, null, 2)}`);
    // }

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
    // Track subscription first
    if (!this.state.subscriptions.has(channel)) {
      this.state.subscriptions.set(channel, new Set());
    }
    const channelSubs = this.state.subscriptions.get(channel)!;
    productIds.forEach((pid) => channelSubs.add(pid));

    if (!this.state.ws || this.state.ws.readyState !== WebSocket.OPEN) {
      this.logger.info(
        `[Coinbase] WebSocket not connected, subscription to ${channel} will be sent after connection`,
      );
      this.createConnection();
      // Don't retry here - resubscribeAll() will be called when connection opens
      return;
    }

    // Build subscription message
    const subscribeMessage: any = {
      type: 'subscribe',
      product_ids: productIds,
      channel: channel,
      ...additionalParams,
    };

    // Add JWT authentication for user channel
    if (channel === 'user' && this.generateJWT) {
      const jwt = this.generateJWT();
      subscribeMessage.jwt = jwt;
      this.state.jwtToken = jwt;
      this.logger.info(`[Coinbase] Subscribing to ${channel} with JWT authentication...`);
      this.logger.info(
        `[Coinbase] JWT token (first 50 chars): ${jwt.substring(0, 50)}...`,
      );
    }

    this.logger.info(
      `[Coinbase] Sending subscription message:
      ${JSON.stringify(subscribeMessage, null, 2)}`,
    );
    this.state.ws.send(JSON.stringify(subscribeMessage));
  }

  /**
   * Unsubscribe from a channel
   */
  public unsubscribe(channel: string, productIds: string[]): void {
    if (!this.state.ws || this.state.ws.readyState !== WebSocket.OPEN) {
      this.logger.warn('[Coinbase] WebSocket not connected, cannot unsubscribe');
      return;
    }

    // Remove from tracking
    const channelSubs = this.state.subscriptions.get(channel);
    if (channelSubs) {
      productIds.forEach((pid) => channelSubs.delete(pid));
      if (channelSubs.size === 0) {
        this.state.subscriptions.delete(channel);
      }
    }

    // Send unsubscribe message
    const unsubscribeMessage = {
      type: 'unsubscribe',
      product_ids: productIds,
      channel: channel,
    };

    this.logger.info(`[Coinbase] Unsubscribing from ${channel}:${productIds.join(', ')}`);
    this.state.ws.send(JSON.stringify(unsubscribeMessage));

    // Keep connection alive (don't close even if no subscriptions)
    this.logger.info(
      `[Coinbase] Connection kept alive (${this.state.subscriptions.size} channels remaining)`,
    );
  }

  /**
   * Resubscribe to all tracked subscriptions
   */
  private resubscribeAll(): void {
    for (const [channel, productIds] of this.state.subscriptions.entries()) {
      const productIdsArray = Array.from(productIds);
      this.logger.info(
        `[Coinbase] Resubscribing to ${channel}:${productIdsArray.join(', ')}`,
      );

      const subscribeMessage: any = {
        type: 'subscribe',
        product_ids: productIdsArray,
        channel: channel,
      };

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
      if (this.state.ws?.readyState === WebSocket.OPEN) {
        // Coinbase uses heartbeat subscriptions instead of ping/pong
        // The heartbeat channel keeps the connection alive
        // We don't need to send explicit pings
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

    if (this.state.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error('[Coinbase] Max reconnection attempts reached, giving up');
      this.emit('max_reconnect_failed');
      return;
    }

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.state.reconnectAttempts),
      30000, // Max 30 seconds
    );

    this.logger.info(
      `[Coinbase] Scheduling reconnection attempt ${this.state.reconnectAttempts + 1} in ${delay}ms...`,
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
    this.logger.info('[Coinbase] Closing WebSocket connection...');

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
