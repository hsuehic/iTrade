import crypto from 'crypto';

import { Decimal } from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';
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
  ExchangeCredentials,
} from '@itrade/core';

import { BaseExchange } from '../base/BaseExchange';

export interface OKXCredentials extends ExchangeCredentials {
  passphrase?: string;
}

export class OKXExchange extends BaseExchange {
  private static readonly MAINNET_BASE_URL = 'https://www.okx.com';
  private static readonly TESTNET_BASE_URL = 'https://www.okx.com'; // OKX 使用同一个 URL，通过 demo trading 模式区分
  private static readonly MAINNET_WS_URL = 'wss://ws.okx.com:8443/ws/v5/public';
  private static readonly TESTNET_WS_URL =
    'wss://wspap.okx.com:8443/ws/v5/public?brokerId=9999'; // Demo trading

  private passphrase?: string;
  private isDemo: boolean;

  constructor(isDemo = false) {
    const baseUrl = isDemo
      ? OKXExchange.TESTNET_BASE_URL
      : OKXExchange.MAINNET_BASE_URL;
    const wsBaseUrl = isDemo
      ? OKXExchange.TESTNET_WS_URL
      : OKXExchange.MAINNET_WS_URL;

    super('okx', baseUrl, wsBaseUrl);
    this.isDemo = isDemo;
  }

  public async connect(credentials: OKXCredentials): Promise<void> {
    this.passphrase = credentials.passphrase;
    await super.connect(credentials);
  }

  protected async testConnection(): Promise<void> {
    try {
      await this.httpClient.get('/api/v5/public/time');
    } catch (error) {
      throw new Error(`Failed to connect to OKX: ${error}`);
    }
  }

  public async getTicker(symbol: string): Promise<Ticker> {
    const instId = this.normalizeSymbol(symbol);
    const response = await this.httpClient.get('/api/v5/market/ticker', {
      params: { instId },
    });

    if (response.data.code !== '0') {
      throw new Error(`OKX API error: ${response.data.msg}`);
    }

    const data = response.data.data[0];
    return {
      symbol: data.instId,
      price: this.formatDecimal(data.last),
      volume: this.formatDecimal(data.vol24h),
      timestamp: new Date(parseInt(data.ts)),
      bid: this.formatDecimal(data.bidPx),
      ask: this.formatDecimal(data.askPx),
      high24h: this.formatDecimal(data.high24h),
      low24h: this.formatDecimal(data.low24h),
      change24h: this.formatDecimal(data.changeRate || '0'),
    };
  }

  public async getOrderBook(symbol: string, limit = 100): Promise<OrderBook> {
    const instId = this.normalizeSymbol(symbol);
    const response = await this.httpClient.get('/api/v5/market/books', {
      params: { instId, sz: Math.min(limit, 400).toString() },
    });

    if (response.data.code !== '0') {
      throw new Error(`OKX API error: ${response.data.msg}`);
    }

    const data = response.data.data[0];
    return {
      symbol: instId,
      timestamp: new Date(parseInt(data.ts)),
      bids: data.bids.map((bid: string[]) => [
        this.formatDecimal(bid[0]),
        this.formatDecimal(bid[1]),
      ]),
      asks: data.asks.map((ask: string[]) => [
        this.formatDecimal(ask[0]),
        this.formatDecimal(ask[1]),
      ]),
    };
  }

  public async getTrades(symbol: string, limit = 100): Promise<Trade[]> {
    const instId = this.normalizeSymbol(symbol);
    const response = await this.httpClient.get('/api/v5/market/trades', {
      params: { instId, limit: Math.min(limit, 500).toString() },
    });

    if (response.data.code !== '0') {
      throw new Error(`OKX API error: ${response.data.msg}`);
    }

    return response.data.data.map((trade: any) => ({
      id: trade.tradeId,
      symbol: instId,
      price: this.formatDecimal(trade.px),
      quantity: this.formatDecimal(trade.sz),
      side: trade.side === 'buy' ? 'buy' : 'sell',
      timestamp: new Date(parseInt(trade.ts)),
    }));
  }

