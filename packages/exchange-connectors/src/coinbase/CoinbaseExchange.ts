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
import { CoinbaseWebSocketManager } from './CoinbaseWebSocketManager';

import { generateToken } from './token';
/**
 * Coinbase Advanced Trade API connector (public + private + WS)
 * Docs (subject to change): public REST base https://api.coinbase.com
 * WS base: wss://advanced-trade-ws.coinbase.com
 * https://api.exchange.coinbase.com
 */
export class CoinbaseExchange extends BaseExchange {
  private publicHttpClient: AxiosInstance;
  private wsManager: CoinbaseWebSocketManager;
  private symbolMap = new Map<string, string>(); // Coinbase product_id -> original symbol mapping
  private positionSymbolMap = new Map<string, string>(); // position_id -> product_id mapping
  private lastUserDataSyncAt = 0; // throttle balance/position sync after user events
  private static readonly MAINNET_BASE_URL = 'https://api.coinbase.com';
  private static readonly PUBLIC_BASE_URL = 'https://api.exchange.coinbase.com';
  private static readonly MAINNET_WS_URL = 'wss://advanced-trade-ws.coinbase.com';

  constructor() {
    const envBase = process.env.COINBASE_BASE_URL;
    const useExchangeApi =
      (process.env.COINBASE_USE_EXCHANGE_API || 'false').toLowerCase() === 'true';
    const base =
      envBase ||
      (useExchangeApi
        ? 'https://api.exchange.coinbase.com'
        : CoinbaseExchange.MAINNET_BASE_URL);

    super('coinbase', base, CoinbaseExchange.MAINNET_WS_URL);
    this.publicHttpClient = axios.create({
      baseURL: CoinbaseExchange.PUBLIC_BASE_URL,
      timeout: 30000,
    });

    // Initialize WebSocket Manager
    this.wsManager = new CoinbaseWebSocketManager(CoinbaseExchange.MAINNET_WS_URL);
    this.setupWebSocketManagerListeners();
  }

  /**
   * Setup WebSocket Manager event listeners
   */
  private setupWebSocketManagerListeners(): void {
    this.wsManager.on('connected', () => {
      console.log('[Coinbase] WebSocket Manager connected');
    });

    this.wsManager.on('disconnected', (code: number) => {
      console.log(`[Coinbase] WebSocket Manager disconnected: ${code}`);
    });

    this.wsManager.on('error', (error: Error) => {
      console.error('[Coinbase] WebSocket Manager error:', error.message);
    });

    this.wsManager.on('data', (message: any) => {
      this.handleWebSocketMessage(message);
    });
  }

  /**
   * Generate JWT token for user data authentication
   */
  private generateJWT(): string {
    if (!this.credentials) {
      throw new Error('Coinbase credentials required for JWT generation');
    }

    // Generate JWT using the token utility
    const token = generateToken(
      'GET',
      '/',
      this.credentials.apiKey,
      this.credentials.secretKey,
    );

    return token;
  }

  protected async testConnection(): Promise<void> {
    try {
      // Test with a simple authenticated endpoint to verify credentials work
      const response = await this.httpClient.get('/api/v3/brokerage/accounts');
      if (!response.data) {
        throw new Error('Invalid response from Coinbase API');
      }
    } catch (error) {
      throw new Error(`Failed to connect to Coinbase: ${error}`);
    }
  }

