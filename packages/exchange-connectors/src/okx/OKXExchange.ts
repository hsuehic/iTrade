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
  KlineInterval,
  AccountInfo,
  Balance,
  Position,
  ExchangeInfo,
  SymbolInfo,
  ExchangeCredentials,
  TradeMode,
} from '@itrade/core';

export type OkxWsType = 'public' | 'private' | 'business';

import { BaseExchange } from '../base/BaseExchange';

export interface OKXCredentials extends ExchangeCredentials {
  passphrase?: string;
}

export class OKXExchange extends BaseExchange {
  private static readonly MAINNET_BASE_URL = 'https://www.okx.com';
  private static readonly TESTNET_BASE_URL = 'https://www.okx.com'; // OKX 使用同一个 URL，通过 demo trading 模式区分
  private static readonly MAINNET_WS_URL_PUBLIC = 'wss://ws.okx.com/ws/v5/public';
  private static readonly MAINNET_WS_URL_PRIVATE = 'wss://ws.okx.com/ws/v5/private';
  private static readonly MAINNET_WS_URL_BUSINESS = 'wss://ws.okx.com/ws/v5/business';
  private static readonly TESTNET_WS_URL_PUBLIC = 'wss://wspap.okx.com/ws/v5/public'; // Demo trading
  private static readonly TESTNET_WS_URL_PRIVATE = 'wss://wspap.okx.com/ws/v5/private';
  private static readonly TESTNET_WS_URL_BUSINESS = 'wss://wspap.okx.com/ws/v5/business';

  private passphrase?: string;
  private isDemo: boolean;
  private okxReconnectAttemptsMap: Record<OkxWsType, number> = {
    public: 0,
    private: 0,
    business: 0,
  };
  private okxHeartbeatTimers: Partial<Record<OkxWsType, NodeJS.Timeout>> = {};
  private okxReconnectTimers: Partial<Record<OkxWsType, NodeJS.Timeout>> = {};
  private okxSubscriptions = new Map<string, Set<string>>();
  private okxPrivateAuthenticated = false;
  private symbolMap = new Map<string, string>(); // OKX instId -> original symbol mapping
  private leverageCache = new Map<string, number>();

