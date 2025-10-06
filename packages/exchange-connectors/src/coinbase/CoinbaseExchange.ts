import crypto from 'crypto';

import { Decimal } from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';
import {
  Order,
  OrderSide,
  OrderType,
  OrderStatus,
  TimeInForce,
  Ticker,
  OrderBook,
  Trade,
  Kline,
  AccountInfo,
  Balance,
  Position,
  ExchangeInfo,
} from '@crypto-trading/core';

import { BaseExchange } from '../base/BaseExchange';

/**
 * Coinbase Advanced Trade API connector (public + private + WS)
 * Docs (subject to change): public REST base https://api.coinbase.com
 * WS base: wss://advanced-trade-ws.coinbase.com
 */
export class CoinbaseExchange extends BaseExchange {
  private static readonly MAINNET_BASE_URL = 'https://api.coinbase.com';
  private static readonly MAINNET_WS_URL =
    'wss://advanced-trade-ws.coinbase.com';

  constructor() {
    super(
      'coinbase',
      CoinbaseExchange.MAINNET_BASE_URL,
      CoinbaseExchange.MAINNET_WS_URL
    );
  }

  protected async testConnection(): Promise<void> {
    try {
      await this.httpClient.get('/api/v3/brokerage/products', {
        params: { limit: 1 },
      });
    } catch (error) {
      throw new Error(`Failed to connect to Coinbase: ${error}`);
    }
  }

  public async getTicker(symbol: string): Promise<Ticker> {
    const productId = this.normalizeSymbol(symbol);
    const resp = await this.httpClient.get(
      `/api/v3/brokerage/products/${productId}/ticker`
    );
    const data = resp.data;
    return {
      symbol: productId,
      price: this.formatDecimal(data.price || data.best_ask || '0'),
      volume: this.formatDecimal(data.volume_24h || '0'),
      timestamp: new Date(),
      bid: data.best_bid ? this.formatDecimal(data.best_bid) : undefined,
      ask: data.best_ask ? this.formatDecimal(data.best_ask) : undefined,
      high24h: data.high_24h ? this.formatDecimal(data.high_24h) : undefined,
      low24h: data.low_24h ? this.formatDecimal(data.low_24h) : undefined,
      change24h: data.price_percentage_change_24h
        ? this.formatDecimal(data.price_percentage_change_24h)
        : undefined,
    };
  }

  public async getOrderBook(symbol: string, limit = 50): Promise<OrderBook> {
    const productId = this.normalizeSymbol(symbol);
    const resp = await this.httpClient.get(
      `/api/v3/brokerage/products/${productId}/book`,
      {
        params: { level: 2, limit },
      }
    );
    const data = resp.data;
    return {
      symbol: productId,
      timestamp: new Date(),
      bids: (data.bids || []).map((b: string[]) => [
        this.formatDecimal(b[0]),
        this.formatDecimal(b[1]),
      ]),
      asks: (data.asks || []).map((a: string[]) => [
        this.formatDecimal(a[0]),
        this.formatDecimal(a[1]),
      ]),
    };
  }

  public async getTrades(symbol: string, limit = 100): Promise<Trade[]> {
    const productId = this.normalizeSymbol(symbol);
    const resp = await this.httpClient.get(
      `/api/v3/brokerage/products/${productId}/trades`,
      {
        params: { limit },
      }
    );
    const data = resp.data?.trades || resp.data || [];
    return data.map((t: any) => ({
      id: t.trade_id?.toString() || uuidv4(),
      symbol: productId,
      price: this.formatDecimal(t.price),
      quantity: this.formatDecimal(t.size || t.quantity || '0'),
      side: t.side?.toLowerCase() === 'buy' ? 'buy' : 'sell',
      timestamp: t.time ? new Date(t.time) : new Date(),
      takerOrderId: t.taker_order_id,
      makerOrderId: t.maker_order_id,
    }));
  }

