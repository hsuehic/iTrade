import { EventEmitter } from 'events';

import axios, { AxiosInstance } from 'axios';
import WebSocket from 'ws';
import { Ticker, OrderBook, Trade, Kline } from '@itrade/core';

export abstract class MarketDataExchange extends EventEmitter {
  protected httpClient: AxiosInstance;
  protected wsConnections = new Map<string, WebSocket>();
  protected _isConnected = false;
  protected subscriptions = new Map<string, Set<string>>();

  constructor(
    public readonly name: string,
    protected readonly baseUrl: string,
    protected readonly wsBaseUrl: string
  ) {
    super();
    this.httpClient = axios.create({ baseURL: this.baseUrl, timeout: 30000 });
  }

  public get isConnected(): boolean {
    return this._isConnected;
  }

  public async connect(): Promise<void> {
    // For market data only, mark connected after a simple ping/test
    try {
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
    for (const [_key, ws] of this.wsConnections) {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    }
    this.wsConnections.clear();
    this.subscriptions.clear();
    this._isConnected = false;
    this.emit('disconnected', this.name);
  }

  // Market Data
  public abstract getTicker(symbol: string): Promise<Ticker>;
  public abstract getOrderBook(
    symbol: string,
    limit?: number
  ): Promise<OrderBook>;
  public abstract getTrades(symbol: string, limit?: number): Promise<Trade[]>;
  public abstract getKlines(
    symbol: string,
    interval: string,
    startTime?: Date,
    endTime?: Date,
    limit?: number
  ): Promise<Kline[]>;

  // WebSocket Subscriptions
  public async subscribeToTicker(symbol: string): Promise<void> {
    await this.subscribe('ticker', symbol);
  }

  public async subscribeToOrderBook(symbol: string): Promise<void> {
    await this.subscribe('orderbook', symbol);
  }

  public async subscribeToTrades(symbol: string): Promise<void> {
    await this.subscribe('trades', symbol);
  }

  public async subscribeToKlines(
    symbol: string,
    interval: string
  ): Promise<void> {
    await this.subscribe('klines', `${symbol}@${interval}`);
  }

  public async unsubscribe(
    symbol: string,
    type: 'ticker' | 'orderbook' | 'trades' | 'klines'
  ): Promise<void> {
    const key = type === 'klines' ? symbol : `${type}:${symbol}`;
    const subs = this.subscriptions.get(type);
    if (subs) {
      subs.delete(key);
      if (subs.size === 0) this.subscriptions.delete(type);
    }

    if (this.subscriptions.size === 0) {
      const ws = this.wsConnections.get('market');
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
      this.wsConnections.delete('market');
    }
  }

  // Abstract hooks for impls
  protected abstract testConnection(): Promise<void>;
  protected abstract buildWebSocketUrl(): string;
  protected abstract sendWebSocketSubscription(
    type: string,
    symbol: string
  ): Promise<void>;
  protected abstract handleWebSocketMessage(message: unknown): void;

  protected async subscribe(type: string, symbol: string): Promise<void> {
    if (!this.subscriptions.has(type)) this.subscriptions.set(type, new Set());
    this.subscriptions.get(type)!.add(symbol);

    if (!this.wsConnections.has('market'))
      await this.createWebSocketConnection();
    await this.sendWebSocketSubscription(type, symbol);
  }

  protected async createWebSocketConnection(): Promise<void> {
    const wsUrl = this.buildWebSocketUrl();
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => this.emit('ws_connected', this.name));
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
      if (this._isConnected && code !== 1000) {
        setTimeout(() => {
          this.createWebSocketConnection().catch((error) =>
            this.emit('ws_error', error)
          );
        }, 5000);
      }
    });
    ws.on('error', (error: Error) => this.emit('ws_error', error));

    this.wsConnections.set('market', ws);
  }
}
