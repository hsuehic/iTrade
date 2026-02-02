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
  SymbolInfo,
  TradeMode,
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
  private symbolMap = new Map<string, string>(); // normalized_marketType -> original symbol mapping
  private orderbookDepthMap = new Map<string, number>(); // symbol_marketType -> depth
  private userWs?: BinanceWebsocket;
  private _messageDebugCount = 0;
  private leverageCache = new Map<string, number>(); // symbol -> leverage mapping
  private futuresPositionModeCache?: {
    mode: 'oneway' | 'hedge';
    fetchedAt: number;
  };

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

    // Add request interceptor for authentication on futures client
    this.futuresClient.interceptors.request.use((config) => {
      if (this.credentials) {
        return this.addAuthentication(config);
      }
      return config;
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
   * Check if a symbol represents a futures/perpetual market
   */
  private _isFuturesSymbol(symbol: string): boolean {
    const upper = symbol.toUpperCase();
    return (
      upper.includes(':') ||
      upper.includes('_PERP') ||
      upper.includes('_SWAP') ||
      // Common heuristic: USDT pairs without a slash are often futures in this system's context
      // but we should be careful. CreateOrder uses this too.
      (!symbol.includes('/') && upper.includes('USDT'))
    );
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
      symbol, // Use unified symbol format
      exchange: this.name, // Add exchange name
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
      symbol, // Use unified symbol format
      exchange: this.name, // Add exchange name
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
      symbol, // Use unified symbol format
      exchange: this.name, // Add exchange name
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
      symbol, // Use unified symbol format
      exchange: this.name, // Add exchange name
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
      isClosed: true, // REST API returns historical/closed klines
    }));
  }

  public async createOrder(
    symbol: string,
    side: OrderSide,
    type: OrderType,
    quantity: Decimal,
    price?: Decimal,
    timeInForce: TimeInForce = TimeInForce.GTC,
    clientOrderId?: string,
    options?: {
      tradeMode?: TradeMode;
      leverage?: number;
      positionSide?: 'LONG' | 'SHORT';
      reduceOnly?: boolean;
    },
  ): Promise<Order> {
    const normalizedSymbol = this.normalizeSymbol(symbol);

    // Determine if this is a futures order
    const isFutures =
      this._isFuturesSymbol(symbol) ||
      Boolean(options?.positionSide || options?.reduceOnly || options?.leverage);

    // Set leverage for futures if provided and different from current
    if (isFutures && options?.leverage) {
      const currentLeverage = this.leverageCache.get(normalizedSymbol);
      if (currentLeverage !== options.leverage) {
        await this.setLeverage(normalizedSymbol, options.leverage, options.tradeMode);
        this.leverageCache.set(normalizedSymbol, options.leverage);
      }
    }

    const params: any = {
      symbol: normalizedSymbol,
      side: side.toUpperCase(),
      type: this.normalizeBinanceOrderType(type),
      quantity: quantity.toString(),
      timestamp: Date.now(),
    };

    if (isFutures) {
      const mode = await this.getFuturesPositionMode();
      if (mode === 'hedge') {
        params.positionSide =
          options?.positionSide || (side === OrderSide.BUY ? 'LONG' : 'SHORT');
      }
      if (options?.reduceOnly) {
        params.reduceOnly = true;
      }
    }

    if (price) params.price = price.toString();
    if (type === OrderType.LIMIT) {
      params.timeInForce = timeInForce;
    } else if (timeInForce !== 'GTC') {
      params.timeInForce = timeInForce;
    }
    if (clientOrderId) params.newClientOrderId = clientOrderId;

    const signedParams = this.signRequest(params);
    const createOrderPath = isFutures ? '/fapi/v1/order' : '/api/v3/order';
    const httpClient = isFutures ? this.futuresClient : this.httpClient;
    console.log('[Binance] createOrder request', {
      pathname: createOrderPath,
      params: signedParams,
    });
    const response = await httpClient.post(createOrderPath, null, {
      params: signedParams,
    });

    return this.transformBinanceOrder(response.data, isFutures ? 'futures' : 'spot');
  }

  /**
   * Set leverage for futures trading
   * Binance requires setting leverage before placing orders
   */
  private async setLeverage(
    symbol: string,
    leverage: number,
    marginType?: TradeMode,
  ): Promise<void> {
    try {
      // First, set margin type if specified (isolated or cross)
      if (marginType && marginType !== 'cash') {
        await this.setMarginType(symbol, marginType);
      }

      // Set leverage
      const params = {
        symbol,
        leverage,
        timestamp: Date.now(),
      };

      const signedParams = this.signRequest(params);
      await this.futuresClient.post('/fapi/v1/leverage', null, {
        params: signedParams,
      });
    } catch (error: any) {
      // If error is "No need to change leverage" or similar, ignore it
      if (error.response?.data?.code === -4028 || error.response?.data?.code === -4046) {
        // Leverage already set, no action needed
      } else {
        console.error(`[Binance] Failed to set leverage for ${symbol}:`, error.message);
        throw error;
      }
    }
  }

  /**
   * Set margin type (ISOLATED or CROSSED) for futures trading
   */
  private async setMarginType(
    symbol: string,
    marginType: 'isolated' | 'cross',
  ): Promise<void> {
    try {
      const binanceMarginType = marginType === 'cross' ? 'CROSSED' : 'ISOLATED';
      const params = {
        symbol,
        marginType: binanceMarginType,
        timestamp: Date.now(),
      };

      const signedParams = this.signRequest(params);
      await this.futuresClient.post('/fapi/v1/marginType', null, {
        params: signedParams,
      });

      console.log(`[Binance] Set margin type for ${symbol}: ${marginType}`);
    } catch (error: any) {
      // If error is "No need to change margin type", ignore it
      if (error.response?.data?.code === -4046) {
        // Margin type already set, no action needed
      } else {
        console.warn(`[Binance] Failed to set margin type for ${symbol}:`, error.message);
        // Don't throw - margin type is optional
      }
    }
  }

  private async getFuturesPositionMode(): Promise<'oneway' | 'hedge'> {
    const cache = this.futuresPositionModeCache;
    if (cache && Date.now() - cache.fetchedAt < 30_000) {
      return cache.mode;
    }

    const params = { timestamp: Date.now() };
    const signedParams = this.signRequest(params);
    const response = await this.futuresClient.get('/fapi/v1/positionSide/dual', {
      params: signedParams,
    });
    const mode = response.data?.dualSidePosition ? 'hedge' : 'oneway';
    this.futuresPositionModeCache = { mode, fetchedAt: Date.now() };
    return mode;
  }

  public async cancelOrder(
    symbol: string,
    orderId: string,
    clientOrderId?: string,
  ): Promise<Order> {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const isFutures = this._isFuturesSymbol(symbol);
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
    const cancelOrderPath = isFutures ? '/fapi/v1/order' : '/api/v3/order';
    const httpClient = isFutures ? this.futuresClient : this.httpClient;
    console.log('[Binance] cancelOrder request', {
      pathname: cancelOrderPath,
      params: signedParams,
    });
    const response = await httpClient.delete(cancelOrderPath, {
      params: signedParams,
    });

    return this.transformBinanceOrder(response.data, isFutures ? 'futures' : 'spot');
  }

  public async getOrder(
    symbol: string,
    orderId: string,
    clientOrderId?: string,
  ): Promise<Order> {
    const isFutures = this._isFuturesSymbol(symbol);
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
    const path = isFutures ? '/fapi/v1/order' : '/api/v3/order';
    const httpClient = isFutures ? this.futuresClient : this.httpClient;

    const response = await httpClient.get(path, {
      params: signedParams,
    });

    return this.transformBinanceOrder(response.data, isFutures ? 'futures' : 'spot');
  }

  public async getOpenOrders(symbol?: string): Promise<Order[]> {
    const timestamp = Date.now();

    if (symbol) {
      const isFutures = this._isFuturesSymbol(symbol);
      const params: any = { symbol: this.normalizeSymbol(symbol), timestamp };
      const signedParams = this.signRequest(params);
      const path = isFutures ? '/fapi/v1/openOrders' : '/api/v3/openOrders';
      const httpClient = isFutures ? this.futuresClient : this.httpClient;

      const response = await httpClient.get(path, {
        params: signedParams,
      });

      return response.data.map((order: any) =>
        this.transformBinanceOrder(order, isFutures ? 'futures' : 'spot'),
      );
    }

    // If no symbol, fetch both spot and futures open orders as they use different endpoints
    const spotParams = this.signRequest({ timestamp });
    const futuresParams = this.signRequest({ timestamp });

    const [spotRes, futuresRes] = await Promise.allSettled([
      this.httpClient.get('/api/v3/openOrders', { params: spotParams }),
      this.futuresClient.get('/fapi/v1/openOrders', { params: futuresParams }),
    ]);

    const allOrders: Order[] = [];

    if (spotRes.status === 'fulfilled') {
      allOrders.push(
        ...spotRes.value.data.map((order: any) =>
          this.transformBinanceOrder(order, 'spot'),
        ),
      );
    }

    if (futuresRes.status === 'fulfilled') {
      allOrders.push(
        ...futuresRes.value.data.map((order: any) =>
          this.transformBinanceOrder(order, 'futures'),
        ),
      );
    }

    return allOrders;
  }

  public async getOrderHistory(symbol?: string, limit = 500): Promise<Order[]> {
    const timestamp = Date.now();

    if (symbol) {
      const isFutures = this._isFuturesSymbol(symbol);
      const params: any = {
        symbol: this.normalizeSymbol(symbol),
        timestamp,
        limit,
      };
      const signedParams = this.signRequest(params);
      const path = isFutures ? '/fapi/v1/allOrders' : '/api/v3/allOrders';
      const httpClient = isFutures ? this.futuresClient : this.httpClient;

      const response = await httpClient.get(path, {
        params: signedParams,
      });

      return response.data.map((order: any) =>
        this.transformBinanceOrder(order, isFutures ? 'futures' : 'spot'),
      );
    }

    // If no symbol, we can't easily fetch all history across all symbols for both platforms
    // in one go safely without hitting rate limits, but we'll default to spot context
    const params: any = { timestamp, limit };
    const signedParams = this.signRequest(params);
    const response = await this.httpClient.get('/api/v3/allOrders', {
      params: signedParams,
    });

    return response.data.map((order: any) => this.transformBinanceOrder(order, 'spot'));
  }

  public async getAccountInfo(): Promise<AccountInfo> {
    const timestamp = Date.now();
    const spotParams = this.signRequest({ timestamp });
    const futuresParams = this.signRequest({ timestamp });

    // Fetch Spot and Futures data in parallel
    const [spotRes, futuresRes] = await Promise.allSettled([
      this.httpClient.get('/api/v3/account', { params: spotParams }),
      this.futuresClient.get('/fapi/v2/account', { params: futuresParams }),
    ]);

    let balances: Balance[] = [];
    let canTrade = false;
    let canWithdraw = false;
    let canDeposit = false;
    let updateTime = new Date();

    // Process Spot Data
    if (spotRes.status === 'fulfilled') {
      const data = spotRes.value.data;
      balances = data.balances.map((balance: any) => ({
        asset: balance.asset,
        free: this.formatDecimal(balance.free),
        locked: this.formatDecimal(balance.locked),
        total: this.formatDecimal(balance.free).add(this.formatDecimal(balance.locked)),
      }));
      canTrade = data.canTrade;
      canWithdraw = data.canWithdraw;
      canDeposit = data.canDeposit;
      updateTime = this.formatTimestamp(data.updateTime);
    } else {
      console.warn('[Binance] Failed to fetch spot account info:', spotRes.reason);
    }

    // Process Futures Data
    if (futuresRes.status === 'fulfilled') {
      const data = futuresRes.value.data;
      const futuresAssets = data.assets || [];

      for (const asset of futuresAssets) {
        // Futures API returns 'walletBalance' (total) and 'availableBalance' (free)
        // We calculate 'locked' as walletBalance - availableBalance
        const total = this.formatDecimal(asset.walletBalance);
        const free = this.formatDecimal(asset.availableBalance);
        const locked = total.sub(free);

        const existing = balances.find((b) => b.asset === asset.asset);

        if (existing) {
          existing.free = existing.free.add(free);
          existing.locked = existing.locked.add(locked);
          existing.total = existing.total.add(total);
        } else {
          balances.push({
            asset: asset.asset,
            free,
            locked,
            total,
          });
        }
      }
    } else {
      console.warn('[Binance] Failed to fetch futures account info:', futuresRes.reason);
    }

    return {
      balances,
      canTrade, // Mostly from spot
      canWithdraw,
      canDeposit,
      updateTime,
    };
  }

  public async getBalances(): Promise<Balance[]> {
    const accountInfo = await this.getAccountInfo();
    return accountInfo.balances;
  }

  public async getPositions(): Promise<Position[]> {
    try {
      const params = this.signRequest({ timestamp: Date.now() });
      const response = await this.futuresClient.get('/fapi/v2/positionRisk', {
        params,
      });

      return (
        response.data
          // .filter((pos: any) => parseFloat(pos.positionAmt) !== 0) // Commented out to allow zero positions for deletion logic
          .map((pos: any) => {
            const quantity = new Decimal(pos.positionAmt);
            const unifiedSymbol = this.denormalizeSymbol(pos.symbol, 'futures');
            return {
              symbol: unifiedSymbol,
              side: quantity.isPositive() ? 'long' : 'short',
              quantity: quantity.abs(),
              avgPrice: this.formatDecimal(pos.entryPrice),
              markPrice: this.formatDecimal(pos.markPrice),
              unrealizedPnl: this.formatDecimal(pos.unRealizedProfit),
              leverage: parseInt(pos.leverage),
              timestamp: new Date(parseInt(pos.updateTime)),
            };
          })
      );
    } catch (error) {
      console.error('[Binance] Failed to fetch positions:', error);
      return [];
    }
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

  public async getSymbolInfo(symbol: string): Promise<SymbolInfo> {
    // Normalize symbol to Binance format
    const binanceSymbol = this.normalizeSymbol(symbol);

    // Fetch exchange info
    const response = await this.httpClient.get('/api/v3/exchangeInfo', {
      params: { symbol: binanceSymbol },
    });

    const symbolData = response.data.symbols?.[0];
    if (!symbolData) {
      throw new Error(`Symbol ${symbol} not found on Binance`);
    }

    // Extract precision and filters
    const baseAssetPrecision = symbolData.baseAssetPrecision || 8;
    const quotePrecision = symbolData.quotePrecision || 8;

    // Parse filters
    let minQuantity = new Decimal(0);
    let maxQuantity: Decimal | undefined;
    let minNotional = new Decimal(0);
    let stepSize = new Decimal(0);
    let tickSize = new Decimal(0);

    for (const filter of symbolData.filters || []) {
      switch (filter.filterType) {
        case 'LOT_SIZE':
          minQuantity = new Decimal(filter.minQty || 0);
          maxQuantity = filter.maxQty ? new Decimal(filter.maxQty) : undefined;
          stepSize = new Decimal(filter.stepSize || 0);
          break;
        case 'PRICE_FILTER':
          tickSize = new Decimal(filter.tickSize || 0);
          break;
        case 'MIN_NOTIONAL':
        case 'NOTIONAL':
          minNotional = new Decimal(filter.minNotional || filter.notional || 0);
          break;
      }
    }

    // Determine market type (spot by default)
    const market =
      binanceSymbol.includes('_PERP') || binanceSymbol.includes('_SWAP')
        ? 'futures'
        : 'spot';

    // Denormalize symbol back to unified format
    const unifiedSymbol = this.denormalizeSymbol(binanceSymbol, market);

    return {
      symbol: unifiedSymbol,
      nativeSymbol: binanceSymbol,
      baseAsset: symbolData.baseAsset,
      quoteAsset: symbolData.quoteAsset,
      pricePrecision: quotePrecision,
      quantityPrecision: baseAssetPrecision,
      minQuantity,
      maxQuantity,
      minNotional,
      stepSize,
      tickSize,
      status: this.mapBinanceStatus(symbolData.status),
      market,
    };
  }

  private mapBinanceStatus(
    status: string,
  ): 'active' | 'inactive' | 'pre_trading' | 'post_trading' {
    switch (status) {
      case 'TRADING':
        return 'active';
      case 'PRE_TRADING':
        return 'pre_trading';
      case 'POST_TRADING':
        return 'post_trading';
      case 'HALT':
      case 'BREAK':
      default:
        return 'inactive';
    }
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

    this.wsManager.on('data', (marketType: BinanceMarketType, message: any) => {
      this.handleWebSocketMessage(message, marketType);
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

  public async subscribeToOrderBook(symbol: string, depth?: number): Promise<void> {
    // Pass depth as extra parameter
    await this.subscribe('orderbook', symbol, depth);
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

    const normalized = this.normalizeSymbol(symbol).toLowerCase();
    const mapKey = `${normalized}_${marketType}`;

    // For orderbook, retrieve the stored depth to build correct stream name
    let depthOrInterval: number | string | undefined;
    if (type === 'orderbook') {
      depthOrInterval = this.orderbookDepthMap.get(mapKey);
    }

    // Build stream name (with depth for orderbook if available)
    const streamName = this.buildStreamName(type, symbol, depthOrInterval);

    // Unsubscribe via WebSocket Manager
    await this.wsManager.unsubscribe(marketType, type, symbol, streamName);

    // Remove symbol mapping and depth tracking
    this.symbolMap.delete(mapKey);
    if (type === 'orderbook') {
      this.orderbookDepthMap.delete(mapKey);
    }
  }

  private async subscribe(
    type: string,
    symbol: string,
    depthOrInterval?: number | string,
  ): Promise<void> {
    // Determine market type from symbol
    const marketType = this.wsManager.getMarketType(symbol);

    console.log(`[Binance] Subscribing to ${type}:${symbol} (${marketType})`);

    // Store normalized -> original symbol mapping for later lookup
    // For klines, strip the @interval part for mapping
    let baseSymbol = symbol;
    if (type === 'klines' && symbol.includes('@')) {
      baseSymbol = symbol.split('@')[0];
    }
    const normalized = this.normalizeSymbol(baseSymbol).toLowerCase();
    // Use market type in the key to avoid spot/futures collision
    const mapKey = `${normalized}_${marketType}`;
    this.symbolMap.set(mapKey, baseSymbol);

    // For orderbook, store the depth used
    if (type === 'orderbook' && typeof depthOrInterval === 'number') {
      this.orderbookDepthMap.set(mapKey, depthOrInterval);
    }

    // Build stream name (pass depth for orderbook)
    const streamName = this.buildStreamName(type, symbol, depthOrInterval);

    // Subscribe via WebSocket Manager
    await this.wsManager.subscribe(marketType, type, symbol, streamName);
  }

  /**
   * Build Binance stream name from type and symbol
   * @param depthOrInterval - For orderbook: depth (5, 10, 20); For klines: not used here
   */
  private buildStreamName(
    type: string,
    symbol: string,
    depthOrInterval?: number | string,
  ): string {
    const normalizedSymbol = this.normalizeSymbol(symbol);

    switch (type) {
      case 'ticker':
        return `${normalizedSymbol.toLowerCase()}@ticker`;
      case 'orderbook': {
        const depth = depthOrInterval as number | undefined;
        // Binance supports @depth (full), @depth5, @depth10, @depth20
        if (depth === 5 || depth === 10 || depth === 20) {
          return `${normalizedSymbol.toLowerCase()}@depth${depth}`;
        }
        // Default: full depth updates
        return `${normalizedSymbol.toLowerCase()}@depth`;
      }
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

  protected handleWebSocketMessage(message: any, marketType?: BinanceMarketType): void {
    // Handle market data messages (single stream format)
    if (message.e) {
      // Direct stream format (e.g., {"e":"trade","s":"BTCUSDT",...})
      const eventType = message.e;
      const symbol = message.s; // Normalized symbol from Binance
      const normalizedSymbol = symbol.toLowerCase();

      // Look up original symbol format using market type
      const mapKey = marketType ? `${normalizedSymbol}_${marketType}` : normalizedSymbol;
      let originalSymbol = this.symbolMap.get(mapKey) || symbol.toUpperCase();

      switch (eventType) {
        case '24hrTicker':
          this.emit(
            'ticker',
            originalSymbol,
            this.transformBinanceTicker(originalSymbol, message),
          );
          break;
        case 'depthUpdate':
        case 'depthSnapshot':
          // Handle both depthUpdate (from @depth) and depthSnapshot (from @depth5/10/20)
          this.emit(
            'orderbook',
            originalSymbol,
            this.transformBinanceOrderBook(message, originalSymbol),
          );
          break;
        case 'trade':
          this.emit(
            'trade',
            originalSymbol,
            this.transformBinanceTrade(message, originalSymbol),
          );
          break;
        case 'kline':
          this.emit(
            'kline',
            originalSymbol,
            this.transformBinanceKline(originalSymbol, message.k),
          );
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

  /**
   * Denormalize symbol from Binance format to unified format
   * Binance → Unified
   * @param symbol Binance symbol (e.g., BTCUSDT)
   * @param market Market type to determine format
   */
  protected denormalizeSymbol(symbol: string, market: 'spot' | 'futures'): string {
    const upper = symbol.toUpperCase();

    // For futures, convert to perpetual format
    if (market === 'futures') {
      // BTCUSDT → BTC/USDT:USDT
      // Common perpetual pairs end with USDT, USDC, USD, BUSD
      const commonQuotes = ['USDT', 'USDC', 'USD', 'BUSD', 'BTC', 'ETH'];
      for (const quote of commonQuotes) {
        if (upper.endsWith(quote)) {
          const base = upper.substring(0, upper.length - quote.length);
          return `${base}/${quote}:${quote}`;
        }
      }
    }

    // For spot, convert to spot format
    // BTCUSDT → BTC/USDT
    const commonQuotes = ['USDT', 'USDC', 'USD', 'BUSD', 'BTC', 'ETH', 'BNB'];
    for (const quote of commonQuotes) {
      if (upper.endsWith(quote)) {
        const base = upper.substring(0, upper.length - quote.length);
        return `${base}/${quote}`;
      }
    }

    // Fallback: return as is if can't parse
    return symbol;
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

    // Setup WebSocket for real-time updates
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

    // Fetch and emit initial account state
    // Note: Binance user data streams only push changes, not initial snapshots
    // So we need to fetch initial state via REST API
    try {
      // Get spot account balances
      const accountInfo = await this.getAccountInfo();
      if (accountInfo.balances.length > 0) {
        this.emit('accountUpdate', 'spot', accountInfo.balances);
      }

      // Get open orders
      try {
        const openOrders = await this.getOpenOrders();
        if (openOrders.length > 0) {
          // Emit each open order
          openOrders.forEach((order) => {
            this.emit('orderUpdate', order.symbol, order);
          });
        }
      } catch (error) {
        console.warn('[Binance] Failed to fetch open orders:', error);
      }

      // Get futures positions (if available)
      try {
        const positions = await this.getPositions();
        if (positions.length > 0) {
          this.emit('positionUpdate', 'futures', positions);
        }
      } catch {
        // Futures might not be enabled, ignore error
      }
    } catch (error) {
      console.warn('[Binance] Failed to fetch initial account state:', error);
    }
  }

  private normalizeBinanceOrderUpdate(data: any, market: 'spot' | 'futures'): Order {
    // Supports spot executionReport and futures ORDER_TRADE_UPDATE
    if (data.e === 'executionReport') {
      const nativeSymbol = data.s as string;
      // Denormalize: BTCUSDT → BTC/USDT or BTC/USDT:USDT
      const symbol = this.denormalizeSymbol(nativeSymbol, market);
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
      const nativeSymbol = o.s as string;
      // Denormalize: BTCUSDT → BTC/USDT:USDT (futures)
      const symbol = this.denormalizeSymbol(nativeSymbol, market);
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
    const nativeSymbol = (data.s || data.o?.s || '').toString();
    const symbol = nativeSymbol ? this.denormalizeSymbol(nativeSymbol, market) : '';
    return {
      id: uuidv4(),
      clientOrderId: undefined,
      symbol,
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
          // Denormalize symbol: BTCUSDT → BTC/USDT:USDT (futures perpetual)
          const unifiedSymbol = this.denormalizeSymbol(p.s, 'futures');
          const quantity = this.formatDecimal(p.pa || '0');
          // if (quantity.isZero()) continue; // Commented out to allow zero positions for deletion logic

          positions.push({
            symbol: unifiedSymbol,
            side: quantity.isPositive() ? 'long' : 'short',
            quantity: quantity.abs(),
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

  private transformBinanceOrder(order: any, market: 'spot' | 'futures' = 'spot'): Order {
    const status = this.transformBinanceOrderStatus(order.status);
    const symbol = this.denormalizeSymbol(order.symbol, market);

    return {
      id: order.orderId?.toString() || uuidv4(),
      clientOrderId: order.clientOrderId,
      symbol,
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

  private transformBinanceTicker(originalSymbol: string, data: any): Ticker {
    return {
      symbol: originalSymbol,
      exchange: this.name, // Add exchange name
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
    // Handle both formats:
    // - depthUpdate: { e: 'depthUpdate', b: [...], a: [...] }
    // - depthSnapshot: { e: 'depthSnapshot', bids: [...], asks: [...] }
    const bids = data.b || data.bids || [];
    const asks = data.a || data.asks || [];

    return {
      symbol: symbol.toUpperCase(),
      exchange: this.name, // Add exchange name
      timestamp: new Date(),
      bids: bids.map((bid: string[]) => [
        this.formatDecimal(bid[0]),
        this.formatDecimal(bid[1]),
      ]),
      asks: asks.map((ask: string[]) => [
        this.formatDecimal(ask[0]),
        this.formatDecimal(ask[1]),
      ]),
    };
  }

  private transformBinanceTrade(data: any, symbol: string): Trade {
    return {
      id: data.t.toString(),
      symbol: symbol.toUpperCase(),
      exchange: this.name, // Add exchange name
      price: this.formatDecimal(data.p),
      quantity: this.formatDecimal(data.q),
      side: data.m ? 'sell' : 'buy', // m indicates buyer is maker
      timestamp: this.formatTimestamp(data.T),
    };
  }

  private transformBinanceKline(originalSymbol: string, data: any): Kline {
    return {
      symbol: originalSymbol,
      exchange: this.name, // Add exchange name
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
      isClosed: data.x, // Binance field 'x' indicates if the kline is closed
    };
  }
}