  public async getKlines(
    symbol: string,
    interval: string,
    startTime?: Date,
    endTime?: Date,
    limit = 300
  ): Promise<Kline[]> {
    const productId = this.normalizeSymbol(symbol);
    const granularity = this.mapIntervalToGranularity(interval);
    const params: any = { granularity, limit }; // start/end iso8601 supported
    if (startTime) params.start = startTime.toISOString();
    if (endTime) params.end = endTime.toISOString();

    const resp = await this.httpClient.get(
      `/api/v3/brokerage/products/${productId}/candles`,
      {
        params,
      }
    );
    const data = resp.data?.candles || resp.data || [];
    return data.map((c: any) => ({
      symbol: productId,
      interval,
      openTime: new Date(c.start || c.start_time || c.t || Date.now()),
      closeTime: new Date(
        (c.start || c.start_time || c.t || Date.now()) + granularity * 1000
      ),
      open: this.formatDecimal(c.open || c.o),
      high: this.formatDecimal(c.high || c.h),
      low: this.formatDecimal(c.low || c.l),
      close: this.formatDecimal(c.close || c.c),
      volume: this.formatDecimal(c.volume || c.v || '0'),
      quoteVolume: this.formatDecimal(c.quote_volume || '0'),
      trades: c.num_trades || 0,
    }));
  }

  public async createOrder(
    symbol: string,
    side: OrderSide,
    type: OrderType,
    quantity: Decimal,
    price?: Decimal,
    _stopPrice?: Decimal,
    timeInForce: TimeInForce = TimeInForce.GTC,
    clientOrderId?: string
  ): Promise<Order> {
    const productId = this.normalizeSymbol(symbol);

    const order_configuration: any = {};
    if (type === OrderType.LIMIT) {
      order_configuration.limit_limit_gtc = {
        base_size: quantity.toString(),
        limit_price: price?.toString() || '0',
        post_only: false,
      };
    } else {
      order_configuration.market_market_ioc = {
        base_size: quantity.toString(),
      };
    }

    if (timeInForce && type === OrderType.LIMIT) {
      // map GTC/IOC/FOK to closest config; Coinbase uses specific keys; we keep limit_gtc for simplicity
    }

    const body: any = {
      client_order_id: clientOrderId || uuidv4(),
      product_id: productId,
      side: side === OrderSide.BUY ? 'BUY' : 'SELL',
      order_configuration,
    };

    const resp = await this.httpClient.post('/api/v3/brokerage/orders', body);
    return this.transformOrder(
      resp.data?.success_response?.order || resp.data?.order || body
    );
  }

  public async cancelOrder(symbol: string, orderId: string): Promise<Order> {
    this.normalizeSymbol(symbol); // ensure formatting, though not used directly
    const body = { order_ids: [orderId] };
    await this.httpClient.post('/api/v3/brokerage/orders/batch_cancel', body);
    // Coinbase cancel API does not return the order; attempt to fetch it
    return this.getOrder(symbol, orderId);
  }

  public async getOrder(symbol: string, orderId: string): Promise<Order> {
    this.normalizeSymbol(symbol);
    const resp = await this.httpClient.get(
      `/api/v3/brokerage/orders/historical/${orderId}`
    );
    const order = resp.data?.orders
      ? resp.data.orders[0]
      : resp.data?.order || resp.data;
    return this.transformOrder(order);
  }

  public async getOpenOrders(_symbol?: string): Promise<Order[]> {
    const params: any = { order_status: 'OPEN' };
    const resp = await this.httpClient.get(
      '/api/v3/brokerage/orders/historical/batch',
      {
        params,
      }
    );
    const orders = resp.data?.orders || [];
    return orders.map((o: any) => this.transformOrder(o));
  }

  public async getOrderHistory(
    _symbol?: string,
    limit = 100
  ): Promise<Order[]> {
    const params: any = { limit, order_status: 'FILLED' };
    const resp = await this.httpClient.get(
      '/api/v3/brokerage/orders/historical/batch',
      {
        params,
      }
    );
    const orders = resp.data?.orders || [];
    return orders.map((o: any) => this.transformOrder(o));
  }

  public async getAccountInfo(): Promise<AccountInfo> {
    const resp = await this.httpClient.get('/api/v3/brokerage/accounts');
    const accounts = resp.data?.accounts || [];
    const balances: Balance[] = accounts.map((a: any) => {
      const asset = a.currency || a.asset || a.uuid || 'USD';
      const available = a.available_balance?.value || '0';
      const hold = a.hold?.value || a.hold || '0';
      const free = this.formatDecimal(available);
      const locked = this.formatDecimal(hold);
      return {
        asset,
        free,
        locked,
        total: free.add(locked),
      };
    });
    return {
      balances,
      canTrade: true,
      canWithdraw: true,
      canDeposit: true,
      updateTime: new Date(),
    };
  }

  public async getBalances(): Promise<Balance[]> {
    const info = await this.getAccountInfo();
    return info.balances;
  }

  public async getPositions(): Promise<Position[]> {
    // Spot only
    return [];
  }

