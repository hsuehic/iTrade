import { EventEmitter } from 'events';

import axios, { AxiosInstance } from 'axios';
import WebSocket from 'ws';
import { Decimal } from 'decimal.js';
import {
  IExchange,
  Order,
  OrderSide,
  OrderType,
  TimeInForce,
  Ticker,
  OrderBook,
  Trade,
  Kline,
  AccountInfo,
  Balance,
  Position,
  ExchangeCredentials,
  ExchangeInfo,
} from '@itrade/core';

export abstract class BaseExchange extends EventEmitter implements IExchange {
  protected httpClient: AxiosInstance;
  protected wsConnections = new Map<string, WebSocket>();
  protected credentials?: ExchangeCredentials;
  protected _isConnected = false;

  protected subscriptions = new Map<string, Set<string>>();

  constructor(
    public readonly name: string,
    protected readonly baseUrl: string,
    protected readonly wsBaseUrl: string,
  ) {
    super();
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
    });

    this.setupHttpInterceptors();
  }

  public get isConnected(): boolean {
    return this._isConnected;
  }

  public async connect(credentials: ExchangeCredentials): Promise<void> {
    this.credentials = credentials;

    try {
      // Test connection with a simple API call
      await this.testConnection();
      this._isConnected = true;
      this.emit('connected', this.name);
    } catch (error) {
      this._isConnected = false;
      this.emit('error', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    // Close all WebSocket connections
    for (const [_key, ws] of this.wsConnections) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }
    this.wsConnections.clear();
    this.subscriptions.clear();

    this._isConnected = false;
    this.emit('disconnected', this.name);
  }

  // Abstract methods that each exchange must implement
  public abstract getTicker(symbol: string): Promise<Ticker>;
  public abstract getOrderBook(symbol: string, limit?: number): Promise<OrderBook>;
  public abstract getTrades(symbol: string, limit?: number): Promise<Trade[]>;
  public abstract getKlines(
    symbol: string,
    interval: string,
    startTime?: Date,
    endTime?: Date,
    limit?: number,
  ): Promise<Kline[]>;

  public abstract createOrder(
    symbol: string,
    side: OrderSide,
    type: OrderType,
    quantity: Decimal,
    price?: Decimal,
    stopPrice?: Decimal,
    timeInForce?: TimeInForce,
    clientOrderId?: string,
  ): Promise<Order>;

  public abstract cancelOrder(
    symbol: string,
    orderId: string,
    clientOrderId?: string,
  ): Promise<Order>;
  public abstract getOrder(
    symbol: string,
    orderId: string,
    clientOrderId?: string,
  ): Promise<Order>;
  public abstract getOpenOrders(symbol?: string): Promise<Order[]>;
  public abstract getOrderHistory(symbol?: string, limit?: number): Promise<Order[]>;

  public abstract getAccountInfo(): Promise<AccountInfo>;
  public abstract getBalances(): Promise<Balance[]>;
  public abstract getPositions(): Promise<Position[]>;

  public abstract getExchangeInfo(): Promise<ExchangeInfo>;
  public abstract getSymbols(): Promise<string[]>;

  // WebSocket subscription methods
  public async subscribeToTicker(symbol: string): Promise<void> {
    await this.subscribe('ticker', symbol);
  }

  public async subscribeToOrderBook(symbol: string): Promise<void> {
    await this.subscribe('orderbook', symbol);
  }

  public async subscribeToTrades(symbol: string): Promise<void> {
    await this.subscribe('trades', symbol);
  }

  public async subscribeToKlines(symbol: string, interval: string): Promise<void> {
    await this.subscribe('klines', `${symbol}@${interval}`);
  }

  public async unsubscribe(
    symbol: string,
    type: 'ticker' | 'orderbook' | 'trades' | 'klines',
  ): Promise<void> {
    const key = type === 'klines' ? symbol : `${type}:${symbol}`;
    const subscriptions = this.subscriptions.get(type);

    if (subscriptions) {
      subscriptions.delete(key);
      if (subscriptions.size === 0) {
        this.subscriptions.delete(type);
      }
    }

    // Close WebSocket connection if no more subscriptions
    if (this.subscriptions.size === 0) {
      const ws = this.wsConnections.get('market');
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      this.wsConnections.delete('market');
    }
  }

  // Protected helper methods
  protected abstract testConnection(): Promise<void>;
  protected abstract signRequest(params: Record<string, any>): Record<string, any>;

  protected async subscribe(type: string, symbol: string): Promise<void> {
    if (!this.subscriptions.has(type)) {
      this.subscriptions.set(type, new Set());
    }
    this.subscriptions.get(type)!.add(symbol);

    // Create WebSocket connection if it doesn't exist
    if (!this.wsConnections.has('market')) {
      await this.createWebSocketConnection();
    }

    await this.sendWebSocketSubscription(type, symbol);
  }

  protected async createWebSocketConnection(): Promise<void> {
    const promise = new Promise((resolve) => {
      const wsUrl = this.buildWebSocketUrl();
      const ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        this.emit('ws_connected', this.name);
        resolve(void 0);
      });

      ws.on('message', (data: string) => {
        try {
          const message = JSON.parse(data);
          this.handleWebSocketMessage(message);
        } catch (error) {
          this.emit('ws_error', error);
        }
      });

      ws.on('close', (code: number, reason: string) => {
        this.emit('ws_disconnected', this.name, code, reason);
        this.wsConnections.delete('market');

        // Reconnect if connection was not deliberately closed
        if (this._isConnected && code !== 1000) {
          setTimeout(() => {
            this.createWebSocketConnection().catch((error) => {
              this.emit('ws_error', error);
            });
          }, 5000);
        }
      });

      ws.on('error', (error: Error) => {
        this.emit('ws_error', error);
      });

      this.wsConnections.set('market', ws);
    });
    await promise;
  }

  protected abstract buildWebSocketUrl(): string;
  protected abstract sendWebSocketSubscription(
    type: string,
    symbol: string,
  ): Promise<void>;
  protected abstract handleWebSocketMessage(message: any): void;

  protected setupHttpInterceptors(): void {
    // Request interceptor for authentication
    this.httpClient.interceptors.request.use(
      (config) => {
        if (this.credentials) {
          return this.addAuthentication(config);
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      },
    );

    // Response interceptor for error handling
    this.httpClient.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          // HTTP error response
          const { status, data } = error.response;
          this.emit('http_error', {
            status,
            data,
            url: error.config?.url,
            method: error.config?.method,
          });
        } else if (error.request) {
          // Network error
          this.emit('network_error', error.message);
        }
        return Promise.reject(error);
      },
    );
  }

  protected abstract addAuthentication(config: any): any;

  protected formatDecimal(value: unknown): Decimal {
    if (value === undefined || value === null) return new Decimal(0);
    if (typeof value === 'string') {
      const v = value.trim();
      return v ? new Decimal(v) : new Decimal(0);
    }
    return new Decimal((value as any).toString());
  }

  protected formatTimestamp(timestamp: number): Date {
    return new Date(timestamp);
  }

  protected normalizeSymbol(symbol: string): string {
    // Override in derived classes for exchange-specific symbol formatting
    return symbol.toUpperCase();
  }
}
