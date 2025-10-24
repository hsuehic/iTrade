import crypto from 'crypto';

import axios, { AxiosInstance } from 'axios';
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
} from '@itrade/core';

import { BaseExchange } from '../base/BaseExchange';
import { BinanceWebsocket } from './BinanceWebsocket';
import {
  BinanceWebSocketManager,
  type BinanceMarketType,
} from './BinanceWebSocketManager';

export class BinanceExchange extends BaseExchange {
  // Spot API URLs
  private static readonly SPOT_MAINNET_URL = 'https://api.binance.com';
  private static readonly SPOT_TESTNET_URL = 'https://testnet.binance.vision';
  private static readonly SPOT_MAINNET_WS = 'wss://stream.binance.com/ws';
  private static readonly SPOT_TESTNET_WS = 'wss://testnet.binance.vision/ws';

  // USDT-M Futures API URLs (Perpetual)
  private static readonly FUTURES_MAINNET_URL = 'https://fapi.binance.com';
  private static readonly FUTURES_TESTNET_URL = 'https://testnet.binancefuture.com';
  // WebSocket URLs for futures (reserved for future use)
  private static readonly _FUTURES_MAINNET_WS = 'wss://fstream.binance.com/ws';
  private static readonly _FUTURES_TESTNET_WS = 'wss://stream.binancefuture.com/ws';

  private spotClient: AxiosInstance;
  private futuresClient: AxiosInstance;
  private _isTestnet: boolean;
  private wsManager: BinanceWebSocketManager;
  private symbolMap = new Map<string, string>(); // normalized -> original symbol mapping
  private userWs?: BinanceWebsocket;

  constructor(isTestnet = false) {
    const baseUrl = isTestnet
      ? BinanceExchange.SPOT_TESTNET_URL
      : BinanceExchange.SPOT_MAINNET_URL;
    const wsBaseUrl = isTestnet
      ? BinanceExchange.SPOT_TESTNET_WS
      : BinanceExchange.SPOT_MAINNET_WS;

    super('binance', baseUrl, wsBaseUrl);

    this._isTestnet = isTestnet;

    // Initialize WebSocket Manager
    this.wsManager = new BinanceWebSocketManager({
      spotUrl: wsBaseUrl,
      futuresUrl: isTestnet
        ? BinanceExchange._FUTURES_TESTNET_WS
        : BinanceExchange._FUTURES_MAINNET_WS,
    });

    // Setup WebSocket Manager event handlers
    this.setupWebSocketManagerListeners();

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
    const isFutures = marketType === 'futures';
    return isFutures ? this.futuresClient : this.spotClient;
  }

  /**
   * Check if market type is futures/perpetual (reserved for future use)
   */
  private _isFuturesMarket(marketType?: BinanceMarketType): boolean {
    return marketType === 'futures';
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
    limit = 500,
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
    clientOrderId?: string,
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
    clientOrderId?: string,
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
    clientOrderId?: string,
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
        total: this.formatDecimal(balance.free).add(this.formatDecimal(balance.locked)),
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
        (filter: any) => filter.filterType === 'LOT_SIZE',
      );
      if (lotSizeFilter) {
        minTradeSize[symbolInfo.symbol] = this.formatDecimal(lotSizeFilter.minQty);
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

  /**
   * Setup WebSocket Manager event listeners
   */
  private setupWebSocketManagerListeners(): void {
    this.wsManager.on('connected', (marketType: BinanceMarketType) => {
      console.log(`[Binance] ${marketType} WebSocket connected`);
      this.emit('ws_connected', this.name);
    });

    this.wsManager.on('disconnected', (marketType: BinanceMarketType) => {
      console.log(`[Binance] ${marketType} WebSocket disconnected`);
      this.emit('ws_disconnected', this.name);
    });

    this.wsManager.on('error', (marketType: BinanceMarketType, error: Error) => {
      console.error(`[Binance] ${marketType} WebSocket error:`, error.message);
      this.emit('ws_error', error);
    });

    this.wsManager.on('data', (_marketType: BinanceMarketType, message: any) => {
      this.handleWebSocketMessage(message);
    });

    this.wsManager.on(
      'resubscribe_needed',
      (marketType: BinanceMarketType, type: string, symbol: string) => {
        // Auto-resubscribe after reconnection
        console.log(`[Binance] Resubscribing to ${type}:${symbol} on ${marketType}`);
        this.subscribe(type, symbol).catch((err) => {
          console.error(`[Binance] Resubscribe failed:`, err);
        });
      },
    );
  }

  protected buildWebSocketUrl(): string {
    // This is called by parent class, return spot URL
    return this.wsBaseUrl;
  }

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
    console.log(`[Binance] Unsubscribing from ${type}:${symbol}`);

    // Determine market type
    const marketType = this.wsManager.getMarketType(symbol);

    // Build stream name
    const streamName = this.buildStreamName(type, symbol);

    // Unsubscribe via WebSocket Manager
    await this.wsManager.unsubscribe(marketType, type, symbol, streamName);

    // Remove symbol mapping
    const normalized = this.normalizeSymbol(symbol).toLowerCase();
    this.symbolMap.delete(normalized);
  }