  public async getExchangeInfo(): Promise<ExchangeInfo> {
    const resp = await this.httpClient.get('/api/v3/brokerage/products');
    const products = resp.data?.products || resp.data || [];
    const symbols = products
      .map((p: any) => p.product_id || p.id)
      .filter(Boolean);
    const minTradeSize: { [symbol: string]: Decimal } = {};
    products.forEach((p: any) => {
      const pid = p.product_id || p.id;
      if (!pid) return;
      const min = p.base_increment || p.quote_increment || '0.00000001';
      minTradeSize[pid] = this.formatDecimal(min);
    });
    return {
      name: this.name,
      symbols,
      tradingFees: {
        maker: this.formatDecimal('0'),
        taker: this.formatDecimal('0'),
      },
      minTradeSize,
    };
  }

  public async getSymbols(): Promise<string[]> {
    const info = await this.getExchangeInfo();
    return info.symbols;
  }

  protected buildWebSocketUrl(): string {
    return this.wsBaseUrl;
  }

  protected async sendWebSocketSubscription(
    type: string,
    key: string
  ): Promise<void> {
    const ws = this.wsConnections.get('market');
    if (!ws) return;

    const message: any = {
      type: 'subscribe',
      product_ids: [] as string[],
      channel: '',
    };

    if (type === 'klines') {
      const [productId, interval] = key.split('@');
      message.product_ids = [productId];
      message.channel = 'candles';
      message.granularity = this.mapIntervalToGranularity(interval);
    } else {
      message.product_ids = [key];
      if (type === 'ticker') message.channel = 'ticker';
      if (type === 'orderbook') message.channel = 'level2';
      if (type === 'trades') message.channel = 'market_trades';
    }

    ws.send(JSON.stringify(message));
  }

  protected handleWebSocketMessage(msg: any): void {
    const channel = msg.channel || msg.type;
    if (!channel) return;

    switch (channel) {
      case 'ticker':
        if (msg.events) {
          for (const e of msg.events) {
            for (const t of e.tickers || []) {
              this.emit('ticker', t.product_id, {
                symbol: t.product_id,
                price: this.formatDecimal(t.price || t.best_ask || '0'),
                volume: this.formatDecimal(
                  t.volume_24_h || t.volume_24h || '0'
                ),
                timestamp: new Date(),
                bid: t.best_bid ? this.formatDecimal(t.best_bid) : undefined,
                ask: t.best_ask ? this.formatDecimal(t.best_ask) : undefined,
              } as Ticker);
            }
          }
        }
        break;
      case 'level2':
        if (msg.events) {
          for (const e of msg.events) {
            for (const ob of e.level2 || []) {
              const bids = (ob.bids || []).map((b: any) => [
                this.formatDecimal(b.price_level || b[0] || '0'),
                this.formatDecimal(b.new_quantity || b[1] || '0'),
              ]);
              const asks = (ob.asks || []).map((a: any) => [
                this.formatDecimal(a.price_level || a[0] || '0'),
                this.formatDecimal(a.new_quantity || a[1] || '0'),
              ]);
              this.emit('orderbook', ob.product_id, {
                symbol: ob.product_id,
                timestamp: new Date(),
                bids,
                asks,
              } as OrderBook);
            }
          }
        }
        break;
      case 'market_trades':
        if (msg.events) {
          for (const e of msg.events) {
            for (const tr of e.trades || []) {
              this.emit('trade', tr.product_id, {
                id: tr.trade_id?.toString() || uuidv4(),
                symbol: tr.product_id,
                price: this.formatDecimal(tr.price),
                quantity: this.formatDecimal(tr.size || '0'),
                side: tr.side?.toLowerCase() === 'buy' ? 'buy' : 'sell',
                timestamp: tr.time ? new Date(tr.time) : new Date(),
              } as Trade);
            }
          }
        }
        break;
      case 'candles':
        if (msg.events) {
          for (const e of msg.events) {
            for (const c of e.candles || []) {
              this.emit('kline', c.product_id, {
                symbol: c.product_id,
                interval: c.granularity?.toString() || '',
                openTime: new Date(c.start),
                closeTime: new Date(
                  new Date(c.start).getTime() + (c.granularity || 60) * 1000
                ),
                open: this.formatDecimal(c.open),
                high: this.formatDecimal(c.high),
                low: this.formatDecimal(c.low),
                close: this.formatDecimal(c.close),
                volume: this.formatDecimal(c.volume || '0'),
                quoteVolume: this.formatDecimal('0'),
                trades: 0,
              } as Kline);
            }
          }
        }
        break;
      default:
        break;
    }
  }