  public async getTicker(symbol: string): Promise<Ticker> {
    const productId = this.normalizeSymbol(symbol);
    const resp = await this.publicHttpClient.get(
      // `/api/v3/brokerage/products/${productId}/ticker`
      `/products/${productId}/ticker`,
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
      },
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
      },
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
    limit = 300,
  ): Promise<Kline[]> {
    const productId = this.normalizeSymbol(symbol);
    const granularity = this.mapIntervalToGranularity(interval);
    const params: any = { granularity, limit }; // start/end iso8601 supported
    if (startTime) params.start = startTime.toISOString();
    if (endTime) params.end = endTime.toISOString();
    const resp = await this.httpClient.get(
      `/api/v3/brokerage/products/${productId}/candles`,
      { params },
    );
    const data = resp.data?.candles || resp.data || [];
    return data.map((c: any) => ({
      symbol: productId,
      interval,
      openTime: new Date(c.start || c.start_time || c.t || Date.now()),
      closeTime: new Date(c.start || c.start_time || c.t || Date.now()),
      open: this.formatDecimal(c.open || c.o),
      high: this.formatDecimal(c.high || c.h),
      low: this.formatDecimal(c.low || c.l),
      close: this.formatDecimal(c.close || c.c),
      volume: this.formatDecimal(c.volume || c.v || '0'),
      quoteVolume: this.formatDecimal(c.quote_volume || '0'),
      trades: c.num_trades || 0,
      isClosed: true, // Historical klines from REST API are always closed
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
    },
  ): Promise<Order> {
    const productId = this.normalizeSymbol(symbol);

    // Detect if this is a perpetual futures order
    // Coinbase perpetuals: product_type=FUTURE with contract_expiry_type=PERPETUAL
    const isPerpetual = productId.includes('-PERP') || symbol.includes(':');

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

    // Add leverage for perpetual futures (up to 10x)
    if (isPerpetual && options?.leverage) {
      body.leverage = options.leverage.toString();
      console.log(
        `[Coinbase] Setting leverage ${options.leverage}x for perpetual ${productId}`,
      );
    }

    // Add margin type if specified (for perpetual futures)
    if (isPerpetual && options?.tradeMode && options.tradeMode !== 'cash') {
      body.margin_type = options.tradeMode.toUpperCase(); // ISOLATED or CROSS
    }

    const resp = await this.httpClient.post('/api/v3/brokerage/orders', body);
    return this.transformOrder(
      resp.data?.success_response?.order || resp.data?.order || body,
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
      `/api/v3/brokerage/orders/historical/${orderId}`,
    );
    const order = resp.data?.orders ? resp.data.orders[0] : resp.data?.order || resp.data;
    return this.transformOrder(order);
  }

  public async getOpenOrders(_symbol?: string): Promise<Order[]> {
    const params: any = { order_status: 'OPEN' };
    const resp = await this.httpClient.get('/api/v3/brokerage/orders/historical/batch', {
      params,
    });
    const orders = resp.data?.orders || [];
    return orders.map((o: any) => this.transformOrder(o));
  }

  public async getOrderHistory(_symbol?: string, limit = 100): Promise<Order[]> {
    const params: any = { limit, order_status: 'FILLED' };
    const resp = await this.httpClient.get('/api/v3/brokerage/orders/historical/batch', {
      params,
    });
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
    // Get spot account balances
    const info = await this.getAccountInfo();
    const spotBalances = info.balances;

    // Get INTX perpetual account balances
    const perpetualBalances = await this.getIntxBalances();

    // Combine both
    return [...spotBalances, ...perpetualBalances];
  }

  /**
   * Get Coinbase International Exchange (INTX) perpetual account balances
   */
  private async getIntxBalances(): Promise<Balance[]> {
    try {
      // Step 1: Get all accounts to find perpetual portfolio
      const accountsResp = await this.httpClient.get('/api/v3/brokerage/accounts');
      const accounts = accountsResp.data?.accounts || [];

      // Find perpetual/INTX accounts
      const perpetualAccounts = accounts.filter((account: any) => {
        return (
          account.portfolio_uuid ||
          account.retail_portfolio_id ||
          account.platform === 'ACCOUNT_PLATFORM_INTX' ||
          account.type?.includes('INTX') ||
          account.name?.includes('INTX') ||
          account.name?.includes('Perpetual')
        );
      });

      console.log(`[Coinbase] Found ${perpetualAccounts.length} INTX accounts`);

      if (perpetualAccounts.length === 0) {
        return [];
      }

      const balances: Balance[] = [];

      // Step 2: Get balances for each perpetual portfolio
      for (const account of perpetualAccounts) {
        const portfolioUuid = account.portfolio_uuid || account.retail_portfolio_id;
        if (!portfolioUuid) continue;

        console.log(`[Coinbase] Fetching INTX portfolio: ${portfolioUuid}`);

        try {
          // Try portfolio summary endpoint
          const portfolioResp = await this.httpClient.get(
            `/api/v3/brokerage/intx/portfolio/${portfolioUuid}`,
          );

          console.log(
            '[Coinbase] INTX Portfolio response:',
            JSON.stringify(portfolioResp.data),
          );

          // Response structure: { portfolios: [ {...}, {...} ] }
          const portfolios = portfolioResp.data?.portfolios || [];

          for (const portfolio of portfolios) {
            // Extract balance information from Coinbase INTX format
            const collateral = portfolio.collateral || '0'; // Total collateral (available balance)
            const positionNotional = portfolio.position_notional || '0'; // Used in positions
            const unrealizedPnl = portfolio.unrealized_pnl?.value || '0';

            // Total = collateral + position value + unrealized PnL
            const total = parseFloat(collateral) + parseFloat(positionNotional);

            balances.push({
              asset: 'USDC', // INTX uses USDC
              free: this.formatDecimal(collateral),
              locked: this.formatDecimal(positionNotional),
              total: this.formatDecimal(total.toString()),
            });

            console.log(
              `[Coinbase] 💰 INTX Portfolio ${portfolio.portfolio_uuid}: Collateral=${collateral}, Position=${positionNotional}, Total=${total}, UnrealizedPnL=${unrealizedPnl}`,
            );
          }
        } catch (error: any) {
          console.warn(
            `[Coinbase] Failed to fetch INTX portfolio ${portfolioUuid}:`,
            error.response?.data || error.message,
          );
        }
      }

      return balances;
    } catch (error: any) {
      console.warn(
        '[Coinbase] Failed to fetch INTX balances:',
        error.response?.data || error.message,
      );
      return [];
    }
  }

  public async getPositions(): Promise<Position[]> {
    try {
      // Step 1: Get all accounts to find perpetual portfolio IDs
      const accountsResp = await this.httpClient.get('/api/v3/brokerage/accounts');
      const accounts = accountsResp.data?.accounts || [];

      // Find perpetual accounts - they might have different structures
      const perpetualAccounts = accounts.filter((account: any) => {
        // Check multiple possible indicators for perpetual accounts
        return (
          account.portfolio_uuid ||
          account.retail_portfolio_id ||
          account.platform === 'ACCOUNT_PLATFORM_INTX' ||
          account.type?.includes('INTX') ||
          account.name?.includes('INTX') ||
          account.name?.includes('Perpetual') ||
          account.name?.includes('Futures')
        );
      });

      console.log(
        `[Coinbase Debug] Found ${perpetualAccounts.length} potential perpetual accounts:`,
        perpetualAccounts.map((acc: any) => ({
          uuid: acc.uuid,
          name: acc.name,
          type: acc.type,
          portfolio_uuid: acc.portfolio_uuid,
          retail_portfolio_id: acc.retail_portfolio_id,
          platform: acc.platform,
          available_balance: acc.available_balance,
        })),
      );

      if (perpetualAccounts.length === 0) {
        // No perpetual accounts found - this is normal for spot-only accounts
        return [];
      }

      const positions: Position[] = [];

      // Step 2: Get positions for each perpetual portfolio
      for (const account of perpetualAccounts) {
        const portfolioUuid = account.portfolio_uuid || account.retail_portfolio_id;
        if (!portfolioUuid) continue;

        try {
          const positionsResp = await this.httpClient.get(
            `/api/v3/brokerage/intx/positions/${portfolioUuid}`,
          );
          const portfolioPositions = positionsResp.data?.positions || [];

          for (const pos of portfolioPositions) {
            // Debug: log raw position data
            console.log('[Coinbase] Raw position data:', JSON.stringify(pos, null, 2));

            if (!pos.symbol || !pos.net_size) {
              console.warn('[Coinbase] Position missing symbol or net_size:', pos);
              continue;
            }

            // Coinbase position structure:
            // - product_id: internal position ID (e.g., "1s6uej26-0-1")
            // - symbol: actual product symbol (e.g., "OP-PERP-INTX")
            const productSymbol = pos.symbol; // Use 'symbol' field, not 'product_id'!
            const positionId = pos.product_id; // This is actually the position ID

            // Build position_id -> product_symbol mapping for WebSocket handling
            if (positionId && productSymbol) {
              this.positionSymbolMap.set(positionId, productSymbol);
              console.log(
                `[Coinbase] Mapping position_id ${positionId} -> symbol ${productSymbol}`,
              );
            }

            // Handle different data formats - some fields might be objects with 'value' property
            const getDecimalValue = (field: any): string => {
              if (typeof field === 'string') return field;
              if (typeof field === 'number') return field.toString();
              if (field && typeof field === 'object' && field.value) return field.value;
              return '0';
            };

            const size = this.formatDecimal(getDecimalValue(pos.net_size));
            if (size.isZero()) continue; // Skip zero positions

            // Denormalize symbol from Coinbase format to unified format
            // OP-PERP-INTX -> OP/USDC:USDC
            const unifiedSymbol = this.denormalizeSymbol(productSymbol);

            positions.push({
              symbol: unifiedSymbol,
              side: size.isPositive() ? 'long' : 'short',
              quantity: size.abs(),
              avgPrice: pos.avg_entry_price
                ? this.formatDecimal(getDecimalValue(pos.avg_entry_price))
                : this.formatDecimal('0'),
              markPrice: pos.mark_price
                ? this.formatDecimal(getDecimalValue(pos.mark_price))
                : this.formatDecimal('0'),
              unrealizedPnl: pos.unrealized_pnl
                ? this.formatDecimal(getDecimalValue(pos.unrealized_pnl))
                : this.formatDecimal('0'),
              leverage: pos.leverage
                ? this.formatDecimal(getDecimalValue(pos.leverage))
                : this.formatDecimal('1'),
              timestamp: new Date(),
            });
          }
        } catch (error: any) {
          // If 404 for this specific portfolio, it might not have positions
          if (error.response?.status === 404) {
            continue; // This portfolio has no positions
          }
          // For other errors, log and continue
          console.warn(
            `Failed to fetch positions for portfolio ${portfolioUuid}:`,
            error.message,
          );
        }
      }

      return positions;
    } catch (error: any) {
      // If we can't get accounts at all, return empty array
      console.warn('Failed to fetch accounts for positions:', error.message);
      return [];
    }
  }

  public async getExchangeInfo(): Promise<ExchangeInfo> {
    const resp = await this.httpClient.get('/api/v3/brokerage/products');
    const products = resp.data?.products || resp.data || [];
    const symbols = products.map((p: any) => p.product_id || p.id).filter(Boolean);
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

  public async getSymbolInfo(symbol: string): Promise<SymbolInfo> {
    // Normalize symbol to Coinbase format
    const coinbaseSymbol = this.normalizeSymbol(symbol);

    // Fetch product info
    const response = await this.httpClient.get(
      `/api/v3/brokerage/products/${coinbaseSymbol}`,
    );

    const product = response.data;
    if (!product) {
      throw new Error(`Symbol ${symbol} not found on Coinbase`);
    }

    // Extract precision from quote/base increment
    const baseIncrement = product.base_increment || '0.01';
    const quoteIncrement = product.quote_increment || '0.01';

    const quantityPrecision = this.calculatePrecision(baseIncrement);
    const pricePrecision = this.calculatePrecision(quoteIncrement);

    // Parse min/max values
    const minQuantity = new Decimal(product.base_min_size || '0');
    const maxQuantity = product.base_max_size
      ? new Decimal(product.base_max_size)
      : undefined;
    const minNotional = new Decimal(product.quote_min_size || '0');
    const stepSize = new Decimal(baseIncrement);
    const tickSize = new Decimal(quoteIncrement);

    // Determine market type
    const market = coinbaseSymbol.includes('-PERP-INTX') ? 'swap' : 'spot';

    // Denormalize symbol back to unified format
    const unifiedSymbol = this.denormalizeSymbol(coinbaseSymbol);

    // Extract base and quote currency
    const baseAsset = product.base_currency_id || product.base_name || '';
    const quoteAsset = product.quote_currency_id || product.quote_name || '';

    return {
      symbol: unifiedSymbol,
      nativeSymbol: coinbaseSymbol,
      baseAsset,
      quoteAsset,
      pricePrecision,
      quantityPrecision,
      minQuantity,
      maxQuantity,
      minNotional,
      stepSize,
      tickSize,
      status: this.mapCoinbaseStatus(product.status),
      market,
    };
  }

  private calculatePrecision(sizeString: string): number {
    // Calculate decimal places from a string like "0.01" -> 2, "0.001" -> 3
    const parts = sizeString.split('.');
    if (parts.length === 1) return 0;
    return parts[1].length;
  }

  private mapCoinbaseStatus(
    status: string,
  ): 'active' | 'inactive' | 'pre_trading' | 'post_trading' {
    switch (status?.toUpperCase()) {
      case 'ONLINE':
        return 'active';
      case 'OFFLINE':
        return 'inactive';
      default:
        return 'inactive';
    }
  }

  /**
   * Build WebSocket URL (for compatibility)
   */
  protected buildWebSocketUrl(): string {
    console.log('[Coinbase] Using WebSocket Manager for connections');
    return this.wsBaseUrl;
  }

  /**
   * Legacy method - now handled by WebSocket Manager
   */
  protected async sendWebSocketSubscription(_type: string, _key: string): Promise<void> {
    console.log('[Coinbase] WebSocket subscriptions managed by CoinbaseWebSocketManager');
  }

  protected handleWebSocketMessage(msg: any): void {
    const channel = msg.channel || msg.type;

    // Debug: Log full message for user-related channels
    if (channel === 'user' || channel === 'futures_balance_summary') {
      console.log(
        `[Coinbase DEBUG] Full ${channel} message:`,
        JSON.stringify(msg, null, 2),
      );
    }
    if (!channel) return;

    switch (channel) {
      case 'ticker':
        if (msg.events) {
          for (const e of msg.events) {
            for (const t of e.tickers || []) {
              const originalSymbol = this.symbolMap.get(t.product_id) || t.product_id;
              this.emit('ticker', originalSymbol, {
                symbol: originalSymbol,
                price: this.formatDecimal(t.price || t.best_ask || '0'),
                volume: this.formatDecimal(t.volume_24_h || t.volume_24h || '0'),
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
              const originalSymbol = this.symbolMap.get(ob.product_id) || ob.product_id;
              const bids = (ob.bids || []).map((b: any) => [
                this.formatDecimal(b.price_level || b[0] || '0'),
                this.formatDecimal(b.new_quantity || b[1] || '0'),
              ]);
              const asks = (ob.asks || []).map((a: any) => [
                this.formatDecimal(a.price_level || a[0] || '0'),
                this.formatDecimal(a.new_quantity || a[1] || '0'),
              ]);
              this.emit('orderbook', originalSymbol, {
                symbol: originalSymbol,
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
              const originalSymbol = this.symbolMap.get(tr.product_id) || tr.product_id;
              this.emit('trade', originalSymbol, {
                id: tr.trade_id?.toString() || uuidv4(),
                symbol: originalSymbol,
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
              const originalSymbol = this.symbolMap.get(c.product_id) || c.product_id;
              const closeTime = new Date(
                new Date(c.start).getTime() + (c.granularity || 60) * 1000,
              );
              // Coinbase doesn't have explicit isClosed field, so we determine it by comparing with current time
              // If current time is past the expected close time, the candle is closed
              const now = Date.now();
              const isClosed = now >= closeTime.getTime();

              this.emit('kline', originalSymbol, {
                symbol: originalSymbol,
                interval: c.granularity?.toString() || '',
                openTime: new Date(c.start),
                closeTime: closeTime,
                open: this.formatDecimal(c.open),
                high: this.formatDecimal(c.high),
                low: this.formatDecimal(c.low),
                close: this.formatDecimal(c.close),
                volume: this.formatDecimal(c.volume || '0'),
                quoteVolume: this.formatDecimal('0'),
                trades: 0,
                isClosed: isClosed, // Determined by comparing current time with close time
              } as Kline);
            }
          }
        }
        break;
      case 'futures_balance_summary':
        // Handle futures balance summary
        console.log('[Coinbase] Received futures_balance_summary message');
        if (msg.events) {
          for (const e of msg.events) {
            console.log('[Coinbase] Futures event keys:', Object.keys(e));

            // Handle FCM balance summary
            if (e.fcm_balance_summary) {
              console.log(
                `[Coinbase] Processing fcm_balance_summary:`,
                e.fcm_balance_summary,
              );

              // Convert FCM balance to iTrade Balance format
              const summary = e.fcm_balance_summary;
              const balances: Balance[] = [];

              // Create USD balance entry from available margin
              // Always push balance even if 0 to show the account state
              const totalUsd = parseFloat(summary.total_usd_balance || '0');
              const availableMargin = parseFloat(summary.available_margin || '0');
              const lockedMargin = totalUsd - availableMargin;

              balances.push({
                asset: 'USD',
                free: this.formatDecimal(availableMargin.toString()),
                locked: this.formatDecimal(lockedMargin.toString()),
                total: this.formatDecimal(totalUsd.toString()),
              });

              console.log(
                `[Coinbase] 💰 Futures Balance Update: ${balances.length} balances (Total: ${totalUsd} USD)`,
              );
              this.emit('accountUpdate', 'coinbase', balances);
            }
          }
        }
        break;
      case 'user':
        // Handle user data (orders, balances, positions)
        if (msg.events) {
          for (const e of msg.events) {
            // Log full event structure for debugging
            console.log(
              '[Coinbase] User event keys:',
              Object.keys(e),
              'event type:',
              e.type,
            );

            // Handle orders
            if (e.orders && e.orders.length > 0) {
              console.log(`[Coinbase] Processing ${e.orders.length} order updates`);
              for (const orderData of e.orders) {
                const order = this.transformCoinbaseUserOrder(orderData);
                console.log(
                  `[Coinbase] 📦 Order Update: ${order.symbol} - ${order.status}`,
                );
                this.emit('orderUpdate', order.symbol, order);
              }
            }

            // Handle balances (if pushed via WebSocket)
            if (e.balances && e.balances.length > 0) {
              console.log(`[Coinbase] Processing ${e.balances.length} balance updates`);
              const balances = this.transformBalances(e.balances);
              if (balances.length > 0) {
                console.log(`[Coinbase] 💰 Balance Update: ${balances.length} balances`);
                this.emit('accountUpdate', 'coinbase', balances);
              }
            }

            // Handle positions (if pushed via WebSocket)
            if (e.positions) {
              console.log(`[Coinbase] Processing position updates`);
              const allPositions: any[] = [];

              // Coinbase positions structure:
              // { perpetual_futures_positions: [], expiring_futures_positions: [] }
              if (e.positions.perpetual_futures_positions) {
                allPositions.push(...e.positions.perpetual_futures_positions);
              }
              if (e.positions.expiring_futures_positions) {
                allPositions.push(...e.positions.expiring_futures_positions);
              }

              if (allPositions.length > 0) {
                const positions = this.transformCoinbasePositions(allPositions);
                if (positions.length > 0) {
                  console.log(
                    `[Coinbase] 📊 Position Update: ${positions.length} positions`,
                  );
                  this.emit('positionUpdate', 'coinbase', positions);
                }
              } else {
                console.log(`[Coinbase] No open positions`);
              }
            }

            // Handle account snapshot (if available)
            if (e.account) {
              console.log('[Coinbase] Processing account snapshot');
              // Account snapshot may contain balances and positions
              if (e.account.balances) {
                const balances = this.transformBalances(e.account.balances);
                if (balances.length > 0) {
                  console.log(
                    `[Coinbase] 💰 Account Snapshot Balances: ${balances.length}`,
                  );
                  this.emit('accountUpdate', 'coinbase', balances);
                }
              }
              if (e.account.positions) {
                const positions = this.transformPositions(e.account.positions);
                if (positions.length > 0) {
                  console.log(
                    `[Coinbase] 📊 Account Snapshot Positions: ${positions.length}`,
                  );
                  this.emit('positionUpdate', 'coinbase', positions);
                }
              }
            }

            // If no balance/position data in WebSocket, fall back to REST API
            // Only refresh if we received orders but no balance/position data
            if (e.orders && !e.balances && !e.positions && !e.account) {
              // Throttled balance/position refresh after order events
              const now = Date.now();
              if (now - this.lastUserDataSyncAt > 1000) {
                this.lastUserDataSyncAt = now;
                console.log(
                  '[Coinbase] No balance/position in WebSocket, fetching via REST API',
                );
                // Fire and forget; errors are logged but don't crash handler
                this.refreshBalancesAndPositions().catch((err) =>
                  console.warn(
                    '[Coinbase] Failed to refresh balances/positions:',
                    err?.message || err,
                  ),
                );
              }
            }
          }
        }
        break;
      default:
        break;
    }
  }

  /**
   * Subscribe to ticker updates
   */
  public async subscribeToTicker(symbol: string): Promise<void> {
    const productId = this.normalizeSymbol(symbol);
    this.symbolMap.set(productId, symbol); // Store mapping
    console.log(`[Coinbase] Subscribing to ticker: ${productId}`);
    this.wsManager.subscribe('ticker', [productId]);
  }

  /**
   * Subscribe to order book updates
   * @param depth - Not used for Coinbase (level2 channel provides full order book)
   * Note: Coinbase's level2 channel does not support configurable depth levels.
   * It always provides the full order book snapshot and updates.
   */
  public async subscribeToOrderBook(symbol: string, depth?: number): Promise<void> {
    const productId = this.normalizeSymbol(symbol);
    this.symbolMap.set(productId, symbol); // Store mapping
    console.log(
      `[Coinbase] Subscribing to orderbook: ${productId}${depth ? ` (depth=${depth} - not configurable, using full book)` : ''}`,
    );
    this.wsManager.subscribe('level2', [productId]);
  }

  /**
   * Subscribe to trades
   */
  public async subscribeToTrades(symbol: string): Promise<void> {
    const productId = this.normalizeSymbol(symbol);
    this.symbolMap.set(productId, symbol); // Store mapping
    console.log(`[Coinbase] Subscribing to trades: ${productId}`);
    this.wsManager.subscribe('market_trades', [productId]);
  }

  /**
   * Subscribe to klines/candles
   */
  public async subscribeToKlines(symbol: string, interval: string): Promise<void> {
    const productId = this.normalizeSymbol(symbol);
    this.symbolMap.set(productId, symbol); // Store mapping
    const granularity = this.mapIntervalToGranularity(interval);
    console.log(`[Coinbase] Subscribing to klines: ${productId} @ ${interval}`);
    this.wsManager.subscribe('candles', [productId], { granularity });
  }

  /**
   * Unsubscribe from a data type
   */
  public async unsubscribe(
    symbol: string,
    type: 'ticker' | 'orderbook' | 'trades' | 'klines',
  ): Promise<void> {
    const productId = this.normalizeSymbol(symbol);
    const channelMap = {
      ticker: 'ticker',
      orderbook: 'level2',
      trades: 'market_trades',
      klines: 'candles',
    };
    const channel = channelMap[type];
    console.log(`[Coinbase] Unsubscribing from ${type}: ${productId}`);
    this.wsManager.unsubscribe(channel, [productId]);
  }

  /**
   * Subscribe to user data streams (orders, balances)
   */
  public async subscribeToUserData(): Promise<void> {
    if (!this.credentials) {
      throw new Error('Coinbase credentials required for user data subscription');
    }

    console.log('[Coinbase] Subscribing to user data streams...');

    // Set JWT generator callback
    this.wsManager.setJWTGenerator(() => this.generateJWT());

    // Subscribe to user channel
    // Coinbase Advanced Trade API: user channel provides order updates
    // Try empty array first, as '*' may not be valid
    console.log('[Coinbase] Attempting user channel subscription...');
    this.wsManager.subscribe('user', []);

    // Try subscribing to futures_balance_summary for position/balance updates
    // This channel may provide real-time balance and position data
    console.log('[Coinbase] Attempting futures_balance_summary channel subscription...');
    try {
      this.wsManager.subscribe('futures_balance_summary', []);
    } catch (err) {
      console.warn(
        '[Coinbase] futures_balance_summary subscription failed (may not be available):',
        (err as any)?.message || err,
      );
    }

    console.log('[Coinbase] User data subscription requests sent');

    // Coinbase doesn't push balance/position via WebSocket
    // Fetch initial data immediately after subscription
    console.log('[Coinbase] Fetching initial balance and position data...');
    await this.refreshBalancesAndPositions();
    console.log('[Coinbase] ✅ Initial account data loaded');
  }

  /**
   * Disconnect and cleanup
   */
  public async disconnect(): Promise<void> {
    console.log('[Coinbase] Disconnecting...');
    this.wsManager.closeConnection();
    await super.disconnect();
  }

  /**
   * Transform Coinbase user order data to iTrade Order format
   */
  private transformCoinbaseUserOrder(orderData: any): Order {
    // Denormalize symbol: BTC-USDC → BTC/USDC, BTC-PERP-INTX → BTC/USDC:USDC
    const productId = orderData.product_id || 'UNKNOWN';
    const symbol =
      productId !== 'UNKNOWN' ? this.denormalizeSymbol(productId) : productId;

    const order: Order = {
      id: orderData.order_id || orderData.id || uuidv4(),
      clientOrderId: orderData.client_order_id,
      symbol,
      side:
        (orderData.side?.toUpperCase() || 'BUY') === 'BUY'
          ? OrderSide.BUY
          : OrderSide.SELL,
      type: this.transformOrderType(orderData.order_type || orderData.type || 'LIMIT'),
      quantity: this.formatDecimal(orderData.size || orderData.base_size || '0'),
      price: orderData.price ? this.formatDecimal(orderData.price) : undefined,
      status: this.transformOrderStatus(orderData.status || 'NEW'),
      timeInForce: (orderData.time_in_force as TimeInForce) || TimeInForce.GTC,
      timestamp: orderData.created_at ? new Date(orderData.created_at) : new Date(),
      updateTime: orderData.updated_at ? new Date(orderData.updated_at) : undefined,
      executedQuantity: orderData.filled_size
        ? this.formatDecimal(orderData.filled_size)
        : undefined,
      cummulativeQuoteQuantity: orderData.filled_value
        ? this.formatDecimal(orderData.filled_value)
        : undefined,
      fills: undefined,
    };

    return order;
  }

  /**
   * Transform Coinbase balance data to iTrade Balance format
   */
  private transformBalances(balanceData: any[]): Balance[] {
    if (!Array.isArray(balanceData)) {
      console.warn('[Coinbase] transformBalances: input is not an array');
      return [];
    }

    return balanceData
      .map((b: any) => {
        try {
          const asset = b.currency || b.asset || b.symbol || 'UNKNOWN';
          const available = b.available_balance?.value || b.available || b.free || '0';
          const hold = b.hold?.value || b.hold || b.locked || '0';
          const free = this.formatDecimal(available);
          const locked = this.formatDecimal(hold);

          return {
            asset,
            free,
            locked,
            total: free.add(locked),
          };
        } catch (err) {
          console.warn(
            '[Coinbase] Failed to transform balance:',
            (err as any)?.message || err,
          );
          return null;
        }
      })
      .filter((b): b is Balance => b !== null);
  }

  /**
   * Transform Coinbase position data to iTrade Position format
   */
  /**
   * Transform Coinbase-specific position format from WebSocket user channel
   * Handles both perpetual_futures_positions and expiring_futures_positions
   */
  private transformCoinbasePositions(positionData: any[]): Position[] {
    if (!Array.isArray(positionData)) {
      console.warn('[Coinbase] transformCoinbasePositions: input is not an array');
      return [];
    }

    return positionData
      .map((p: any) => {
        try {
          // Coinbase position structure:
          // REST API and WebSocket may use different field names:
          // REST: { product_id: "position-id", symbol: "OP-PERP-INTX", ... }
          // WS:   { position_id: "position-id", symbol: "position-id" or product_symbol, ... }

          // Priority:
          // 1. If p.symbol looks like a valid product (contains PERP/INTX), use it
          // 2. Otherwise, try to map from position_id using positionSymbolMap
          // 3. Fall back to p.product_id if available

          let productSymbol: string | undefined;

          // Check if symbol field contains actual product symbol (e.g., "OP-PERP-INTX")
          if (p.symbol && (p.symbol.includes('PERP') || p.symbol.includes('-'))) {
            productSymbol = p.symbol;
          } else {
            // Try to resolve via mapping
            const positionId = p.position_id || p.product_id || p.symbol;
            if (positionId) {
              const mapped = this.positionSymbolMap.get(positionId);
              if (mapped) {
                productSymbol = mapped;
                console.log(
                  `[Coinbase] Resolved position_id ${positionId} -> symbol ${productSymbol}`,
                );
              } else {
                // Try using product_id as fallback
                productSymbol = p.product_id || p.symbol;
                console.warn(
                  `[Coinbase] No mapping for position ${positionId}, using fallback: ${productSymbol}`,
                );
              }
            }
          }

          if (!productSymbol || productSymbol === 'UNKNOWN') {
            console.warn('[Coinbase] Position missing valid symbol, skipping:', p);
            return null;
          }

          // Denormalize symbol from Coinbase format to unified format
          // OP-PERP-INTX -> OP/USDC:USDC
          const symbol = this.denormalizeSymbol(productSymbol);

          const side =
            (p.position_side || p.side || 'LONG').toUpperCase() === 'LONG'
              ? 'long'
              : 'short';

          const quantity = this.formatDecimal(p.net_size || p.number_of_contracts || '0');
          const entryPrice = this.formatDecimal(p.entry_vwap || p.vwap || '0');
          const markPrice = p.mark_price ? this.formatDecimal(p.mark_price) : entryPrice;
          const unrealizedPnl = p.unrealized_pnl
            ? this.formatDecimal(p.unrealized_pnl)
            : new Decimal(0);

          return {
            symbol,
            side,
            quantity,
            entryPrice,
            avgPrice: entryPrice,
            markPrice,
            liquidationPrice: p.liquidation_price
              ? this.formatDecimal(p.liquidation_price)
              : undefined,
            leverage: p.leverage ? new Decimal(p.leverage) : new Decimal(1),
            unrealizedPnl,
            marginType: 'cross', // Coinbase International Exchange uses cross margin
            timestamp: new Date(p.timestamp || Date.now()),
            updateTime: new Date(p.timestamp || Date.now()),
          } as Position;
        } catch (err) {
          console.warn(
            '[Coinbase] Failed to transform position:',
            (err as any)?.message || err,
          );
          return null;
        }
      })
      .filter((p): p is Position => p !== null);
  }

  /**
   * Legacy transform method for REST API positions (if needed)
   */
  private transformPositions(positionData: any[]): Position[] {
    if (!Array.isArray(positionData)) {
      console.warn('[Coinbase] transformPositions: input is not an array');
      return [];
    }

    return positionData
      .map((p: any) => {
        try {
          const productId = p.product_id || p.symbol || 'UNKNOWN';
          const symbol = this.denormalizeSymbol(productId);
          const side = (p.side || 'LONG').toUpperCase();
          const quantity = this.formatDecimal(p.number_of_contracts || p.size || '0');
          const entryPrice = this.formatDecimal(p.entry_price || p.entry_vwap || '0');
          const unrealizedPnl = p.unrealized_pnl
            ? this.formatDecimal(p.unrealized_pnl)
            : new Decimal(0);

          return {
            symbol,
            side: side === 'LONG' ? 'long' : 'short',
            quantity,
            entryPrice,
            avgPrice: entryPrice, // Use entry price as average price
            markPrice: p.mark_price ? this.formatDecimal(p.mark_price) : entryPrice,
            liquidationPrice: p.liquidation_price
              ? this.formatDecimal(p.liquidation_price)
              : undefined,
            leverage: p.leverage ? new Decimal(p.leverage) : new Decimal(1),
            unrealizedPnl,
            marginType: p.margin_type || 'cross',
            timestamp: new Date(p.timestamp || Date.now()),
            updateTime: new Date(p.timestamp || Date.now()),
          } as Position;
        } catch (err) {
          console.warn(
            '[Coinbase] Failed to transform position:',
            (err as any)?.message || err,
          );
          return null;
        }
      })
      .filter((p): p is Position => p !== null);
  }

  private async refreshBalancesAndPositions(): Promise<void> {
    try {
      const balances = await this.getBalances();
      console.log(
        `[Coinbase] 💰 Emitting accountUpdate with ${balances.length} balances`,
      );
      if (balances?.length) {
        this.emit('accountUpdate', 'coinbase', balances);
      }
    } catch (err) {
      console.warn('[Coinbase] Balance refresh error:', (err as any)?.message || err);
    }

    try {
      const positions = await this.getPositions();
      console.log(
        `[Coinbase] 📊 Emitting positionUpdate with ${positions.length} positions`,
      );
      if (positions?.length) {
        this.emit('positionUpdate', 'coinbase', positions);
      }
    } catch (err) {
      // It's normal to have no positions for spot-only accounts
      console.warn('[Coinbase] Position refresh note:', (err as any)?.message || err);
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
    // Build request path + query string deterministically to match the actual request
    let pathname = config.url || '';
    let searchParams = new URLSearchParams();

    if (pathname.startsWith('http')) {
      const fullUrl = new URL(pathname);
      pathname = fullUrl.pathname;
      // Preserve any query already encoded in the URL
      searchParams = new URLSearchParams(fullUrl.searchParams.toString());
    } else {
      // Relative URL (axios baseURL is used). Extract existing query if present
      const [pathOnly, existingQuery] = pathname.split('?');
      pathname = pathOnly;
      if (existingQuery) {
        searchParams = new URLSearchParams(existingQuery);
      }
    }

    // Merge config.params (if any) into the query string
    if (config.params) {
      for (const [key, value] of Object.entries(config.params as Record<string, any>)) {
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) {
          for (const v of value) {
            if (v === undefined || v === null) continue;
            searchParams.append(key, String(v));
          }
        } else {
          // Prefer set to overwrite any duplicate from existing query
          searchParams.set(key, String(value));
        }
      }
    }

    const queryString = searchParams.toString();
    const requestPath = queryString ? `${pathname}?${queryString}` : pathname;
    console.log('requestPath:', requestPath);

    // Ensure the actual request URL matches the signed path exactly
    config.url = requestPath;
    if (config.params) delete config.params;
    // Note: not used in JWT flow; left here for potential fallback HMAC scheme
    // const body = config.data ? JSON.stringify(config.data) : '';

    // const _isAdvancedTradePath = requestPath.startsWith('/api/v3/brokerage');
    const host = (() => {
      try {
        return new URL(this.baseUrl).host;
      } catch {
        return 'api.coinbase.com';
      }
    })();

    // Detect auth method based on secret key format and host
    const isExchangeHost = host.includes('api.exchange.coinbase.com');
    const isPemKey = this.credentials.secretKey.includes('-----BEGIN');
    const forceJwt = (process.env.COINBASE_FORCE_JWT || 'false').toLowerCase() === 'true';

    // Use JWT if: PEM key detected, Exchange host, or explicitly forced
    const useJwt = isPemKey || isExchangeHost || forceJwt;

    if (useJwt) {
      // Coinbase Exchange uses JWT ES256

      const token = generateToken(
        method,
        pathname,
        this.credentials.apiKey,
        this.credentials.secretKey,
      );

      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };
    } else {
      // Advanced Trade (api.coinbase.com) uses CB-ACCESS HMAC headers
      const prehash =
        timestamp +
        method +
        requestPath +
        (config.data ? JSON.stringify(config.data) : '');
      const hmac = crypto.createHmac(
        'sha256',
        Buffer.from(this.credentials.secretKey, 'base64'),
      );
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
    }

    return config;
  }

  protected normalizeSymbol(symbol: string): string {
    // Convert common formats to Coinbase product id format
    // Spot: BTC/USDC -> BTC-USDC (default quote coin is USDC)
    // Perpetual: BTC/USDC:USDC -> BTC-PERP-INTX

    const upperSymbol = symbol.toUpperCase();

    // Handle perpetual format: BTC/USDC:USDC (CCXT format for perpetual)
    if (upperSymbol.includes(':')) {
      const [pair] = upperSymbol.split(':');
      // BTC/USDC -> BTC-PERP-INTX
      return pair.split('/')[0] + '-PERP-INTX';
    }

    // Handle already formatted perpetual (BTC-PERP-INTX)
    if (upperSymbol.includes('-PERP-INTX')) {
      return upperSymbol;
    }

    // Spot format: BTC/USDC -> BTC-USDC
    return upperSymbol.replace('/', '-');
  }

  /**
   * Denormalize symbol from Coinbase format to unified format
   * Coinbase → Unified
   * BTC-USDC → BTC/USDC (spot)
   * BTC-PERP-INTX → BTC/USDC:USDC (perpetual)
   */
  protected denormalizeSymbol(productId: string): string {
    const upper = productId.toUpperCase();

    // Check if it's a perpetual
    if (upper.endsWith('-PERP-INTX')) {
      // BTC-PERP-INTX → BTC/USDC:USDC
      const base = upper.replace('-PERP-INTX', '');
      return `${base}/USDC:USDC`; // Coinbase perps are USDC settled
    }

    // Spot format: BTC-USDC → BTC/USDC
    const parts = upper.split('-');
    if (parts.length >= 2) {
      const quote = parts[parts.length - 1];
      const base = parts.slice(0, -1).join('-');
      return `${base}/${quote}`;
    }

    // Fallback: return as is
    return productId;
  }

  private mapIntervalToGranularity(interval: string): string {
    // Coinbase granularity is in seconds
    const map: Record<string, string> = {
      '1m': 'ONE_MINUTE',
      '5m': 'FIVE_MINUTE',
      '15m': 'FIFTEEN_MINUTE',
      '30m': 'THIRTY_MINUTE',
      '1h': 'ONE_HOUR',
      '2h': 'TWO_HOUR',
      '4h': 'FOUR_HOUR',
      '6h': 'SIX_HOUR',
      '1d': 'ONE_DAY',
    };
    return map[interval] || 'UNKNOWN_GRANULARITY';
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

    const status = this.transformOrderStatus(o.status || o.order_status || 'NEW');

    return {
      id: o.order_id || o.id || uuidv4(),
      clientOrderId: o.client_order_id,
      symbol: o.product_id || 'UNKNOWN',
      side: (o.side?.toUpperCase() || 'BUY') === 'BUY' ? OrderSide.BUY : OrderSide.SELL,
      type: this.transformOrderType(o.order_type || o.type || 'LIMIT'),
      quantity: this.formatDecimal(o.quantity || o.base_size || '0'),
      price: o.price ? this.formatDecimal(o.price) : undefined,
      status,
      timeInForce: (o.time_in_force as TimeInForce) || TimeInForce.GTC,
      timestamp: o.submitted_time ? new Date(o.submitted_time) : new Date(),
      updateTime: o.completion_time ? new Date(o.completion_time) : undefined,
      executedQuantity: o.filled_size ? this.formatDecimal(o.filled_size) : undefined,
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