  private async subscribe(type: string, symbol: string): Promise<void> {
    // Determine market type from symbol
    const marketType = this.wsManager.getMarketType(symbol);

    console.log(`[Binance] Subscribing to ${type}:${symbol} (${marketType})`);

    // Store normalized -> original symbol mapping for later lookup
    const normalized = this.normalizeSymbol(symbol).toLowerCase();
    this.symbolMap.set(normalized, symbol);

    // Build stream name
    const streamName = this.buildStreamName(type, symbol);

    // Subscribe via WebSocket Manager
    await this.wsManager.subscribe(marketType, type, symbol, streamName);
  }

  /**
   * Build Binance stream name from type and symbol
   */
  private buildStreamName(type: string, symbol: string): string {
    const normalizedSymbol = this.normalizeSymbol(symbol);

    switch (type) {
      case 'ticker':
        return `${normalizedSymbol.toLowerCase()}@ticker`;
      case 'orderbook':
        return `${normalizedSymbol.toLowerCase()}@depth`;
      case 'trades':
        return `${normalizedSymbol.toLowerCase()}@trade`;
      case 'klines': {
        // For klines, symbol includes interval: BTC/USDT@1m
        if (symbol.includes('@')) {
          const [baseSym, interval] = symbol.split('@');
          const normalized = this.normalizeSymbol(baseSym);
          return `${normalized.toLowerCase()}@kline_${interval}`;
        }
        return `${normalizedSymbol.toLowerCase()}@kline_1m`;
      }
      default:
        throw new Error(`Unknown subscription type: ${type}`);
    }
  }

  protected async createWebSocketConnection(): Promise<void> {
    // Not used directly anymore, WebSocket Manager handles connections
    console.log('[Binance] Using WebSocket Manager for connections');
  }