  public async getKlines(
    symbol: string,
    interval: string,
    startTime?: Date,
    endTime?: Date,
    limit = 100
  ): Promise<Kline[]> {
    const instId = this.normalizeSymbol(symbol);
    const bar = this.normalizeInterval(interval);

    const params: any = {
      instId,
      bar,
      limit: Math.min(limit, 300).toString(),
    };

    if (endTime) {
      params.after = endTime.getTime().toString();
    }
    if (startTime) {
      params.before = startTime.getTime().toString();
    }

    const response = await this.httpClient.get('/api/v5/market/candles', {
      params,
    });

    if (response.data.code !== '0') {
      throw new Error(`OKX API error: ${response.data.msg}`);
    }

    return response.data.data.map((kline: string[]) => ({
      symbol: instId,
      interval: interval,
      openTime: new Date(parseInt(kline[0])),
      closeTime: new Date(parseInt(kline[0]) + this.getIntervalMs(interval)),
      open: this.formatDecimal(kline[1]),
      high: this.formatDecimal(kline[2]),
      low: this.formatDecimal(kline[3]),
      close: this.formatDecimal(kline[4]),
      volume: this.formatDecimal(kline[5]),
      quoteVolume: this.formatDecimal(kline[6]),
      trades: 0, // OKX 不提供这个字段
    }));
  }

  public async createOrder(
    symbol: string,
    side: OrderSide,
    type: OrderType,
    quantity: Decimal,
    price?: Decimal,
    stopPrice?: Decimal,
    _timeInForce: TimeInForce = TimeInForce.GTC,
    clientOrderId?: string
  ): Promise<Order> {
    const instId = this.normalizeSymbol(symbol);

    const orderData: any = {
      instId,
      tdMode: 'cash', // 现货模式
      side: side.toLowerCase(),
      ordType: this.normalizeOrderType(type),
      sz: quantity.toString(),
    };

    if (price) {
      orderData.px = price.toString();
    }

    if (stopPrice) {
      orderData.slTriggerPx = stopPrice.toString();
    }

    if (clientOrderId) {
      orderData.clOrdId = clientOrderId;
    }

    const signedData = this.signOKXRequest(
      'POST',
      '/api/v5/trade/order',
      orderData
    );
    const response = await this.httpClient.post(
      '/api/v5/trade/order',
      orderData,
      {
        headers: signedData.headers,
      }
    );

    if (response.data.code !== '0') {
      throw new Error(`OKX API error: ${response.data.msg}`);
    }

    const data = response.data.data[0];
    return this.transformOKXOrder(data, instId, side, type, quantity, price);
  }

  public async cancelOrder(
    symbol: string,
    orderId: string,
    clientOrderId?: string
  ): Promise<Order> {
    const instId = this.normalizeSymbol(symbol);

    const cancelData: any = { instId };

    if (clientOrderId) {
      cancelData.clOrdId = clientOrderId;
    } else {
      cancelData.ordId = orderId;
    }

    const signedData = this.signOKXRequest(
      'POST',
      '/api/v5/trade/cancel-order',
      cancelData
    );
    const response = await this.httpClient.post(
      '/api/v5/trade/cancel-order',
      cancelData,
      {
        headers: signedData.headers,
      }
    );

    if (response.data.code !== '0') {
      throw new Error(`OKX API error: ${response.data.msg}`);
    }

    // 获取订单详情
    return await this.getOrder(symbol, orderId, clientOrderId);
  }

