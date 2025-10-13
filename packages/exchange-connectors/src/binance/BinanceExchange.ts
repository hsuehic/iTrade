import crypto from 'crypto';

import axios, { AxiosInstance } from 'axios';
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
} from '@itrade/core';

import { BaseExchange } from '../base/BaseExchange';

export type BinanceMarketType = 'spot' | 'futures' | 'perpetual';

export class BinanceExchange extends BaseExchange {
  // Spot API URLs
  private static readonly SPOT_MAINNET_URL = 'https://api.binance.com';
  private static readonly SPOT_TESTNET_URL = 'https://testnet.binance.vision';
  private static readonly SPOT_MAINNET_WS = 'wss://stream.binance.com:9443/ws/';
  private static readonly SPOT_TESTNET_WS = 'wss://testnet.binance.vision/ws/';

  // USDT-M Futures API URLs (Perpetual)
  private static readonly FUTURES_MAINNET_URL = 'https://fapi.binance.com';
  private static readonly FUTURES_TESTNET_URL =
    'https://testnet.binancefuture.com';
  // WebSocket URLs for futures (reserved for future use)
  private static readonly _FUTURES_MAINNET_WS = 'wss://fstream.binance.com/ws/';
  private static readonly _FUTURES_TESTNET_WS =
    'wss://stream.binancefuture.com/ws/';

  private spotClient: AxiosInstance;
  private futuresClient: AxiosInstance;
  private _isTestnet: boolean;

  constructor(isTestnet = false) {
    const baseUrl = isTestnet
      ? BinanceExchange.SPOT_TESTNET_URL
      : BinanceExchange.SPOT_MAINNET_URL;
    const wsBaseUrl = isTestnet
      ? BinanceExchange.SPOT_TESTNET_WS
      : BinanceExchange.SPOT_MAINNET_WS;

    super('binance', baseUrl, wsBaseUrl);

    this._isTestnet = isTestnet;

    // Initialize Spot API client
    this.spotClient = axios.create({
      baseURL: isTestnet
        ? BinanceExchange.SPOT_TESTNET_URL
        : BinanceExchange.SPOT_MAINNET_URL,
      timeout: 30000,
    });

    // Initialize Futures API client
    this.futuresClient = axios.create({
      baseURL: isTestnet
        ? BinanceExchange.FUTURES_TESTNET_URL
        : BinanceExchange.FUTURES_MAINNET_URL,
      timeout: 30000,
    });
  }

  /**
   * Get the appropriate API client based on market type (reserved for future use)
   */
  private _getClient(marketType?: string): AxiosInstance {
    const isFutures = marketType === 'futures' || marketType === 'perpetual';
    return isFutures ? this.futuresClient : this.spotClient;
  }

  /**
   * Check if market type is futures/perpetual (reserved for future use)
   */
  private _isFuturesMarket(marketType?: string): boolean {
    return marketType === 'futures' || marketType === 'perpetual';
  }

  protected async testConnection(): Promise<void> {
    try {
      await this.httpClient.get('/api/v3/ping');
    } catch (error) {
      throw new Error(`Failed to connect to Binance: ${error}`);
    }
  }

  public async getTicker(symbol: string): Promise<Ticker> {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const response = await this.httpClient.get('/api/v3/ticker/24hr', {
      params: { symbol: normalizedSymbol },
    });

    const data = response.data;
    return {
      symbol: data.symbol,
      price: this.formatDecimal(data.lastPrice),
      volume: this.formatDecimal(data.volume),
      timestamp: new Date(),
      bid: this.formatDecimal(data.bidPrice),
      ask: this.formatDecimal(data.askPrice),
      high24h: this.formatDecimal(data.highPrice),
      low24h: this.formatDecimal(data.lowPrice),
      change24h: this.formatDecimal(data.priceChangePercent),
    };
  }