  protected handleWebSocketMessage(message: any): void {
    // Handle market data messages (single stream format)
    if (message.e) {
      // Direct stream format (e.g., {"e":"trade","s":"BTCUSDT",...})
      const eventType = message.e;
      const symbol = message.s; // Normalized symbol from Binance
      const normalizedSymbol = symbol.toLowerCase();

      // Look up original symbol format
      const originalSymbol = this.symbolMap.get(normalizedSymbol) || symbol.toUpperCase();

      switch (eventType) {
        case '24hrTicker':
          this.emit('ticker', originalSymbol, this.transformBinanceTicker(message));
          break;
        case 'depthUpdate':
          this.emit(
            'orderbook',
            originalSymbol,
            this.transformBinanceOrderBook(message, normalizedSymbol),
          );
          break;
        case 'trade':
          this.emit(
            'trade',
            originalSymbol,
            this.transformBinanceTrade(message, normalizedSymbol),
          );
          break;
        case 'kline':
          this.emit('kline', originalSymbol, this.transformBinanceKline(message.k));
          break;
        default:
          console.warn(`[Binance] Unknown event type: ${eventType}`);
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

  // ================= User Data Subscription =================
  public async subscribeToUserData(): Promise<void> {
    if (!this.credentials) throw new Error('Exchange credentials not set');
    if (this.userWs) return; // already started
    this.userWs = new BinanceWebsocket({
      apiKey: this.credentials.apiKey,
      network: this._isTestnet ? 'testnet' : 'mainnet',
      autoReconnect: true,
    });
    this.userWs.on('spot:orderUpdate', (raw) => {
      const normalized = this.normalizeBinanceOrderUpdate(raw, 'spot');
      this.emit('orderUpdate', normalized.symbol, normalized);
    });
    this.userWs.on('futures:orderUpdate', (raw) => {
      const normalized = this.normalizeBinanceOrderUpdate(raw, 'futures');
      this.emit('orderUpdate', normalized.symbol, normalized);
    });
    this.userWs.on('spot:accountUpdate', (raw) => {
      const { balances } = this.normalizeBinanceAccountUpdate(raw, 'spot');
      this.emit('accountUpdate', 'spot', balances);
    });
    this.userWs.on('futures:accountUpdate', (raw) => {
      const { balances, positions } = this.normalizeBinanceAccountUpdate(raw, 'futures');
      if (balances.length) this.emit('accountUpdate', 'futures', balances);
      if (positions.length) this.emit('positionUpdate', 'futures', positions);
    });
    await this.userWs.start();
  }

  private normalizeBinanceOrderUpdate(data: any, market: string): Order {
    // Supports spot executionReport and futures ORDER_TRADE_UPDATE
    if (data.e === 'executionReport') {
      const symbol = data.s as string;
      const side =
        (data.S || '').toLowerCase() === 'buy' ? OrderSide.BUY : OrderSide.SELL;
      const type = this.transformBinanceOrderType(data.o || 'LIMIT');
      const qty = this.formatDecimal(data.q || '0');
      const price = data.p ? this.formatDecimal(data.p) : undefined;
      return {
        id: (data.i ?? data.c ?? uuidv4()).toString(),
        clientOrderId: data.c,
        symbol,
        side,
        type,
        quantity: qty,
        price,
        stopPrice: data.P ? this.formatDecimal(data.P) : undefined,
        status: this.transformBinanceOrderStatus(data.X || data.x || 'NEW'),
        timeInForce: (data.f as TimeInForce) || 'GTC',
        timestamp: this.formatTimestamp(data.T || Date.now()),
        updateTime: data.T ? this.formatTimestamp(data.T) : undefined,
        executedQuantity: data.z ? this.formatDecimal(data.z) : undefined,
      };
    }
    if (data.e === 'ORDER_TRADE_UPDATE' && data.o) {
      const o = data.o;
      const symbol = o.s as string;
      const side = (o.S || '').toLowerCase() === 'buy' ? OrderSide.BUY : OrderSide.SELL;
      const type = this.transformBinanceOrderType(o.o || 'LIMIT');
      const qty = this.formatDecimal(o.q || '0');
      const price = o.p ? this.formatDecimal(o.p) : undefined;
      return {
        id: (o.i ?? o.c ?? uuidv4()).toString(),
        clientOrderId: o.c,
        symbol,
        side,
        type,
        quantity: qty,
        price,
        stopPrice: o.sp ? this.formatDecimal(o.sp) : undefined,
        status: this.transformBinanceOrderStatus(o.X || 'NEW'),
        timeInForce: (o.f as TimeInForce) || 'GTC',
        timestamp: this.formatTimestamp(o.T || Date.now()),
        updateTime: o.T ? this.formatTimestamp(o.T) : undefined,
        executedQuantity: o.z ? this.formatDecimal(o.z) : undefined,
      };
    }
    // Fallback minimal
    return {
      id: uuidv4(),
      clientOrderId: undefined,
      symbol: (data.s || data.o?.s || '').toString(),
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      quantity: this.formatDecimal('0'),
      status: this.transformBinanceOrderStatus('NEW'),
      timeInForce: 'GTC',
      timestamp: new Date(),
    } as Order;
  }

  private normalizeBinanceAccountUpdate(
    data: any,
    market: 'spot' | 'futures',
  ): { balances: Balance[]; positions: Position[] } {
    const balances: Balance[] = [];
    const positions: Position[] = [];

    if (market === 'spot' && data.e === 'outboundAccountPosition') {
      const list = data.B || [];
      for (const b of list) {
        balances.push({
          asset: b.a,
          free: this.formatDecimal(b.f || '0'),
          locked: this.formatDecimal(b.l || '0'),
          total: this.formatDecimal(b.f || '0').add(this.formatDecimal(b.l || '0')),
        });
      }
    }
    if (market === 'futures' && data.e === 'ACCOUNT_UPDATE' && data.a) {
      const a = data.a;
      if (Array.isArray(a.B)) {
        for (const b of a.B) {
          balances.push({
            asset: b.a,
            free: this.formatDecimal(b.wb || '0'),
            locked: this.formatDecimal('0'),
            total: this.formatDecimal(b.wb || '0'),
          });
        }
      }
      if (Array.isArray(a.P)) {
        for (const p of a.P) {
          positions.push({
            symbol: p.s,
            side: (p.ps || 'LONG').toLowerCase() === 'long' ? 'long' : 'short',
            quantity: this.formatDecimal(p.pa || '0'),
            avgPrice: this.formatDecimal(p.ep || '0'),
            markPrice: this.formatDecimal('0'),
            unrealizedPnl: this.formatDecimal(p.up || '0'),
            leverage: this.formatDecimal(p.l || '0'),
            timestamp: new Date(),
          });
        }
      }
    }

    return { balances, positions };
  }

  private transformBinanceOrder(order: any): Order {
    const status = this.transformBinanceOrderStatus(order.status);

    return {
      id: order.orderId?.toString() || uuidv4(),
      clientOrderId: order.clientOrderId,
      symbol: order.symbol,
      side: order.side?.toLowerCase() === 'buy' ? OrderSide.BUY : OrderSide.SELL,
      type: this.transformBinanceOrderType(order.type),
      quantity: this.formatDecimal(order.origQty || order.quantity || '0'),
      price: order.price ? this.formatDecimal(order.price) : undefined,
      stopPrice: order.stopPrice ? this.formatDecimal(order.stopPrice) : undefined,
      status,
      timeInForce: (order.timeInForce as TimeInForce) || 'GTC',
      timestamp: this.formatTimestamp(order.time || order.transactTime || Date.now()),
      updateTime: order.updateTime ? this.formatTimestamp(order.updateTime) : undefined,
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