  public async getOrder(
    symbol: string,
    orderId: string,
    clientOrderId?: string
  ): Promise<Order> {
    const instId = this.normalizeSymbol(symbol);

    const params: any = { instId };
    if (clientOrderId) {
      params.clOrdId = clientOrderId;
    } else {
      params.ordId = orderId;
    }

    const signedData = this.signOKXRequest(
      'GET',
      '/api/v5/trade/order',
      params
    );
    const response = await this.httpClient.get('/api/v5/trade/order', {
      params,
      headers: signedData.headers,
    });

    if (response.data.code !== '0') {
      throw new Error(`OKX API error: ${response.data.msg}`);
    }

    const data = response.data.data[0];
    return this.transformOKXOrder(
      data,
      data.instId,
      data.side === 'buy' ? OrderSide.BUY : OrderSide.SELL,
      this.transformOKXOrderType(data.ordType),
      this.formatDecimal(data.sz),
      data.px ? this.formatDecimal(data.px) : undefined
    );
  }

  public async getOpenOrders(symbol?: string): Promise<Order[]> {
    const params: any = {};
    if (symbol) {
      params.instId = this.normalizeSymbol(symbol);
    }

    const signedData = this.signOKXRequest(
      'GET',
      '/api/v5/trade/orders-pending',
      params
    );
    const response = await this.httpClient.get('/api/v5/trade/orders-pending', {
      params,
      headers: signedData.headers,
    });

    if (response.data.code !== '0') {
      throw new Error(`OKX API error: ${response.data.msg}`);
    }

    return response.data.data.map((order: any) =>
      this.transformOKXOrder(
        order,
        order.instId,
        order.side === 'buy' ? OrderSide.BUY : OrderSide.SELL,
        this.transformOKXOrderType(order.ordType),
        this.formatDecimal(order.sz),
        order.px ? this.formatDecimal(order.px) : undefined
      )
    );
  }

  public async getOrderHistory(symbol?: string, limit = 100): Promise<Order[]> {
    const params: any = {
      limit: Math.min(limit, 100).toString(),
    };
    if (symbol) {
      params.instId = this.normalizeSymbol(symbol);
    }

    const signedData = this.signOKXRequest(
      'GET',
      '/api/v5/trade/orders-history',
      params
    );
    const response = await this.httpClient.get('/api/v5/trade/orders-history', {
      params,
      headers: signedData.headers,
    });

    if (response.data.code !== '0') {
      throw new Error(`OKX API error: ${response.data.msg}`);
    }

    return response.data.data.map((order: any) =>
      this.transformOKXOrder(
        order,
        order.instId,
        order.side === 'buy' ? OrderSide.BUY : OrderSide.SELL,
        this.transformOKXOrderType(order.ordType),
        this.formatDecimal(order.sz),
        order.px ? this.formatDecimal(order.px) : undefined
      )
    );
  }

  public async getAccountInfo(): Promise<AccountInfo> {
    const signedData = this.signOKXRequest(
      'GET',
      '/api/v5/account/balance',
      {}
    );
    const response = await this.httpClient.get('/api/v5/account/balance', {
      headers: signedData.headers,
    });

    if (response.data.code !== '0') {
      throw new Error(`OKX API error: ${response.data.msg}`);
    }

    const data = response.data.data[0];
    const balances: Balance[] = [];

    if (data.details) {
      data.details.forEach((detail: any) => {
        balances.push({
          asset: detail.ccy,
          free: this.formatDecimal(detail.availBal),
          locked: this.formatDecimal(detail.frozenBal),
          total: this.formatDecimal(detail.bal),
        });
      });
    }

    return {
      balances,
      canTrade: true,
      canWithdraw: true,
      canDeposit: true,
      updateTime: new Date(parseInt(data.uTime)),
    };
  }

  public async getBalances(): Promise<Balance[]> {
    const accountInfo = await this.getAccountInfo();
    return accountInfo.balances;
  }

