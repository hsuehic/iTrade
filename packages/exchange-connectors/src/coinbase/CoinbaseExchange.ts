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

/**
 * Coinbase Advanced Trade API connector (public + private + WS)
 * Docs (subject to change): public REST base https://api.coinbase.com
 * WS base: wss://advanced-trade-ws.coinbase.com
 * https://api.exchange.coinbase.com
 */
export class CoinbaseExchange extends BaseExchange {
  private publicHttpClient: AxiosInstance;
  private static readonly MAINNET_BASE_URL = 'https://api.coinbase.com';
  private static readonly PUBLIC_BASE_URL = 'https://api.exchange.coinbase.com';
  private static readonly MAINNET_WS_URL =
    'wss://advanced-trade-ws.coinbase.com';

  constructor() {
    const envBase = process.env.COINBASE_BASE_URL;
    const useExchangeApi =
      (process.env.COINBASE_USE_EXCHANGE_API || 'false').toLowerCase() ===
      'true';
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
      `/products/${productId}/ticker`
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
    const accountInfo = await this.getAccountInfo();
    console.log('Account Info:', accountInfo);
    const params: any = { granularity, limit }; // start/end iso8601 supported
    if (startTime) params.start = startTime.toISOString();
    if (endTime) params.end = endTime.toISOString();
    console.log('/api/v3/brokerage/products/BTC-PERP-INTX/candles');
    const resp = await this.httpClient.get(
      `/api/v3/brokerage/products/BTC-PERP-INTX/candles`,
      { params: { granularity: 'ONE_MINUTE' } }
    );
    console.log('resp:', resp);
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
    try {
      // Step 1: Get all accounts to find perpetual portfolio IDs
      const accountsResp = await this.httpClient.get(
        '/api/v3/brokerage/accounts'
      );
      const accounts = accountsResp.data?.accounts || [];

      // Debug: Log all accounts to understand the structure (remove in production)
      // console.log('[Coinbase Debug] All accounts:', JSON.stringify(accounts, null, 2));

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

      // console.log(`[Coinbase Debug] Found ${perpetualAccounts.length} potential perpetual accounts:`,
      //   perpetualAccounts.map((acc: any) => ({
      //     uuid: acc.uuid,
      //     name: acc.name,
      //     type: acc.type,
      //     portfolio_uuid: acc.portfolio_uuid
      //   })));

      if (perpetualAccounts.length === 0) {
        // No perpetual accounts found - this is normal for spot-only accounts
        return [];
      }

      const positions: Position[] = [];

      // Step 2: Get positions for each perpetual portfolio
      for (const account of perpetualAccounts) {
        const portfolioUuid =
          account.portfolio_uuid || account.retail_portfolio_id;
        if (!portfolioUuid) continue;

        try {
          const positionsResp = await this.httpClient.get(
            `/api/v3/brokerage/intx/positions/${portfolioUuid}`
          );
          const portfolioPositions = positionsResp.data?.positions || [];

          for (const pos of portfolioPositions) {
            if (!pos.product_id || !pos.net_size) continue;

            // Handle different data formats - some fields might be objects with 'value' property
            const getDecimalValue = (field: any): string => {
              if (typeof field === 'string') return field;
              if (typeof field === 'number') return field.toString();
              if (field && typeof field === 'object' && field.value)
                return field.value;
              return '0';
            };

            const size = this.formatDecimal(getDecimalValue(pos.net_size));
            if (size.isZero()) continue; // Skip zero positions

            positions.push({
              symbol: pos.product_id,
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
            error.message
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
      for (const [key, value] of Object.entries(
        config.params as Record<string, any>
      )) {
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
    const forceJwt =
      (process.env.COINBASE_FORCE_JWT || 'false').toLowerCase() === 'true';

    // Use JWT if: PEM key detected, Exchange host, or explicitly forced
    const useJwt = isPemKey || isExchangeHost || forceJwt;

    if (useJwt) {
      // Coinbase Exchange uses JWT ES256
      const nowSec = parseInt(timestamp, 10);
      const uri = `${method} ${host}${requestPath}`;

      const header = {
        alg: 'ES256',
        kid: this.credentials.apiKey,
        nonce: crypto.randomBytes(16).toString('hex'),
      } as const;
      const payload = {
        iss: process.env.COINBASE_JWT_ISSUER || 'cdp',
        nbf: nowSec,
        exp: nowSec + 120,
        sub: this.credentials.apiKey,
        uri,
      } as const;

      const toBase64Url = (input: Buffer | string): string =>
        (typeof input === 'string' ? Buffer.from(input) : input)
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/g, '');

      const signingInput = `${toBase64Url(
        JSON.stringify(header)
      )}.${toBase64Url(JSON.stringify(payload))}`;

      const signer = crypto.createSign('SHA256');
      signer.update(signingInput);
      signer.end();
      const derSignature = signer.sign(this.credentials.secretKey);

      const derToJose = (der: Buffer): string => {
        let offset = 0;
        if (der[offset++] !== 0x30) throw new Error('Invalid DER');
        const _seqLen = der[offset++];
        if (der[offset++] !== 0x02) throw new Error('Invalid DER r');
        let rLen = der[offset++];
        let r = der.slice(offset, offset + rLen);
        offset += rLen;
        if (der[offset++] !== 0x02) throw new Error('Invalid DER s');
        let sLen = der[offset++];
        let s = der.slice(offset, offset + sLen);
        while (r.length > 32 && r[0] === 0x00) r = r.slice(1);
        while (s.length > 32 && s[0] === 0x00) s = s.slice(1);
        if (r.length < 32)
          r = Buffer.concat([Buffer.alloc(32 - r.length, 0), r]);
        if (s.length < 32)
          s = Buffer.concat([Buffer.alloc(32 - s.length, 0), s]);
        const jose = Buffer.concat([r, s]);
        return toBase64Url(jose);
      };

      const signature = derToJose(derSignature);
      const token = `${signingInput}.${signature}`;

      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent':
          process.env.COINBASE_USER_AGENT || 'coinbase-advanced-ts/0.1.0',
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
        Buffer.from(this.credentials.secretKey, 'base64')
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
    // Perpetual: BTC/USDC:USDC -> BTC-USDC-INTX

    const upperSymbol = symbol.toUpperCase();

    // Handle perpetual format: BTC/USDC:USDC (CCXT format for perpetual)
    if (upperSymbol.includes(':')) {
      const [pair] = upperSymbol.split(':');
      // BTC/USDC -> BTC-USDC-INTX
      return pair.replace('/', '-') + '-INTX';
    }

    // Handle already formatted perpetual (BTC-USDC-INTX)
    if (upperSymbol.includes('-INTX')) {
      return upperSymbol;
    }

    // Spot format: BTC/USDC -> BTC-USDC
    return upperSymbol.replace('/', '-');
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