  protected signRequest(params: Record<string, any>): Record<string, any> {
    // Coinbase uses signed headers; params are unchanged
    return params;
  }

  protected addAuthentication(config: any): any {
    if (!this.credentials) return config;

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = (config.method || 'GET').toUpperCase();
    const requestPath = config.url?.startsWith('http')
      ? new URL(config.url).pathname +
        (config.params
          ? '?' + new URLSearchParams(config.params as any).toString()
          : '')
      : config.url;
    const body = config.data ? JSON.stringify(config.data) : '';

    const prehash = timestamp + method + requestPath + body;
    const key = this.credentials.secretKey;
    const hmac = crypto.createHmac('sha256', Buffer.from(key, 'base64'));
    const signature = hmac.update(prehash).digest('base64');

    config.headers = {
      ...config.headers,
      'CB-ACCESS-KEY': this.credentials.apiKey,
      'CB-ACCESS-SIGN': signature,
      'CB-ACCESS-TIMESTAMP': timestamp,
      ...(this.credentials.passphrase
        ? { 'CB-ACCESS-PASSPHRASE': this.credentials.passphrase }
        : {}),
      'Content-Type': 'application/json',
    };

    return config;
  }

  protected normalizeSymbol(symbol: string): string {
    // Convert common formats like BTC/USDT or btc-usd to Coinbase product id BTC-USD
    const s = symbol.replace('/', '-').toUpperCase();
    return s;
  }

  private mapIntervalToGranularity(interval: string): number {
    // Coinbase granularity is in seconds
    const map: Record<string, number> = {
      '1m': 60,
      '5m': 300,
      '15m': 900,
      '1h': 3600,
      '6h': 21600,
      '1d': 86400,
    };
    return map[interval] || 60;
  }

  private transformOrder(o: any): Order {
    if (!o) {
      // Fallback minimal shape
      return {
        id: uuidv4(),
        symbol: 'UNKNOWN',
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: this.formatDecimal('0'),
        status: OrderStatus.NEW,
        timeInForce: TimeInForce.GTC,
        timestamp: new Date(),
      };
    }

    const status = this.transformOrderStatus(
      o.status || o.order_status || 'NEW'
    );

    return {
      id: o.order_id || o.id || uuidv4(),
      clientOrderId: o.client_order_id,
      symbol: o.product_id || 'UNKNOWN',
      side:
        (o.side?.toUpperCase() || 'BUY') === 'BUY'
          ? OrderSide.BUY
          : OrderSide.SELL,
      type: this.transformOrderType(o.order_type || o.type || 'LIMIT'),
      quantity: this.formatDecimal(o.quantity || o.base_size || '0'),
      price: o.price ? this.formatDecimal(o.price) : undefined,
      status,
      timeInForce: (o.time_in_force as TimeInForce) || TimeInForce.GTC,
      timestamp: o.submitted_time ? new Date(o.submitted_time) : new Date(),
      updateTime: o.completion_time ? new Date(o.completion_time) : undefined,
      executedQuantity: o.filled_size
        ? this.formatDecimal(o.filled_size)
        : undefined,
      cummulativeQuoteQuantity: undefined,
      fills: undefined,
    };
  }

  private transformOrderStatus(s: string): OrderStatus {
    const map: Record<string, OrderStatus> = {
      NEW: OrderStatus.NEW,
      OPEN: OrderStatus.NEW,
      PENDING: OrderStatus.NEW,
      FILLED: OrderStatus.FILLED,
      CANCELLED: OrderStatus.CANCELED,
      CANCELED: OrderStatus.CANCELED,
      REJECTED: OrderStatus.REJECTED,
      EXPIRED: OrderStatus.EXPIRED,
    };
    return map[(s || 'NEW').toUpperCase()] || OrderStatus.NEW;
  }

  private transformOrderType(s: string): OrderType {
    const map: Record<string, OrderType> = {
      MARKET: OrderType.MARKET,
      LIMIT: OrderType.LIMIT,
      STOP_LOSS: OrderType.STOP_LOSS,
      STOP_LOSS_LIMIT: OrderType.STOP_LOSS_LIMIT,
      TAKE_PROFIT: OrderType.TAKE_PROFIT,
      TAKE_PROFIT_LIMIT: OrderType.TAKE_PROFIT_LIMIT,
    };
    return map[(s || 'LIMIT').toUpperCase()] || OrderType.LIMIT;
  }
}