  public async getPositions(): Promise<Position[]> {
    const signedData = this.signOKXRequest(
      'GET',
      '/api/v5/account/positions',
      {}
    );
    const response = await this.httpClient.get('/api/v5/account/positions', {
      headers: signedData.headers,
    });

    if (response.data.code !== '0') {
      throw new Error(`OKX API error: ${response.data.msg}`);
    }

    return response.data.data.map((pos: any) => ({
      symbol: pos.instId,
      side: pos.posSide === 'long' ? 'long' : 'short',
      quantity: this.formatDecimal((pos.pos ?? '0').toString()),
      avgPrice: this.formatDecimal((pos.avgPx ?? '0').toString()),
      markPrice: this.formatDecimal(
        (pos.markPx ?? pos.avgPx ?? '0').toString()
      ),
      unrealizedPnl: this.formatDecimal((pos.upl ?? '0').toString()),
      leverage: this.formatDecimal((pos.lever ?? '0').toString()),
      timestamp: pos.uTime ? new Date(parseInt(pos.uTime)) : new Date(),
    }));
  }

  public async getExchangeInfo(): Promise<ExchangeInfo> {
    const response = await this.httpClient.get('/api/v5/public/instruments', {
      params: { instType: 'SPOT' },
    });

    if (response.data.code !== '0') {
      throw new Error(`OKX API error: ${response.data.msg}`);
    }

    const symbols = response.data.data.map((inst: any) => inst.instId);
    const minTradeSize: { [symbol: string]: Decimal } = {};

    response.data.data.forEach((inst: any) => {
      minTradeSize[inst.instId] = this.formatDecimal(inst.minSz);
    });

    return {
      name: this.name,
      symbols,
      tradingFees: {
        maker: this.formatDecimal('0.0008'), // 0.08%
        taker: this.formatDecimal('0.001'), // 0.1%
      },
      minTradeSize,
    };
  }

  public async getSymbols(): Promise<string[]> {
    const exchangeInfo = await this.getExchangeInfo();
    return exchangeInfo.symbols;
  }

  protected normalizeSymbol(symbol: string): string {
    // Convert common formats to OKX format
    // Spot: BTC/USDT -> BTC-USDT
    // Futures: BTC/USDT:USDT -> BTC-USDT-SWAP (perpetual)
    // Futures: BTC-USD-SWAP -> BTC-USD-SWAP (keep as is)

    const upperSymbol = symbol.toUpperCase();

    // Handle futures format: BTC/USDT:USDT (CCXT format for perpetual)
    if (upperSymbol.includes(':')) {
      const [pair] = upperSymbol.split(':');
      const base = pair.replace('/', '-');
      return `${base}-SWAP`; // OKX perpetual swap format
    }

    // Handle already formatted swap contracts
    if (upperSymbol.includes('-SWAP') || upperSymbol.includes('-FUTURES')) {
      return upperSymbol.replace('/', '-');
    }

    // Handle spot: BTC/USDT -> BTC-USDT
    return upperSymbol.replace('/', '-');
  }

  protected buildWebSocketUrl(): string {
    // OKX WebSocket 不需要在 URL 中指定 streams
    return this.wsBaseUrl;
  }

  protected async sendWebSocketSubscription(
    type: string,
    symbol: string
  ): Promise<void> {
    const ws = this.wsConnections.get('market');
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      await this.createWebSocketConnection();
      // 等待连接建立
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const wsReady = this.wsConnections.get('market');
    if (wsReady && wsReady.readyState === WebSocket.OPEN) {
      const channel = this.getOKXChannel(type, symbol);
      const subscribeMsg = {
        op: 'subscribe',
        args: [channel],
      };

      wsReady.send(JSON.stringify(subscribeMsg));
    }
  }

  protected handleWebSocketMessage(message: any): void {
    // OKX 的消息格式
    if (message.event === 'subscribe') {
      this.emit('ws_subscribed', message.arg);
      return;
    }

    if (message.event === 'error') {
      this.emit('ws_error', new Error(message.msg));
      return;
    }

    if (message.data && message.arg) {
      const { channel, instId } = message.arg;
      const data = message.data[0];

      if (channel === 'tickers') {
        this.emit('ticker', instId, this.transformOKXTicker(data, instId));
      } else if (channel === 'books5' || channel === 'books') {
        this.emit(
          'orderbook',
          instId,
          this.transformOKXOrderBook(data, instId)
        );
      } else if (channel === 'trades') {
        this.emit('trade', instId, this.transformOKXTrade(data, instId));
      } else if (channel.startsWith('candle')) {
        this.emit('kline', instId, this.transformOKXKline(data, instId));
      }
    }
  }