  constructor(isDemo = false) {
    const baseUrl = isDemo ? OKXExchange.TESTNET_BASE_URL : OKXExchange.MAINNET_BASE_URL;
    const wsBaseUrl = isDemo
      ? OKXExchange.TESTNET_WS_URL_PUBLIC
      : OKXExchange.MAINNET_WS_URL_PUBLIC;

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
      symbol, // Use unified symbol format
      exchange: this.name, // Add exchange name
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
      symbol, // Use unified symbol format
      exchange: this.name, // Add exchange name
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
      symbol, // Use unified symbol format
      exchange: this.name, // Add exchange name
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
    limit = 100,
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
      symbol, // Use unified symbol format (input symbol)
      exchange: this.name, // Add exchange name
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
      isClosed: true, // REST API returns historical/closed klines
    }));
  }

  public async createOrder(
    symbol: string,
    side: OrderSide,
    type: OrderType,
    quantity: Decimal,
    price?: Decimal,
    _timeInForce: TimeInForce = TimeInForce.GTC,
    clientOrderId?: string,
    options?: {
      tradeMode?: TradeMode;
      leverage?: number;
    },
  ): Promise<Order> {
    const instId = this.normalizeSymbol(symbol);

    // Determine instrument type from OKX instId
    const isSwap = instId.endsWith('-SWAP') || /-\d{6}$/.test(instId);

    // Determine tdMode: use option if provided, else default
    // SPOT: cash (non-margin trading)
    // SWAP/FUTURES: isolated (safer than cross), or cross if specified
    let tdMode = options?.tradeMode;
    if (!tdMode) {
      tdMode = isSwap ? TradeMode.ISOLATED : TradeMode.CASH;
    }

    // Ensure leverage is set at account level for SWAP/FUTURES before placing order
    if (isSwap && options?.leverage) {
      const current = this.leverageCache.get(instId);
      if (current !== options.leverage) {
        await this.setOkxLeverage(instId, options.leverage, tdMode);
        this.leverageCache.set(instId, options.leverage);
      }
    }

    const orderData: Record<string, string> = {
      instId,
      tdMode, // cash=spot, isolated=isolated margin, cross=cross margin
      side: side.toLowerCase(),
      ordType: this.normalizeOrderType(type),
      sz: quantity.toString(),
    };

    // Set leverage and posSide for SWAP/FUTURES
    if (isSwap) {
      if (options?.leverage) {
        orderData.lever = options.leverage.toString();
      }
      // 🔄 Using net mode (one-way position mode) for automatic position management
      // In net mode:
      // - BUY automatically increases long position or decreases short position
      // - SELL automatically decreases long position or increases short position
      // This is the most intuitive behavior for most trading strategies
      orderData.posSide = 'net';
    }

    if (price) {
      orderData.px = price.toString();
    }

    if (clientOrderId) {
      orderData.clOrdId = clientOrderId;
    }

    // Clean up undefined values (OKX API doesn't accept undefined)
    Object.keys(orderData).forEach((key) => {
      if (orderData[key] === undefined || orderData[key] === null) {
        delete orderData[key];
      }
    });

    const signedData = this.signOKXRequest('POST', '/api/v5/trade/order', orderData);
    const response = await this.httpClient.post('/api/v5/trade/order', orderData, {
      headers: signedData.headers,
    });

    if (response.data.code !== '0') {
      const details = Array.isArray(response.data.data)
        ? JSON.stringify(response.data.data[0] || {})
        : '';
      throw new Error(
        `OKX API error [${response.data.code}]: ${response.data.msg} ${details}`,
      );
    }

    const data = response.data.data[0];
    return this.transformOKXOrder(data, instId, side, type, quantity, price);
  }

  private async setOkxLeverage(
    instId: string,
    leverage: number,
    tradeMode: TradeMode,
  ): Promise<void> {
    // OKX leverage must be set via account API for SWAP/FUTURES
    // Docs: POST /api/v5/account/set-leverage
    const body: Record<string, string> = {
      instId,
      lever: leverage.toString(),
      mgnMode: tradeMode === TradeMode.CROSS ? 'cross' : 'isolated',
      posSide: 'net',
    };

    const signed = this.signOKXRequest('POST', '/api/v5/account/set-leverage', body);
    const resp = await this.httpClient.post('/api/v5/account/set-leverage', body, {
      headers: signed.headers,
    });

    if (resp.data.code !== '0') {
      const details = Array.isArray(resp.data.data)
        ? JSON.stringify(resp.data.data[0] || {})
        : '';
      throw new Error(
        `OKX set-leverage error [${resp.data.code}]: ${resp.data.msg} ${details}`,
      );
    }
  }

  public async cancelOrder(
    symbol: string,
    orderId: string,
    clientOrderId?: string,
  ): Promise<Order> {
    const instId = this.normalizeSymbol(symbol);

    const cancelData: Record<string, string> = { instId };

    if (clientOrderId) {
      cancelData.clOrdId = clientOrderId;
    } else {
      cancelData.ordId = orderId;
    }

    // Clean up undefined values
    Object.keys(cancelData).forEach((key) => {
      if (cancelData[key] === undefined || cancelData[key] === null) {
        delete cancelData[key];
      }
    });

    const signedData = this.signOKXRequest(
      'POST',
      '/api/v5/trade/cancel-order',
      cancelData,
    );
    const response = await this.httpClient.post(
      '/api/v5/trade/cancel-order',
      cancelData,
      {
        headers: signedData.headers,
      },
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
    clientOrderId?: string,
  ): Promise<Order> {
    const instId = this.normalizeSymbol(symbol);

    const params: any = { instId };
    if (clientOrderId) {
      params.clOrdId = clientOrderId;
    } else {
      params.ordId = orderId;
    }

    const signedData = this.signOKXRequest('GET', '/api/v5/trade/order', params);
    const response = await this.httpClient.get(signedData.endpoint, {
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
      data.px ? this.formatDecimal(data.px) : undefined,
    );
  }

  public async getOpenOrders(symbol?: string): Promise<Order[]> {
    const params: any = {};

    if (symbol) {
      const instId = this.normalizeSymbol(symbol);
      params.instId = instId;

      // Determine instType from symbol format
      if (instId.endsWith('-SWAP')) {
        params.instType = 'SWAP';
      } else if (/-\d{6}$/.test(instId)) {
        params.instType = 'FUTURES';
      } else {
        params.instType = 'SPOT';
      }
    } else {
      // If no symbol, need to specify instType or query all types
      // For now, query SWAP (most common for trading)
      params.instType = 'SWAP';
    }

    const signedData = this.signOKXRequest('GET', '/api/v5/trade/orders-pending', params);
    // For GET requests, use the endpoint with query string from signedData
    const response = await this.httpClient.get(signedData.endpoint, {
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
        order.px ? this.formatDecimal(order.px) : undefined,
      ),
    );
  }

  public async getOrderHistory(symbol?: string, limit = 100): Promise<Order[]> {
    // Note: OKX's orders-history endpoint requires Trade permission on API key
    // If you get 401 errors, check API key permissions on OKX website
    try {
      // Determine instType based on symbol, or query both if no symbol provided
      const instTypes: string[] = [];

      if (symbol) {
        // Determine instType from symbol format
        // Perpetual/Swap: BTC/USDT:USDT or contains "SWAP"
        if (symbol.includes(':') || symbol.toUpperCase().includes('SWAP')) {
          instTypes.push('SWAP');
        } else {
          instTypes.push('SPOT');
        }
      } else {
        // No symbol specified, query both SPOT and SWAP
        instTypes.push('SPOT', 'SWAP');
      }

      const allOrders: Order[] = [];

      // Query each instType
      for (const instType of instTypes) {
        const params: any = {
          instType,
          limit: Math.min(limit, 100).toString(),
        };
        if (symbol) {
          params.instId = this.normalizeSymbol(symbol);
        }

        const signedData = this.signOKXRequest(
          'GET',
          '/api/v5/trade/orders-history',
          params,
        );
        const response = await this.httpClient.get(signedData.endpoint, {
          headers: signedData.headers,
        });

        if (response.data.code !== '0') {
          throw new Error(`OKX API error: ${response.data.msg}`);
        }

        const orders = response.data.data.map((order: any) =>
          this.transformOKXOrder(
            order,
            order.instId,
            order.side === 'buy' ? OrderSide.BUY : OrderSide.SELL,
            this.transformOKXOrderType(order.ordType),
            this.formatDecimal(order.sz),
            order.px ? this.formatDecimal(order.px) : undefined,
          ),
        );

        allOrders.push(...orders);
      }

      return allOrders;
    } catch (error: any) {
      // If 401 Unauthorized, it's likely due to insufficient API key permissions
      if (error.response?.status === 401) {
        console.warn(
          '[OKX] getOrderHistory requires Trade permission on API key. Returning empty array.',
        );
        return [];
      }
      throw error;
    }
  }

  public async getAccountInfo(): Promise<AccountInfo> {
    const signedData = this.signOKXRequest('GET', '/api/v5/account/balance', {});
    const response = await this.httpClient.get(signedData.endpoint, {
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
    const signedData = this.signOKXRequest('GET', '/api/v5/account/positions', {});
    const response = await this.httpClient.get(signedData.endpoint, {
      headers: signedData.headers,
    });

    if (response.data.code !== '0') {
      throw new Error(`OKX API error: ${response.data.msg}`);
    }

    return response.data.data.map((pos: any) => {
      // ✅ FIXED: Use markPx only, do NOT fallback to avgPx
      // If markPx is missing, use lastPx as fallback (NOT avgPx)
      const markPrice = this.formatDecimal((pos.markPx ?? pos.lastPx ?? '0').toString());

      // Calculate market value: quantity * markPrice
      const quantity = this.formatDecimal((pos.pos ?? '0').toString());
      const marketValue = quantity.abs().mul(markPrice);

      return {
        symbol: pos.instId,
        side: pos.posSide === 'long' ? 'long' : 'short',
        quantity: quantity,
        avgPrice: this.formatDecimal((pos.avgPx ?? '0').toString()),
        markPrice: markPrice,
        unrealizedPnl: this.formatDecimal((pos.upl ?? '0').toString()),
        leverage: this.formatDecimal((pos.lever ?? '0').toString()),
        timestamp: pos.uTime ? new Date(parseInt(pos.uTime)) : new Date(),
        // ✅ Add market value and notionalUsd
        marketValue: marketValue,
        notionalUsd: pos.notionalUsd,
      };
    });
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

  public async getSymbolInfo(symbol: string): Promise<SymbolInfo> {
    // Normalize symbol to OKX format
    const okxSymbol = this.normalizeSymbol(symbol);

    // Determine instrument type
    let instType = 'SPOT';
    if (okxSymbol.endsWith('-SWAP')) {
      instType = 'SWAP';
    } else if (okxSymbol.match(/-\d{6}$/)) {
      instType = 'FUTURES';
    }

    // Fetch instrument info
    const response = await this.httpClient.get('/api/v5/public/instruments', {
      params: { instType, instId: okxSymbol },
    });

    const instrumentData = response.data.data?.[0];
    if (!instrumentData) {
      throw new Error(`Symbol ${symbol} not found on OKX`);
    }

    // Extract precision from lotSz and tickSz
    const lotSz = instrumentData.lotSz || '1';
    const tickSz = instrumentData.tickSz || '0.01';
    const minSz = instrumentData.minSz || lotSz;

    // Calculate precision from tick/lot size
    const quantityPrecision = this.calculatePrecision(lotSz);
    const pricePrecision = this.calculatePrecision(tickSz);

    // Parse min notional (minSz * price)
    const minQuantity = new Decimal(minSz);
    const stepSize = new Decimal(lotSz);
    const tickSize = new Decimal(tickSz);

    // OKX doesn't provide minNotional directly, estimate from minSz
    const minNotional = new Decimal(instrumentData.minSz || '10');

    // Determine market type
    const market =
      instType === 'SPOT' ? 'spot' : instType === 'SWAP' ? 'swap' : 'futures';

    // Denormalize symbol back to unified format
    const unifiedSymbol = this.denormalizeSymbol(okxSymbol);

    return {
      symbol: unifiedSymbol,
      nativeSymbol: okxSymbol,
      baseAsset: instrumentData.baseCcy || '',
      quoteAsset: instrumentData.quoteCcy || instrumentData.settleCcy || '',
      pricePrecision,
      quantityPrecision,
      minQuantity,
      maxQuantity: instrumentData.maxMktSz
        ? new Decimal(instrumentData.maxMktSz)
        : undefined,
      minNotional,
      stepSize,
      tickSize,
      status: this.mapOKXStatus(instrumentData.state),
      market,
    };
  }

  private calculatePrecision(sizeString: string): number {
    // Calculate decimal places from a string like "0.01" -> 2, "0.001" -> 3
    const parts = sizeString.split('.');
    if (parts.length === 1) return 0;
    return parts[1].length;
  }

  private mapOKXStatus(
    state: string,
  ): 'active' | 'inactive' | 'pre_trading' | 'post_trading' {
    switch (state) {
      case 'live':
        return 'active';
      case 'preopen':
        return 'pre_trading';
      case 'suspend':
      case 'expired':
      default:
        return 'inactive';
    }
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

  /**
   * Denormalize symbol from OKX format to unified format
   * OKX → Unified
   * BTC-USDT → BTC/USDT (spot)
   * BTC-USDT-SWAP → BTC/USDT:USDT (perpetual)
   * APT-USDT-SWAP → APT/USDT:USDT (perpetual)
   */
  protected denormalizeSymbol(instId: string): string {
    const upper = instId.toUpperCase();

    // Check if it's a perpetual swap
    if (upper.endsWith('-SWAP')) {
      // BTC-USDT-SWAP → BTC/USDT:USDT
      const withoutSwap = upper.replace('-SWAP', '');
      const parts = withoutSwap.split('-');
      if (parts.length >= 2) {
        const quote = parts[parts.length - 1];
        const base = parts.slice(0, -1).join('-');
        return `${base}/${quote}:${quote}`;
      }
    }

    // Check if it's a dated futures contract
    if (upper.match(/-\d{6}$/)) {
      // BTC-USDT-250328 → BTC/USDT:250328
      const parts = upper.split('-');
      if (parts.length >= 3) {
        const date = parts[parts.length - 1];
        const quote = parts[parts.length - 2];
        const base = parts.slice(0, -2).join('-');
        return `${base}/${quote}:${date}`;
      }
    }

    // Default: spot format BTC-USDT → BTC/USDT
    return upper.replace('-', '/');
  }

  private async createWsConnect(key: OkxWsType) {
    // Clear scheduled reconnect
    if (this.okxReconnectTimers[key]) {
      clearTimeout(this.okxReconnectTimers[key]!);
      this.okxReconnectTimers[key] = undefined;
    }

    // ✅ Close and remove old WebSocket connection if exists
    const existingWs = this.wsConnections.get(key);
    if (existingWs) {
      // Remove all listeners to prevent duplicate message handling
      existingWs.removeAllListeners();
      if (
        existingWs.readyState === WebSocket.OPEN ||
        existingWs.readyState === WebSocket.CONNECTING
      ) {
        existingWs.close();
      }
      this.wsConnections.delete(key);
    }

    const wsUrl = this.buildWebSocketUrl(key);
    const ws = new WebSocket(wsUrl);
    this.wsConnections.set(key, ws);

    ws.on('open', () => {
      this.emit('ws_connected', `${this.name}:${key}`);
      this.okxReconnectAttemptsMap[key] = 0;
      this.startOkxHeartbeat(key, ws);
      this.authenticatePrivateIfNeeded(key, ws).catch((e) => this.emit('ws_error', e));
      this.resubscribeForKey(key).catch((e) => this.emit('ws_error', e));
    });

    ws.on('ping', () => ws.pong());
    ws.on('message', (data: string) => {
      try {
        const message = JSON.parse(data);
        this.handleWebSocketMessage(message);
      } catch (error) {
        this.emit('ws_error', error);
      }
    });
    ws.on('close', (code) => {
      this.emit('ws_disconnected', `${this.name}:${key}`, code, '');
      this.wsConnections.delete(key);
      this.stopOkxHeartbeat(key);
      if (code !== 1000) {
        this.scheduleOkxReconnect(key);
      }
    });
    ws.on('error', (error: Error) => {
      this.emit('ws_error', error);
    });
    return new Promise((resolve) => {
      ws.on('open', () => resolve(void 0));
    });
  }

  protected buildWebSocketUrl(key?: OkxWsType): string {
    // Return appropriate WS URL for demo vs mainnet and endpoint type
    if (key === 'public' || (!key && !this.isDemo)) {
      return this.isDemo
        ? OKXExchange.TESTNET_WS_URL_PUBLIC
        : OKXExchange.MAINNET_WS_URL_PUBLIC;
    }
    if (key === 'private') {
      return this.isDemo
        ? OKXExchange.TESTNET_WS_URL_PRIVATE
        : OKXExchange.MAINNET_WS_URL_PRIVATE;
    }
    if (key === 'business') {
      return this.isDemo
        ? OKXExchange.TESTNET_WS_URL_BUSINESS
        : OKXExchange.MAINNET_WS_URL_BUSINESS;
    }
    return this.wsBaseUrl;
  }

  // Ensure BaseExchange 'market' connection exists by pointing to public WS
  protected async createWebSocketConnection(): Promise<void> {
    await this.createWsConnect('public');
    const ws = this.wsConnections.get('public');
    if (ws) this.wsConnections.set('market', ws);
  }

  // Avoid BaseExchange auto-resubscribe since OKX handles per-connection resubscribe
  protected async onWebSocketOpen(): Promise<void> {
    // no-op for OKX
  }

  protected async sendWebSocketSubscription(
    type: string,
    symbol: string,
    depthOrInterval?: number | string,
  ): Promise<void> {
    const channel = this.getOKXChannel(type, symbol, depthOrInterval);
    const targetKey: OkxWsType = this.resolveWsTypeForChannel(channel.channel);
    const subscribeMsg = { op: 'subscribe', args: [channel] };

    let ws = this.wsConnections.get(targetKey);
    const needsNewConnection =
      !ws || ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED;

    if (needsNewConnection) {
      // ✅ Create new connection - resubscribeForKey will handle sending subscriptions
      await this.createWsConnect(targetKey);
      // Don't send subscription here - resubscribeForKey (called on 'open' event) will handle it
      return;
    }

    // ✅ Connection already exists and is ready - send subscription immediately
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(subscribeMsg));
    }
  }

  protected handleWebSocketMessage(message: any): void {
    // OKX message format
    if (message.event === 'subscribe') {
      this.emit('ws_subscribed', message.arg);
      console.log(`[OKX] Subscription confirmed:`, message.arg);
      return;
    }

    if (message.event === 'error') {
      console.error(`[OKX] WebSocket error:`, message.msg, message);
      this.emit('ws_error', new Error(message.msg));
      return;
    }

    if (message.event === 'login') {
      // Private login ack
      if (message.code === '0') {
        console.log('[OKX] Private WebSocket login successful');
        this.okxPrivateAuthenticated = true;
      } else {
        console.error('[OKX] Private WebSocket login failed:', message.msg);
        this.okxPrivateAuthenticated = false;
      }
      return;
    }

    if (message.data && message.arg) {
      const { channel, instId } = message.arg;
      const data = message.data[0];

      // Look up original symbol format from mapping
      const originalSymbol = this.symbolMap.get(instId) || instId;

      if (channel === 'tickers') {
        this.emit(
          'ticker',
          originalSymbol,
          this.transformOKXTicker(data, originalSymbol),
        );
      } else if (channel === 'books5' || channel === 'books') {
        this.emit(
          'orderbook',
          originalSymbol,
          this.transformOKXOrderBook(data, originalSymbol),
        );
      } else if (channel === 'trades') {
        this.emit('trade', originalSymbol, this.transformOKXTrade(data, originalSymbol));
      } else if (channel.startsWith('candle')) {
        // Extract interval from channel name (e.g., "candle5m" -> "5m")
        const interval = channel.replace('candle', '');
        this.emit(
          'kline',
          originalSymbol,
          this.transformOKXKline(data, originalSymbol, interval),
        );
      } else if (channel === 'orders') {
        try {
          const order = this.transformOKXPrivateOrder(data);
          this.emit('orderUpdate', order.symbol, order);
        } catch (error) {
          console.error('[OKX] Error transforming order data:', error);
          console.error('[OKX] Raw order data:', JSON.stringify(data, null, 2));
        }
      } else if (channel === 'balance_and_position') {
        try {
          // 🔍 Debug: Print raw position data
          console.log(
            '[OKX] 📦 Raw balance_and_position data:',
            JSON.stringify(data, null, 2),
          );
          const { balances, positions } = this.transformOKXBalanceAndPosition(data);
          if (balances.length) this.emit('accountUpdate', 'okx', balances);
          if (positions.length) {
            console.log(
              '[OKX] 📊 Normalized positions:',
              JSON.stringify(positions, null, 2),
            );
            this.emit('positionUpdate', 'okx', positions);
          }
        } catch (error) {
          console.error('[OKX] Error transforming balance_and_position data:', error);
          console.error(
            '[OKX] Raw balance_and_position data:',
            JSON.stringify(data, null, 2),
          );
        }
      } else if (channel === 'account') {
        // Handle account channel (spot balance updates)
        try {
          const balances = this.transformOKXAccount(data);
          if (balances.length) this.emit('accountUpdate', 'okx', balances);
        } catch (error) {
          console.error('[OKX] Error transforming account data:', error);
          console.error('[OKX] Raw account data:', JSON.stringify(data, null, 2));
        }
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
    params: Record<string, any>,
  ): { headers: Record<string, string>; body?: string; endpoint: string } {
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

    return { headers, body, endpoint };
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
    price?: Decimal,
  ): Order {
    // Calculate cummulativeQuoteQuantity from filled size and average price
    let cummulativeQuoteQuantity: Decimal | undefined;
    if (order.accFillSz && order.avgPx) {
      const accFillSz = this.formatDecimal(order.accFillSz);
      const avgPx = this.formatDecimal(order.avgPx);
      cummulativeQuoteQuantity = accFillSz.mul(avgPx);
    }

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
      timestamp: order.cTime
        ? new Date(parseInt(order.cTime))
        : order.uTime
          ? new Date(parseInt(order.uTime))
          : new Date(),
      updateTime: order.uTime ? new Date(parseInt(order.uTime)) : undefined,
      executedQuantity: order.accFillSz ? this.formatDecimal(order.accFillSz) : undefined,
      cummulativeQuoteQuantity,
    };
  }

  private transformOKXTicker(data: any, symbol: string): Ticker {
    return {
      symbol: symbol,
      exchange: this.name, // Add exchange name
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
      exchange: this.name, // Add exchange name
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
      exchange: this.name, // Add exchange name
      price: this.formatDecimal(data.px),
      quantity: this.formatDecimal(data.sz),
      side: data.side === 'buy' ? 'buy' : 'sell',
      timestamp: new Date(parseInt(data.ts)),
    };
  }

  private transformOKXKline(data: any, symbol: string, interval: string = '1m'): Kline {
    // OKX kline data format: [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm]
    // Index 8 (confirm field): "0" = K line is uncompleted, "1" = K line is completed
    // Reference: https://www.okx.com/docs-v5/en/#websocket-api-public-channel-candlesticks-channel

    // Calculate closeTime based on openTime + interval duration
    const openTime = parseInt(data[0]);
    const intervalMs = this.getIntervalMs(interval);
    const closeTime = openTime + intervalMs;

    return {
      symbol: symbol,
      exchange: this.name, // Add exchange name
      interval: interval as KlineInterval,
      openTime: new Date(openTime),
      closeTime: new Date(closeTime),
      open: this.formatDecimal(data[1]),
      high: this.formatDecimal(data[2]),
      low: this.formatDecimal(data[3]),
      close: this.formatDecimal(data[4]),
      volume: this.formatDecimal(data[5]),
      quoteVolume: this.formatDecimal(data[6]),
      trades: 0,
      isClosed: data[8] === '1', // OKX index 8: "1" = completed, "0" = uncompleted
    };
  }

  private transformOKXPrivateOrder(data: any): Order {
    // OKX private orders push format: ref docs v5 (orders channel)
    // Denormalize symbol: APT-USDT-SWAP → APT/USDT:USDT
    const symbol = this.denormalizeSymbol(data.instId);
    const side = (data.side || 'buy') === 'buy' ? OrderSide.BUY : OrderSide.SELL;
    const type = this.transformOKXOrderType(data.ordType || 'limit');
    const qty = this.formatDecimal(data.sz || '0');
    const price = data.px ? this.formatDecimal(data.px) : undefined;

    // Calculate cummulativeQuoteQuantity from filled size and average price
    let cummulativeQuoteQuantity: Decimal | undefined;
    let averagePrice: Decimal | undefined;
    if (data.accFillSz && data.avgPx) {
      const accFillSz = this.formatDecimal(data.accFillSz);
      const avgPx = this.formatDecimal(data.avgPx);
      cummulativeQuoteQuantity = accFillSz.mul(avgPx);
      averagePrice = avgPx; // 🆕 Set average execution price
    }

    return {
      id: (data.ordId || uuidv4()).toString(),
      clientOrderId: data.clOrdId,
      symbol,
      side,
      type,
      quantity: qty,
      price,
      status: this.transformOKXOrderStatus(data.state || 'live'),
      timeInForce: 'GTC' as TimeInForce,
      timestamp: data.cTime ? new Date(parseInt(data.cTime)) : new Date(),
      updateTime: data.uTime ? new Date(parseInt(data.uTime)) : undefined,
      executedQuantity: data.accFillSz ? this.formatDecimal(data.accFillSz) : undefined,
      cummulativeQuoteQuantity,
      averagePrice, // 🆕 Include average execution price
    };
  }

  private transformOKXBalanceAndPosition(data: any): {
    balances: Balance[];
    positions: Position[];
  } {
    const balances: Balance[] = [];
    const positions: Position[] = [];

    if (Array.isArray(data.balData)) {
      for (const b of data.balData) {
        balances.push({
          asset: b.ccy,
          free: this.formatDecimal(b.cashBal || '0'),
          locked: this.formatDecimal('0'),
          total: this.formatDecimal(b.cashBal || '0'),
        });
      }
    }

    if (Array.isArray(data.posData)) {
      for (const p of data.posData) {
        // 🔍 Debug: Log each position's raw fields (including all available fields)
        console.log('[OKX] 📍 Raw position fields:', {
          instId: p.instId,
          pos: p.pos,
          avgPx: p.avgPx,
          markPx: p.markPx,
          lastPx: p.lastPx,
          upl: p.upl,
          uplRatio: p.uplRatio,
          lever: p.lever,
          mgnMode: p.mgnMode,
          posSide: p.posSide,
          notionalUsd: p.notionalUsd, // Position value in USD
          uTime: p.uTime,
          cTime: p.cTime,
        });

        // Denormalize symbol: APT-USDT-SWAP → APT/USDT:USDT
        const unifiedSymbol = this.denormalizeSymbol(p.instId);

        // ✅ FIXED: Use markPx only, do NOT fallback to avgPx
        // markPx and avgPx should be different:
        // - avgPx: Average entry price of the position (from your orders)
        // - markPx: Current mark price used for PnL calculation (from market)
        // - lastPx: Last traded price
        // If markPx is missing, use lastPx as fallback (NOT avgPx)
        const markPrice = this.formatDecimal(p.markPx || p.lastPx || '0');

        // Calculate position value: quantity * markPrice (absolute value)
        const quantity = this.formatDecimal(p.pos || '0');
        const positionValue = quantity.abs().mul(markPrice);

        console.log('[OKX] 📊 Position calculated:', {
          symbol: unifiedSymbol,
          quantity: quantity.toString(),
          avgPrice: p.avgPx,
          markPrice: markPrice.toString(),
          positionValue: positionValue.toString(),
          notionalUsd: p.notionalUsd,
        });

        positions.push({
          symbol: unifiedSymbol,
          side: (p.posSide || 'net').toLowerCase(),
          quantity: quantity,
          avgPrice: this.formatDecimal(p.avgPx || '0'),
          markPrice: markPrice,
          unrealizedPnl: this.formatDecimal(p.upl ?? '0'),
          leverage: this.formatDecimal(p.lever ?? '0'),
          timestamp: new Date(),
          // ✅ Add market value and notionalUsd
          marketValue: positionValue,
          notionalUsd: p.notionalUsd,
        });
      }
    }

    return { balances, positions };
  }

  private transformOKXAccount(data: any): Balance[] {
    // Transform OKX account channel data (spot balances)
    const balances: Balance[] = [];

    // Handle different possible data structures
    if (!data) {
      console.warn('[OKX] transformOKXAccount received null/undefined data');
      return balances;
    }

    // Check if data has details array
    const details = data.details || data;
    if (!Array.isArray(details)) {
      console.warn('[OKX] transformOKXAccount: details is not an array', {
        dataType: typeof data,
        hasDetails: 'details' in data,
        detailsType: typeof details,
      });
      return balances;
    }

    for (const detail of details) {
      try {
        if (!detail || !detail.ccy) {
          console.warn('[OKX] Skipping invalid account detail:', detail);
          continue;
        }

        const free = this.formatDecimal(detail.availBal || '0');
        const locked = this.formatDecimal(detail.frozenBal || '0');
        balances.push({
          asset: detail.ccy,
          free,
          locked,
          total: free.add(locked),
        });
      } catch (error) {
        console.error('[OKX] Error transforming account detail:', error, detail);
      }
    }

    return balances;
  }

  private getOKXChannel(
    type: string,
    symbol: string,
    depthOrInterval?: number | string,
  ): any {
    const instId = this.normalizeSymbol(symbol);

    switch (type) {
      case 'ticker':
        return { channel: 'tickers', instId };
      case 'orderbook': {
        const depth = depthOrInterval as number | undefined;
        // OKX supports:
        // - books5: 5 levels (most efficient, default)
        // - books: 400 levels
        // - bbo-tbt: Best bid/offer tick-by-tick
        // - books-l2-tbt: Full L2 tick-by-tick (requires business endpoint)
        if (depth && depth <= 5) {
          return { channel: 'books5', instId };
        } else if (depth && depth > 5 && depth <= 400) {
          return { channel: 'books', instId };
        }
        // Default: books5 (most efficient)
        return { channel: 'books5', instId };
      }
      case 'trades':
        return { channel: 'trades', instId };
      case 'klines': {
        // symbol 格式: BTC-USDT@1m
        // OKX WebSocket uses format: { channel: "candle1m", instId: "BTC-USDT" }
        const [sym, interval] = symbol.split('@');
        const bar = this.normalizeInterval(interval || '1m');
        // Ensure lowercase for channel name (e.g., candle1m, candle1h)
        return {
          channel: `candle${bar.toLowerCase()}`,
          instId: this.normalizeSymbol(sym),
        };
      }
      default:
        return { channel: 'tickers', instId };
    }
  }

  private resolveWsTypeForChannel(channel: string): OkxWsType {
    // Business endpoint channels (require /business WebSocket URL)
    if (channel === 'books-l2-tbt') return 'business';
    if (channel.startsWith('candle')) return 'business'; // All candle/kline data
    // Default market data → public
    return 'public';
  }

  private async resubscribeForKey(key: OkxWsType): Promise<void> {
    // Iterate current subscriptions and send those that belong to this key
    for (const [type, symbols] of this.okxSubscriptions) {
      for (const symbol of symbols) {
        const channel = this.getOKXChannel(type, symbol);
        const targetKey = this.resolveWsTypeForChannel(channel.channel);
        if (targetKey !== key) continue;
        const ws = this.wsConnections.get(key);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ op: 'subscribe', args: [channel] }));
        }
      }
    }
  }

  private startOkxHeartbeat(key: OkxWsType, ws: WebSocket): void {
    this.stopOkxHeartbeat(key);
    this.okxHeartbeatTimers[key] = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.ping();
        } catch (_) {
          // ignore
        }
      }
    }, 20000);
  }

  public async subscribeToTicker(symbol: string): Promise<void> {
    await this.okxSubscribe('ticker', symbol);
  }

  public async subscribeToOrderBook(symbol: string, depth?: number): Promise<void> {
    await this.okxSubscribe('orderbook', symbol, depth);
  }

  public async subscribeToTrades(symbol: string): Promise<void> {
    await this.okxSubscribe('trades', symbol);
  }

  public async subscribeToKlines(symbol: string, interval: string): Promise<void> {
    await this.okxSubscribe('klines', `${symbol}@${interval}`);
  }

  public async unsubscribe(
    symbol: string,
    type: 'ticker' | 'orderbook' | 'trades' | 'klines',
  ): Promise<void> {
    // symbol for klines should be `${sym}@${interval}` as used in subscribe
    const keyForMap = type === 'klines' ? symbol : symbol;
    const subs = this.okxSubscriptions.get(type);
    if (subs) {
      subs.delete(keyForMap);
      if (subs.size === 0) this.okxSubscriptions.delete(type);
    }

    // Build channel and send unsubscribe to the correct socket
    const channel = this.getOKXChannel(type, symbol);
    const targetKey: OkxWsType = this.resolveWsTypeForChannel(channel.channel);
    const ws = this.wsConnections.get(targetKey);
    if (ws && ws.readyState === WebSocket.OPEN) {
      const msg = { op: 'unsubscribe', args: [channel] };
      ws.send(JSON.stringify(msg));
    }
  }

  private async okxSubscribe(
    type: string,
    symbol: string,
    depthOrInterval?: number | string,
  ): Promise<void> {
    // ✅ Check if already subscribed to avoid duplicate subscriptions
    if (!this.okxSubscriptions.has(type)) {
      this.okxSubscriptions.set(type, new Set());
    }

    const subscriptions = this.okxSubscriptions.get(type)!;
    const alreadySubscribed = subscriptions.has(symbol);

    // Add to subscription set
    subscriptions.add(symbol);

    // Store symbol mapping (OKX instId -> original symbol)
    // For klines, strip the @interval part
    let baseSymbol = symbol;
    if (type === 'klines' && symbol.includes('@')) {
      baseSymbol = symbol.split('@')[0];
    }
    const instId = this.normalizeSymbol(baseSymbol);
    this.symbolMap.set(instId, baseSymbol);

    // ✅ Only send WebSocket subscription if not already subscribed
    if (!alreadySubscribed) {
      await this.sendWebSocketSubscription(type, symbol, depthOrInterval);
    } else {
      console.log(
        `[OKX] Already subscribed to ${type} ${symbol}, skipping duplicate subscription`,
      );
    }
  }

  private stopOkxHeartbeat(key: OkxWsType): void {
    const timer = this.okxHeartbeatTimers[key];
    if (timer) clearInterval(timer);
    this.okxHeartbeatTimers[key] = undefined;
  }

  private scheduleOkxReconnect(key: OkxWsType): void {
    const attempts = this.okxReconnectAttemptsMap[key] ?? 0;
    const baseDelay = Math.min(30000, 1000 * Math.pow(2, attempts));
    const jitter = Math.floor(Math.random() * 1000);
    const delay = Math.max(1000, baseDelay) + jitter;
    this.okxReconnectAttemptsMap[key] = attempts + 1;
    if (this.okxReconnectTimers[key]) clearTimeout(this.okxReconnectTimers[key]!);
    this.okxReconnectTimers[key] = setTimeout(() => {
      this.createWsConnect(key).catch((e) => this.emit('ws_error', e));
    }, delay);
  }

  // ================= User Data Subscription (Private WS) =================
  /**
   * Subscribe to user data streams (orders, account balance, positions)
   * OKX requires authentication on the private WebSocket endpoint
   */
  public async subscribeToUserData(): Promise<void> {
    if (!this.credentials || !this.passphrase) {
      throw new Error('OKX credentials required for user data subscription');
    }

    console.log('[OKX] Subscribing to user data streams...');

    // Create private connection and authenticate
    await this.createWsConnect('private');

    // Wait for authentication
    if (!this.okxPrivateAuthenticated) {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('OKX private WebSocket authentication timeout'));
        }, 10000);

        const checkAuth = () => {
          if (this.okxPrivateAuthenticated) {
            clearTimeout(timeout);
            resolve();
          } else {
            setTimeout(checkAuth, 100);
          }
        };
        checkAuth();
      });
    }

    console.log('[OKX] Private WebSocket authenticated, subscribing to channels...');

    const ws = this.wsConnections.get('private');
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error('OKX private WebSocket not connected');
    }

    // Subscribe to orders channel (all instruments, all order types)
    const ordersSubscription = {
      op: 'subscribe',
      args: [
        {
          channel: 'orders',
          instType: 'ANY', // Subscribe to all instrument types (SPOT, SWAP, FUTURES, OPTION)
        },
      ],
    };

    console.log('[OKX] Subscribing to orders channel...');
    ws.send(JSON.stringify(ordersSubscription));

    // Subscribe to balance and position channel
    const balanceAndPositionSubscription = {
      op: 'subscribe',
      args: [
        {
          channel: 'balance_and_position',
        },
      ],
    };

    console.log('[OKX] Subscribing to balance_and_position channel...');
    ws.send(JSON.stringify(balanceAndPositionSubscription));

    // Subscribe to account channel (for spot balance updates)
    const accountSubscription = {
      op: 'subscribe',
      args: [
        {
          channel: 'account',
        },
      ],
    };

    console.log('[OKX] Subscribing to account channel...');
    ws.send(JSON.stringify(accountSubscription));

    console.log('[OKX] User data subscription requests sent');
  }

  private signOkxWsLogin(): {
    apiKey: string;
    passphrase: string;
    timestamp: string;
    sign: string;
  } {
    if (!this.credentials || !this.passphrase) throw new Error('Missing OKX credentials');
    // OKX requires timestamp in seconds with decimal (Unix epoch)
    // Use 1 decimal place for sub-second precision
    const timestamp = (Date.now() / 1000).toFixed(1);
    const prehash = timestamp + 'GET' + '/users/self/verify';
    const sign = crypto
      .createHmac('sha256', this.credentials.secretKey)
      .update(prehash)
      .digest('base64');
    return {
      apiKey: this.credentials.apiKey,
      passphrase: this.passphrase,
      timestamp,
      sign,
    };
  }

  private async authenticatePrivateIfNeeded(
    key: OkxWsType,
    ws: WebSocket,
  ): Promise<void> {
    if (key !== 'private') return;
    if (this.okxPrivateAuthenticated) {
      console.log('[OKX] Private WebSocket already authenticated');
      return;
    }

    console.log('[OKX] Authenticating private WebSocket...');
    const login = this.signOkxWsLogin();
    ws.send(
      JSON.stringify({
        op: 'login',
        args: [
          {
            apiKey: login.apiKey,
            passphrase: login.passphrase,
            timestamp: login.timestamp,
            sign: login.sign,
          },
        ],
      }),
    );
    // Note: okxPrivateAuthenticated will be set to true when we receive the login response
  }
}