  public async getOrderBook(symbol: string, limit = 100): Promise<OrderBook> {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const response = await this.httpClient.get('/api/v3/depth', {
      params: { symbol: normalizedSymbol, limit },
    });

    const data = response.data;
    return {
      symbol: data.symbol || normalizedSymbol,
      timestamp: new Date(),
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

  public async getTrades(symbol: string, limit = 500): Promise<Trade[]> {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const response = await this.httpClient.get('/api/v3/trades', {
      params: { symbol: normalizedSymbol, limit },
    });

    return response.data.map((trade: any) => ({
      id: trade.id.toString(),
      symbol: normalizedSymbol,
      price: this.formatDecimal(trade.price),
      quantity: this.formatDecimal(trade.qty),
      side: trade.isBuyerMaker ? 'sell' : 'buy',
      timestamp: this.formatTimestamp(trade.time),
    }));
  }

  public async getKlines(
    symbol: string,
    interval: string,
    startTime?: Date,
    endTime?: Date,
    limit = 500
  ): Promise<Kline[]> {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const params: any = {
      symbol: normalizedSymbol,
      interval: this.normalizeInterval(interval),
      limit,
    };

    if (startTime) params.startTime = startTime.getTime();
    if (endTime) params.endTime = endTime.getTime();

    const response = await this.httpClient.get('/api/v3/klines', { params });

    return response.data.map((kline: any[]) => ({
      symbol: normalizedSymbol,
      interval: interval,
      openTime: this.formatTimestamp(kline[0]),
      closeTime: this.formatTimestamp(kline[6]),
      open: this.formatDecimal(kline[1]),
      high: this.formatDecimal(kline[2]),
      low: this.formatDecimal(kline[3]),
      close: this.formatDecimal(kline[4]),
      volume: this.formatDecimal(kline[5]),
      quoteVolume: this.formatDecimal(kline[7]),
      trades: kline[8],
    }));
  }

  public async createOrder(
    symbol: string,
    side: OrderSide,
    type: OrderType,
    quantity: Decimal,
    price?: Decimal,
    stopPrice?: Decimal,
    timeInForce: TimeInForce = TimeInForce.GTC,
    clientOrderId?: string
  ): Promise<Order> {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const params: any = {
      symbol: normalizedSymbol,
      side: side.toUpperCase(),
      type: this.normalizeBinanceOrderType(type),
      quantity: quantity.toString(),
      timestamp: Date.now(),
    };

    if (price) params.price = price.toString();
    if (stopPrice) params.stopPrice = stopPrice.toString();
    if (timeInForce !== 'GTC') params.timeInForce = timeInForce;
    if (clientOrderId) params.newClientOrderId = clientOrderId;

    const signedParams = this.signRequest(params);
    const response = await this.httpClient.post('/api/v3/order', signedParams);

    return this.transformBinanceOrder(response.data);
  }

  public async cancelOrder(
    symbol: string,
    orderId: string,
    clientOrderId?: string
  ): Promise<Order> {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const params: any = {
      symbol: normalizedSymbol,
      timestamp: Date.now(),
    };

    if (clientOrderId) {
      params.origClientOrderId = clientOrderId;
    } else {
      params.orderId = orderId;
    }

    const signedParams = this.signRequest(params);
    const response = await this.httpClient.delete('/api/v3/order', {
      data: signedParams,
    });

    return this.transformBinanceOrder(response.data);
  }

  public async getOrder(
    symbol: string,
    orderId: string,
    clientOrderId?: string
  ): Promise<Order> {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const params: any = {
      symbol: normalizedSymbol,
      timestamp: Date.now(),
    };

    if (clientOrderId) {
      params.origClientOrderId = clientOrderId;
    } else {
      params.orderId = orderId;
    }

    const signedParams = this.signRequest(params);
    const response = await this.httpClient.get('/api/v3/order', {
      params: signedParams,
    });

    return this.transformBinanceOrder(response.data);
  }

  public async getOpenOrders(symbol?: string): Promise<Order[]> {
    const params: any = { timestamp: Date.now() };
    if (symbol) params.symbol = this.normalizeSymbol(symbol);

    const signedParams = this.signRequest(params);
    const response = await this.httpClient.get('/api/v3/openOrders', {
      params: signedParams,
    });

    return response.data.map((order: any) => this.transformBinanceOrder(order));
  }

  public async getOrderHistory(symbol?: string, limit = 500): Promise<Order[]> {
    const params: any = { timestamp: Date.now(), limit };
    if (symbol) params.symbol = this.normalizeSymbol(symbol);

    const signedParams = this.signRequest(params);
    const response = await this.httpClient.get('/api/v3/allOrders', {
      params: signedParams,
    });

    return response.data.map((order: any) => this.transformBinanceOrder(order));
  }

  public async getAccountInfo(): Promise<AccountInfo> {
    const params = this.signRequest({ timestamp: Date.now() });
    const response = await this.httpClient.get('/api/v3/account', { params });

    const data = response.data;
    return {
      balances: data.balances.map((balance: any) => ({
        asset: balance.asset,
        free: this.formatDecimal(balance.free),
        locked: this.formatDecimal(balance.locked),
        total: this.formatDecimal(balance.free).add(
          this.formatDecimal(balance.locked)
        ),
      })),
      canTrade: data.canTrade,
      canWithdraw: data.canWithdraw,
      canDeposit: data.canDeposit,
      updateTime: this.formatTimestamp(data.updateTime),
    };
  }

  public async getBalances(): Promise<Balance[]> {
    const accountInfo = await this.getAccountInfo();
    return accountInfo.balances;
  }

  public async getPositions(): Promise<Position[]> {
    // Binance Spot doesn't have traditional positions, return empty array
    // For futures, this would query the futures API
    return [];
  }

  public async getExchangeInfo(): Promise<ExchangeInfo> {
    const response = await this.httpClient.get('/api/v3/exchangeInfo');
    const data = response.data;

    const symbols = data.symbols.map((symbol: any) => symbol.symbol);
    const minTradeSize: { [symbol: string]: Decimal } = {};

    data.symbols.forEach((symbolInfo: any) => {
      const lotSizeFilter = symbolInfo.filters.find(
        (filter: any) => filter.filterType === 'LOT_SIZE'
      );
      if (lotSizeFilter) {
        minTradeSize[symbolInfo.symbol] = this.formatDecimal(
          lotSizeFilter.minQty
        );
      }
    });

    return {
      name: this.name,
      symbols,
      tradingFees: {
        maker: this.formatDecimal('0.001'), // 0.1%
        taker: this.formatDecimal('0.001'), // 0.1%
      },
      minTradeSize,
    };
  }

  public async getSymbols(): Promise<string[]> {
    const exchangeInfo = await this.getExchangeInfo();
    return exchangeInfo.symbols;
  }

  protected buildWebSocketUrl(): string {
    const streams = [];

    // Build stream names based on subscriptions
    for (const [type, symbols] of this.subscriptions) {
      for (const symbol of symbols) {
        switch (type) {
          case 'ticker':
            streams.push(`${symbol.toLowerCase()}@ticker`);
            break;
          case 'orderbook':
            streams.push(`${symbol.toLowerCase()}@depth`);
            break;
          case 'trades':
            streams.push(`${symbol.toLowerCase()}@trade`);
            break;
          case 'klines':
            streams.push(`${symbol.toLowerCase()}`); // symbol already includes interval
            break;
        }
      }
    }

    return `${this.wsBaseUrl}${streams.join('/')}`;
  }

  protected async sendWebSocketSubscription(
    _type: string,
    _symbol: string
  ): Promise<void> {
    // Binance uses combined streams, so we need to reconnect with new stream list
    const ws = this.wsConnections.get('market');
    if (ws) {
      // 只有在 OPEN 或 CONNECTING 状态时才关闭
      // 避免 "WebSocket was closed before the connection was established" 错误
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
      this.wsConnections.delete('market');
    }

    // 等待一小段时间，确保旧连接完全关闭
    await new Promise((resolve) => setTimeout(resolve, 100));

    await this.createWebSocketConnection();
  }

  protected handleWebSocketMessage(message: any): void {
    if (message.stream) {
      const [symbol, streamType] = message.stream.split('@');
      const data = message.data;

      switch (streamType) {
        case 'ticker':
          this.emit(
            'ticker',
            symbol.toUpperCase(),
            this.transformBinanceTicker(data)
          );
          break;
        case 'depth':
          this.emit(
            'orderbook',
            symbol.toUpperCase(),
            this.transformBinanceOrderBook(data, symbol)
          );
          break;
        case 'trade':
          this.emit(
            'trade',
            symbol.toUpperCase(),
            this.transformBinanceTrade(data, symbol)
          );
          break;
        default:
          if (streamType.startsWith('kline')) {
            this.emit(
              'kline',
              symbol.toUpperCase(),
              this.transformBinanceKline(data.k)
            );
          }
          break;
      }
    }
  }

  protected signRequest(params: Record<string, any>): Record<string, any> {
    if (!this.credentials) {
      throw new Error('Exchange credentials not set');
    }

    const queryString = new URLSearchParams(params).toString();
    const signature = crypto
      .createHmac('sha256', this.credentials.secretKey)
      .update(queryString)
      .digest('hex');

    return { ...params, signature };
  }

  protected addAuthentication(config: any): any {
    if (this.credentials) {
      config.headers = {
        ...config.headers,
        'X-MBX-APIKEY': this.credentials.apiKey,
      };
    }
    return config;
  }

  protected normalizeSymbol(symbol: string): string {
    // Convert common formats to Binance format
    // Spot: BTC/USDT -> BTCUSDT
    // Futures: BTC/USDT:USDT -> BTCUSDT (perpetual futures)
    // Futures: BTCUSD_PERP -> BTCUSD_PERP (keep as is)

    const upperSymbol = symbol.toUpperCase();

    // Handle futures format: BTC/USDT:USDT (CCXT format for perpetual)
    if (upperSymbol.includes(':')) {
      const [pair] = upperSymbol.split(':');
      return pair.replace('/', '').replace('-', '');
    }

    // Handle already formatted perpetual futures (BTCUSD_PERP, BTCUSDT_PERP)
    if (upperSymbol.includes('_PERP') || upperSymbol.includes('_SWAP')) {
      return upperSymbol.replace('/', '').replace('-', '');
    }

    // Handle spot: BTC/USDT -> BTCUSDT
    return upperSymbol.replace('/', '').replace('-', '');
  }

  private normalizeInterval(interval: string): string {
    // Convert standard intervals to Binance format
    const intervalMap: { [key: string]: string } = {
      '1m': '1m',
      '3m': '3m',
      '5m': '5m',
      '15m': '15m',
      '30m': '30m',
      '1h': '1h',
      '2h': '2h',
      '4h': '4h',
      '6h': '6h',
      '8h': '8h',
      '12h': '12h',
      '1d': '1d',
      '3d': '3d',
      '1w': '1w',
      '1M': '1M',
    };

    return intervalMap[interval] || interval;
  }

  private normalizeBinanceOrderType(type: OrderType): string {
    const typeMap = {
      [OrderType.MARKET]: 'MARKET',
      [OrderType.LIMIT]: 'LIMIT',
      [OrderType.STOP_LOSS]: 'STOP_LOSS',
      [OrderType.STOP_LOSS_LIMIT]: 'STOP_LOSS_LIMIT',
      [OrderType.TAKE_PROFIT]: 'TAKE_PROFIT',
      [OrderType.TAKE_PROFIT_LIMIT]: 'TAKE_PROFIT_LIMIT',
    };

    return typeMap[type] || 'LIMIT';
  }

  private transformBinanceOrder(order: any): Order {
    const status = this.transformBinanceOrderStatus(order.status);

    return {
      id: order.orderId?.toString() || uuidv4(),
      clientOrderId: order.clientOrderId,
      symbol: order.symbol,
      side:
        order.side?.toLowerCase() === 'buy' ? OrderSide.BUY : OrderSide.SELL,
      type: this.transformBinanceOrderType(order.type),
      quantity: this.formatDecimal(order.origQty || order.quantity || '0'),
      price: order.price ? this.formatDecimal(order.price) : undefined,
      stopPrice: order.stopPrice
        ? this.formatDecimal(order.stopPrice)
        : undefined,
      status,
      timeInForce: (order.timeInForce as TimeInForce) || 'GTC',
      timestamp: this.formatTimestamp(
        order.time || order.transactTime || Date.now()
      ),
      updateTime: order.updateTime
        ? this.formatTimestamp(order.updateTime)
        : undefined,
      executedQuantity: order.executedQty
        ? this.formatDecimal(order.executedQty)
        : undefined,
      cummulativeQuoteQuantity: order.cummulativeQuoteQty
        ? this.formatDecimal(order.cummulativeQuoteQty)
        : undefined,
      fills: order.fills
        ? order.fills.map((fill: any) => ({
            id: uuidv4(),
            price: this.formatDecimal(fill.price),
            quantity: this.formatDecimal(fill.qty),
            commission: this.formatDecimal(fill.commission),
            commissionAsset: fill.commissionAsset,
            timestamp: this.formatTimestamp(order.transactTime || Date.now()),
          }))
        : undefined,
    };
  }

  private transformBinanceOrderStatus(status: string): OrderStatus {
    const statusMap: { [key: string]: OrderStatus } = {
      NEW: OrderStatus.NEW,
      PARTIALLY_FILLED: OrderStatus.PARTIALLY_FILLED,
      FILLED: OrderStatus.FILLED,
      CANCELED: OrderStatus.CANCELED,
      PENDING_CANCEL: OrderStatus.CANCELED,
      REJECTED: OrderStatus.REJECTED,
      EXPIRED: OrderStatus.EXPIRED,
    };

    return statusMap[status] || OrderStatus.NEW;
  }

  private transformBinanceOrderType(type: string): OrderType {
    const typeMap: { [key: string]: OrderType } = {
      MARKET: OrderType.MARKET,
      LIMIT: OrderType.LIMIT,
      STOP_LOSS: OrderType.STOP_LOSS,
      STOP_LOSS_LIMIT: OrderType.STOP_LOSS_LIMIT,
      TAKE_PROFIT: OrderType.TAKE_PROFIT,
      TAKE_PROFIT_LIMIT: OrderType.TAKE_PROFIT_LIMIT,
    };

    return typeMap[type] || OrderType.LIMIT;
  }

  private transformBinanceTicker(data: any): Ticker {
    return {
      symbol: data.s,
      price: this.formatDecimal(data.c),
      volume: this.formatDecimal(data.v),
      timestamp: new Date(),
      bid: this.formatDecimal(data.b),
      ask: this.formatDecimal(data.a),
      high24h: this.formatDecimal(data.h),
      low24h: this.formatDecimal(data.l),
      change24h: this.formatDecimal(data.P),
    };
  }

  private transformBinanceOrderBook(data: any, symbol: string): OrderBook {
    return {
      symbol: symbol.toUpperCase(),
      timestamp: new Date(),
      bids: data.b.map((bid: string[]) => [
        this.formatDecimal(bid[0]),
        this.formatDecimal(bid[1]),
      ]),
      asks: data.a.map((ask: string[]) => [
        this.formatDecimal(ask[0]),
        this.formatDecimal(ask[1]),
      ]),
    };
  }

  private transformBinanceTrade(data: any, symbol: string): Trade {
    return {
      id: data.t.toString(),
      symbol: symbol.toUpperCase(),
      price: this.formatDecimal(data.p),
      quantity: this.formatDecimal(data.q),
      side: data.m ? 'sell' : 'buy', // m indicates buyer is maker
      timestamp: this.formatTimestamp(data.T),
    };
  }

  private transformBinanceKline(data: any): Kline {
    return {
      symbol: data.s,
      interval: data.i,
      openTime: this.formatTimestamp(data.t),
      closeTime: this.formatTimestamp(data.T),
      open: this.formatDecimal(data.o),
      high: this.formatDecimal(data.h),
      low: this.formatDecimal(data.l),
      close: this.formatDecimal(data.c),
      volume: this.formatDecimal(data.v),
      quoteVolume: this.formatDecimal(data.q),
      trades: data.n,
    };
  }
}