  protected signRequest(params: Record<string, any>): Record<string, any> {
    // BaseExchange 要求的签名方法（OKX 不使用此方法）
    return params;
  }

  private signOKXRequest(
    method: string,
    endpoint: string,
    params: Record<string, any>
  ): { headers: Record<string, string>; body?: string } {
    if (!this.credentials) {
      throw new Error('Exchange credentials not set');
    }

    const timestamp = new Date().toISOString();
    let body = '';

    if (method === 'GET' && Object.keys(params).length > 0) {
      const queryString = new URLSearchParams(params).toString();
      endpoint = `${endpoint}?${queryString}`;
    } else if (method === 'POST') {
      body = JSON.stringify(params);
    }

    const prehashString = timestamp + method + endpoint + body;
    const signature = crypto
      .createHmac('sha256', this.credentials.secretKey)
      .update(prehashString)
      .digest('base64');

    const headers: Record<string, string> = {
      'OK-ACCESS-KEY': this.credentials.apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': this.passphrase || '',
      'Content-Type': 'application/json',
    };

    if (this.isDemo) {
      headers['x-simulated-trading'] = '1';
    }

    return { headers, body };
  }

  protected addAuthentication(config: any): any {
    if (this.credentials) {
      const timestamp = new Date().toISOString();
      const method = config.method?.toUpperCase() || 'GET';
      const endpoint = config.url || '';
      let body = '';

      if (config.data) {
        body = JSON.stringify(config.data);
      }

      const prehashString = timestamp + method + endpoint + body;
      const signature = crypto
        .createHmac('sha256', this.credentials.secretKey)
        .update(prehashString)
        .digest('base64');

      config.headers = {
        ...config.headers,
        'OK-ACCESS-KEY': this.credentials.apiKey,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': this.passphrase || '',
      };

      if (this.isDemo) {
        config.headers['x-simulated-trading'] = '1';
      }
    }
    return config;
  }

  private normalizeInterval(interval: string): string {
    // OKX 使用不同的间隔格式
    const intervalMap: { [key: string]: string } = {
      '1m': '1m',
      '3m': '3m',
      '5m': '5m',
      '15m': '15m',
      '30m': '30m',
      '1h': '1H',
      '2h': '2H',
      '4h': '4H',
      '6h': '6H',
      '12h': '12H',
      '1d': '1D',
      '1w': '1W',
      '1M': '1M',
    };

    return intervalMap[interval] || '1m';
  }

  private getIntervalMs(interval: string): number {
    const map: { [key: string]: number } = {
      '1m': 60000,
      '3m': 180000,
      '5m': 300000,
      '15m': 900000,
      '30m': 1800000,
      '1h': 3600000,
      '2h': 7200000,
      '4h': 14400000,
      '6h': 21600000,
      '12h': 43200000,
      '1d': 86400000,
      '1w': 604800000,
      '1M': 2592000000,
    };
    return map[interval] || 60000;
  }

  private normalizeOrderType(type: OrderType): string {
    const typeMap = {
      [OrderType.MARKET]: 'market',
      [OrderType.LIMIT]: 'limit',
      [OrderType.STOP_LOSS]: 'conditional',
      [OrderType.STOP_LOSS_LIMIT]: 'conditional',
      [OrderType.TAKE_PROFIT]: 'conditional',
      [OrderType.TAKE_PROFIT_LIMIT]: 'conditional',
    };

    return typeMap[type] || 'limit';
  }

  private transformOKXOrderType(type: string): OrderType {
    const typeMap: { [key: string]: OrderType } = {
      market: OrderType.MARKET,
      limit: OrderType.LIMIT,
      conditional: OrderType.STOP_LOSS,
      post_only: OrderType.LIMIT,
      fok: OrderType.LIMIT,
      ioc: OrderType.LIMIT,
    };

    return typeMap[type] || OrderType.LIMIT;
  }

  private transformOKXOrderStatus(state: string): OrderStatus {
    const statusMap: { [key: string]: OrderStatus } = {
      live: OrderStatus.NEW,
      partially_filled: OrderStatus.PARTIALLY_FILLED,
      filled: OrderStatus.FILLED,
      canceled: OrderStatus.CANCELED,
      mmp_canceled: OrderStatus.CANCELED,
      rejected: OrderStatus.REJECTED,
    };

    return statusMap[state] || OrderStatus.NEW;
  }

  private transformOKXOrder(
    order: any,
    symbol: string,
    side: OrderSide,
    type: OrderType,
    quantity: Decimal,
    price?: Decimal
  ): Order {
    return {
      id: order.ordId || uuidv4(),
      clientOrderId: order.clOrdId,
      symbol: symbol,
      side: side,
      type: type,
      quantity: quantity,
      price: price,
      status: this.transformOKXOrderStatus(order.state),
      timeInForce: 'GTC' as TimeInForce,
      timestamp: new Date(parseInt(order.cTime || order.uTime)),
      updateTime: new Date(parseInt(order.uTime)),
      executedQuantity: order.accFillSz
        ? this.formatDecimal(order.accFillSz)
        : undefined,
    };
  }

  private transformOKXTicker(data: any, symbol: string): Ticker {
    return {
      symbol: symbol,
      price: this.formatDecimal(data.last),
      volume: this.formatDecimal(data.vol24h),
      timestamp: new Date(parseInt(data.ts)),
      bid: this.formatDecimal(data.bidPx),
      ask: this.formatDecimal(data.askPx),
      high24h: this.formatDecimal(data.high24h),
      low24h: this.formatDecimal(data.low24h),
      change24h: this.formatDecimal(data.changeRate || '0'),
    };
  }

  private transformOKXOrderBook(data: any, symbol: string): OrderBook {
    return {
      symbol: symbol,
      timestamp: new Date(parseInt(data.ts)),
      bids: data.bids.map((bid: string[]) => [
        this.formatDecimal(bid[0]),
        this.formatDecimal(bid[1]),
      ]),
      asks: data.asks.map((ask: string[]) => [
        this.formatDecimal(ask[0]),
        this.formatDecimal(ask[1]),
      ]),
    };
  }

  private transformOKXTrade(data: any, symbol: string): Trade {
    return {
      id: data.tradeId,
      symbol: symbol,
      price: this.formatDecimal(data.px),
      quantity: this.formatDecimal(data.sz),
      side: data.side === 'buy' ? 'buy' : 'sell',
      timestamp: new Date(parseInt(data.ts)),
    };
  }

  private transformOKXKline(data: any, symbol: string): Kline {
    return {
      symbol: symbol,
      interval: data.bar || '1m',
      openTime: new Date(parseInt(data[0])),
      closeTime: new Date(parseInt(data[0]) + 60000),
      open: this.formatDecimal(data[1]),
      high: this.formatDecimal(data[2]),
      low: this.formatDecimal(data[3]),
      close: this.formatDecimal(data[4]),
      volume: this.formatDecimal(data[5]),
      quoteVolume: this.formatDecimal(data[6]),
      trades: 0,
    };
  }

  private getOKXChannel(type: string, symbol: string): any {
    const instId = this.normalizeSymbol(symbol);

    switch (type) {
      case 'ticker':
        return { channel: 'tickers', instId };
      case 'orderbook':
        return { channel: 'books5', instId };
      case 'trades':
        return { channel: 'trades', instId };
      case 'klines':
        // symbol 格式: BTC-USDT@1m
        const [sym, interval] = symbol.split('@');
        return {
          channel: `candle${this.normalizeInterval(interval || '1m')}`,
          instId: this.normalizeSymbol(sym),
        };
      default:
        return { channel: 'tickers', instId };
    }
  }
}
