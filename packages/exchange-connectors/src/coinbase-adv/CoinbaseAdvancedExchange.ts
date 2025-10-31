/**
 * Coinbase Advanced Trade Exchange Implementation
 * Using coinbase-api library for WebSocket and REST API
 *
 * @see https://github.com/tiagosiebler/coinbase-api
 */

import { EventEmitter } from 'events';
import {
  WebsocketClient,
  WS_KEY_MAP,
  CBAdvancedTradeClient,
  CBInternationalClient,
} from 'coinbase-api';
import { Decimal } from 'decimal.js';
import {
  IExchange,
  Balance,
  Position,
  Order,
  Kline,
  AccountInfo,
  OrderSide,
  OrderType,
  OrderStatus,
  TimeInForce,
  Ticker,
  OrderBook,
  Trade,
  ExchangeCredentials,
  ExchangeInfo,
  SymbolInfo,
  TradeMode,
} from '@itrade/core';

interface CoinbaseCredentials {
  apiKey: string;
  secretKey: string;
  sandbox?: boolean;
}

/**
 * Coinbase Advanced Exchange implementation using coinbase-api library
 */
export class CoinbaseAdvancedExchange extends EventEmitter implements IExchange {
  public readonly name = 'coinbase-advanced';
  private _isConnected = false;

  private wsClient?: WebsocketClient;
  private restClient?: CBAdvancedTradeClient;
  private intxClient?: CBInternationalClient;
  private credentials?: CoinbaseCredentials;

  // Subscription tracking
  private subscribedKlines = new Map<string, string>(); // symbol -> interval

  constructor() {
    super();
  }

  public get isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Connect to Coinbase Advanced Trade
   */
  public async connect(credentials: ExchangeCredentials): Promise<void> {
    console.log('[CoinbaseAdv] Connecting...');

    this.credentials = {
      apiKey: credentials.apiKey,
      secretKey: credentials.secretKey,
      sandbox: credentials.sandbox,
    };

    // Initialize REST API clients
    this.restClient = new CBAdvancedTradeClient({
      apiKey: credentials.apiKey,
      apiSecret: credentials.secretKey,
      ...(credentials.sandbox
        ? { restClientOptions: { baseUrl: 'sandbox-api-url' } }
        : {}),
    });

    this.intxClient = new CBInternationalClient({
      apiKey: credentials.apiKey,
      apiSecret: credentials.secretKey,
      ...(credentials.sandbox
        ? { restClientOptions: { baseUrl: 'sandbox-api-url' } }
        : {}),
    });

    // Test connection
    try {
      const response = await this.restClient.getAccounts();
      this._isConnected = true;
      console.log(
        `[CoinbaseAdv] ✅ Connected. Found ${response.accounts?.length || 0} accounts`,
      );
    } catch (error: any) {
      console.error(
        '[CoinbaseAdv] ❌ Connection failed:',
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  /**
   * Disconnect from exchange
   */
  public async disconnect(): Promise<void> {
    console.log('[CoinbaseAdv] Disconnecting...');

    if (this.wsClient) {
      this.wsClient.closeAll();
      this.wsClient = undefined;
    }

    this.subscribedKlines.clear();
    this._isConnected = false;

    console.log('[CoinbaseAdv] ✅ Disconnected');
  }

  /**
   * Initialize WebSocket client (lazy initialization)
   */
  private initializeWebSocket(): void {
    if (this.wsClient) {
      return;
    }

    if (!this.credentials) {
      throw new Error('[CoinbaseAdv] Credentials required for WebSocket');
    }

    console.log('[CoinbaseAdv] Initializing WebSocket...');

    this.wsClient = new WebsocketClient({
      apiKey: this.credentials.apiKey,
      apiSecret: this.credentials.secretKey,
    });

    // Setup event listeners
    this.wsClient.on('open', (data) => {
      console.log('[CoinbaseAdv] 🔌 WebSocket opened:', data?.wsKey);
    });

    this.wsClient.on('update', (data) => {
      this.handleWebSocketUpdate(data);
    });

    this.wsClient.on('reconnect', () => {
      console.log('[CoinbaseAdv] 🔄 Reconnecting...');
    });

    this.wsClient.on('reconnected', () => {
      console.log('[CoinbaseAdv] ✅ Reconnected');
      this.resubscribeAll();
    });

    this.wsClient.on('close', () => {
      console.log('[CoinbaseAdv] ⚠️ WebSocket closed');
    });

    this.wsClient.on('response', (data) => {
      console.log('[CoinbaseAdv] 📬 Subscription response:', JSON.stringify(data));
    });

    this.wsClient.on('exception', (error) => {
      console.error('[CoinbaseAdv] ❌ WebSocket exception:', error);
    });

    console.log('[CoinbaseAdv] ✅ WebSocket initialized');
  }

  /**
   * Handle WebSocket updates from coinbase-api
   */
  private handleWebSocketUpdate(data: any): void {
    const { channel, events } = data;

    switch (channel) {
      case 'futures_balance_summary':
        this.handleFuturesBalanceSummary(events);
        break;
      case 'user':
        this.handleUserChannel(events);
        break;
      case 'candles':
        this.handleCandles(events);
        break;
      case 'ticker':
        this.handleTicker(events);
        break;
      case 'l2_data': // Coinbase sends 'l2_data' not 'level2'
        this.handleOrderBook(events);
        break;
      case 'market_trades':
        this.handleTrades(events);
        break;
      default:
        // console.log(`[CoinbaseAdv] Unhandled channel: ${channel}`);
        break;
    }
  }

  /**
   * Handle futures balance summary
   */
  private handleFuturesBalanceSummary(events: any[]): void {
    if (!events || events.length === 0) return;

    for (const event of events) {
      if (event.fcm_balance_summary) {
        const summary = event.fcm_balance_summary;

        const balances: Balance[] = [
          {
            asset: 'USD',
            free: this.formatDecimal(summary.available_margin || '0'),
            locked: this.formatDecimal(summary.initial_margin || '0'),
            total: this.formatDecimal(summary.total_usd_balance || '0'),
          },
        ];

        console.log(
          `[CoinbaseAdv] 💰 Balance Update: Total=${summary.total_usd_balance} USD`,
        );
        this.emit('accountUpdate', { exchange: this.name, balances });
      }
    }
  }

  /**
   * Handle user channel (orders, positions)
   */
  private handleUserChannel(events: any[]): void {
    if (!events || events.length === 0) return;

    for (const event of events) {
      // Handle orders
      if (event.orders && event.orders.length > 0) {
        console.log(`[CoinbaseAdv] Processing ${event.orders.length} order updates`);
        for (const orderData of event.orders) {
          try {
            const order = this.transformOrder(orderData);
            const symbol = order.symbol;
            console.log(
              `[CoinbaseAdv] 📦 Order Update: ${symbol} ${order.side} ${order.quantity} @ ${order.price || 'MARKET'} - ${order.status}`,
            );
            this.emit('orderUpdate', { symbol, order });
          } catch (err) {
            console.warn('[CoinbaseAdv] Failed to transform order:', err);
          }
        }
      }

      // Handle positions
      if (event.positions) {
        const allPositions: any[] = [];

        if (event.positions.perpetual_futures_positions) {
          allPositions.push(...event.positions.perpetual_futures_positions);
        }
        if (event.positions.expiring_futures_positions) {
          allPositions.push(...event.positions.expiring_futures_positions);
        }

        if (allPositions.length > 0) {
          try {
            const positions = this.transformPositions(allPositions);
            console.log(
              `[CoinbaseAdv] 📊 Position Update: ${positions.length} positions`,
            );
            this.emit('positionUpdate', { exchange: this.name, positions });
          } catch (err) {
            console.warn('[CoinbaseAdv] Failed to transform positions:', err);
          }
        } else {
          console.log('[CoinbaseAdv] No open positions');
        }
      }
    }
  }

  /**
   * Handle candles/klines
   */
  private handleCandles(events: any[]): void {
    if (!events || events.length === 0) return;

    for (const event of events) {
      if (event.candles && event.candles.length > 0) {
        for (const candleData of event.candles) {
          try {
            const productId = candleData.product_id;
            const symbol = this.denormalizeSymbol(productId);
            const interval = this.subscribedKlines.get(symbol) || '15m';

            const kline: Kline = {
              symbol,
              interval,
              openTime: new Date(parseInt(candleData.start) * 1000),
              closeTime: new Date(parseInt(candleData.start) * 1000 + 15 * 60 * 1000),
              open: this.formatDecimal(candleData.open),
              high: this.formatDecimal(candleData.high),
              low: this.formatDecimal(candleData.low),
              close: this.formatDecimal(candleData.close),
              volume: this.formatDecimal(candleData.volume || '0'),
              quoteVolume: this.formatDecimal('0'), // Not provided by Coinbase
              trades: 0, // Not provided by Coinbase
              isClosed: true,
              exchange: this.name,
            };

            this.emit('kline', symbol, kline);
          } catch (err) {
            console.warn('[CoinbaseAdv] Failed to transform candle:', err);
          }
        }
      }
    }
  }

  /**
   * Handle ticker updates
   */
  private handleTicker(events: any[]): void {
    if (!events || events.length === 0) return;

    for (const event of events) {
      if (event.tickers && event.tickers.length > 0) {
        for (const tickerData of event.tickers) {
          try {
            const symbol = this.denormalizeSymbol(tickerData.product_id);
            const ticker: Ticker = {
              symbol,
              price: this.formatDecimal(tickerData.price),
              volume: this.formatDecimal(tickerData.volume_24_h || '0'),
              timestamp: new Date(),
              bid: tickerData.best_bid
                ? this.formatDecimal(tickerData.best_bid)
                : undefined,
              ask: tickerData.best_ask
                ? this.formatDecimal(tickerData.best_ask)
                : undefined,
              high24h: tickerData.high_24_h
                ? this.formatDecimal(tickerData.high_24_h)
                : undefined,
              low24h: tickerData.low_24_h
                ? this.formatDecimal(tickerData.low_24_h)
                : undefined,
              exchange: this.name,
            };

            this.emit('ticker', symbol, ticker);
          } catch (err) {
            console.warn('[CoinbaseAdv] Failed to transform ticker:', err);
          }
        }
      }
    }
  }

  /**
   * Handle order book updates (l2_data channel)
   */
  private handleOrderBook(events: any[]): void {
    if (!events || events.length === 0) return;

    for (const event of events) {
      if (event.updates && event.updates.length > 0) {
        try {
          const symbol = this.denormalizeSymbol(event.product_id);

          // Aggregate bids and asks from updates
          const bids: [Decimal, Decimal][] = [];
          const asks: [Decimal, Decimal][] = [];

          for (const update of event.updates) {
            const price = this.formatDecimal(update.price_level || '0');
            const qty = this.formatDecimal(update.new_quantity || '0');

            if (update.side === 'bid') {
              bids.push([price, qty]);
            } else if (update.side === 'offer') {
              asks.push([price, qty]);
            }
          }

          const orderBook: OrderBook = {
            symbol,
            timestamp: new Date(event.updates[0]?.event_time || Date.now()),
            bids,
            asks,
            exchange: this.name,
          };

          this.emit('orderBook', symbol, orderBook);
        } catch (err) {
          console.warn('[CoinbaseAdv] Failed to transform order book:', err);
        }
      }
    }
  }

  /**
   * Handle trades
   */
  private handleTrades(events: any[]): void {
    if (!events || events.length === 0) return;

    for (const event of events) {
      if (event.trades && event.trades.length > 0) {
        for (const tradeData of event.trades) {
          try {
            const symbol = this.denormalizeSymbol(tradeData.product_id);
            const trade: Trade = {
              id: tradeData.trade_id,
              symbol,
              price: this.formatDecimal(tradeData.price),
              quantity: this.formatDecimal(tradeData.size),
              side: tradeData.side === 'BUY' ? 'buy' : 'sell',
              timestamp: new Date(tradeData.time),
              exchange: this.name,
            };

            this.emit('trade', symbol, trade);
          } catch (err) {
            console.warn('[CoinbaseAdv] Failed to transform trade:', err);
          }
        }
      }
    }
  }

  /**
   * Resubscribe to all channels after reconnection
   */
  private resubscribeAll(): void {
    console.log('[CoinbaseAdv] Resubscribing...');

    if (this.credentials) {
      this.wsClient!.subscribe('futures_balance_summary', WS_KEY_MAP.advTradeUserData);
      this.wsClient!.subscribe('user', WS_KEY_MAP.advTradeUserData);
    }

    // Resubscribe to klines
    for (const [symbol, _interval] of this.subscribedKlines.entries()) {
      const productId = this.normalizeSymbol(symbol);
      this.wsClient!.subscribe(
        {
          topic: 'candles',
          payload: {
            product_ids: [productId],
          },
        },
        WS_KEY_MAP.advTradeMarketData,
      );
    }

    console.log('[CoinbaseAdv] ✅ Resubscription complete');
  }

  // ============================================================
  // WebSocket Subscriptions
  // ============================================================

  /**
   * Subscribe to user data (balance, positions, orders)
   */
  public async subscribeToUserData(): Promise<void> {
    if (!this.credentials) {
      throw new Error('[CoinbaseAdv] Credentials required for user data');
    }

    console.log('[CoinbaseAdv] Subscribing to user data...');

    this.initializeWebSocket();

    this.wsClient!.subscribe('futures_balance_summary', WS_KEY_MAP.advTradeUserData);
    this.wsClient!.subscribe('user', WS_KEY_MAP.advTradeUserData);

    console.log('[CoinbaseAdv] ✅ Subscribed to user data');

    // Fetch initial data via REST API
    await this.refreshBalancesAndPositions();
  }

  /**
   * Subscribe to ticker
   */
  public async subscribeToTicker(symbol: string): Promise<void> {
    console.log(`[CoinbaseAdv] Subscribing to ticker: ${symbol}`);

    this.initializeWebSocket();

    const productId = this.normalizeSymbol(symbol);

    this.wsClient!.subscribe(
      {
        topic: 'ticker',
        payload: {
          product_ids: [productId],
        },
      },
      WS_KEY_MAP.advTradeMarketData,
    );

    console.log(`[CoinbaseAdv] ✅ Subscribed to ticker: ${productId}`);
  }

  /**
   * Subscribe to order book
   */
  public async subscribeToOrderBook(symbol: string, _depth?: number): Promise<void> {
    console.log(`[CoinbaseAdv] Subscribing to order book: ${symbol}`);

    this.initializeWebSocket();

    const productId = this.normalizeSymbol(symbol);

    this.wsClient!.subscribe(
      {
        topic: 'level2',
        payload: {
          product_ids: [productId],
        },
      },
      WS_KEY_MAP.advTradeMarketData,
    );

    console.log(`[CoinbaseAdv] ✅ Subscribed to order book: ${productId}`);
  }

  /**
   * Subscribe to trades
   */
  public async subscribeToTrades(symbol: string): Promise<void> {
    console.log(`[CoinbaseAdv] Subscribing to trades: ${symbol}`);

    this.initializeWebSocket();

    const productId = this.normalizeSymbol(symbol);

    this.wsClient!.subscribe(
      {
        topic: 'market_trades',
        payload: {
          product_ids: [productId],
        },
      },
      WS_KEY_MAP.advTradeMarketData,
    );

    console.log(`[CoinbaseAdv] ✅ Subscribed to trades: ${productId}`);
  }

  /**
   * Subscribe to klines
   */
  public async subscribeToKlines(symbol: string, interval: string): Promise<void> {
    console.log(`[CoinbaseAdv] Subscribing to klines: ${symbol} @ ${interval}`);

    this.initializeWebSocket();

    const productId = this.normalizeSymbol(symbol);
    this.subscribedKlines.set(symbol, interval);

    this.wsClient!.subscribe(
      {
        topic: 'candles',
        payload: {
          product_ids: [productId],
        },
      },
      WS_KEY_MAP.advTradeMarketData,
    );

    console.log(`[CoinbaseAdv] ✅ Subscribed to klines: ${productId} @ ${interval}`);
  }

  /**
   * Unsubscribe from a channel
   */
  public async unsubscribe(
    symbol: string,
    type: 'ticker' | 'orderbook' | 'trades' | 'klines',
  ): Promise<void> {
    console.log(`[CoinbaseAdv] Unsubscribing from ${type}: ${symbol}`);

    if (!this.wsClient) {
      return;
    }

    const productId = this.normalizeSymbol(symbol);
    let topic: string;

    switch (type) {
      case 'ticker':
        topic = 'ticker';
        break;
      case 'orderbook':
        topic = 'level2';
        break;
      case 'trades':
        topic = 'market_trades';
        break;
      case 'klines':
        topic = 'candles';
        this.subscribedKlines.delete(symbol);
        break;
      default:
        throw new Error(`[CoinbaseAdv] Unknown subscription type: ${type}`);
    }

    this.wsClient.unsubscribe(
      {
        topic,
        payload: {
          product_ids: [productId],
        },
      },
      WS_KEY_MAP.advTradeMarketData,
    );

    console.log(`[CoinbaseAdv] ✅ Unsubscribed from ${type}: ${productId}`);
  }

  // ============================================================
  // Market Data (REST API)
  // ============================================================

  public async getTicker(symbol: string): Promise<Ticker> {
    if (!this.restClient) {
      throw new Error('[CoinbaseAdv] Not connected. Call connect() first.');
    }

    const productId = this.normalizeSymbol(symbol);
    const response = await this.restClient.getBestBidAsk({ product_ids: [productId] });
    const data = response.pricebooks?.[0];

    if (!data) {
      throw new Error(`[CoinbaseAdv] No ticker data for ${symbol}`);
    }

    return {
      symbol,
      price: this.formatDecimal(data.bids?.[0]?.price || data.asks?.[0]?.price || '0'),
      volume: this.formatDecimal('0'), // Not provided in best bid/ask
      timestamp: new Date(data.time),
      bid: data.bids?.[0]?.price ? this.formatDecimal(data.bids[0].price) : undefined,
      ask: data.asks?.[0]?.price ? this.formatDecimal(data.asks[0].price) : undefined,
      exchange: this.name,
    };
  }

  public async getOrderBook(symbol: string, limit = 20): Promise<OrderBook> {
    if (!this.restClient) {
      throw new Error('[CoinbaseAdv] Not connected. Call connect() first.');
    }

    const productId = this.normalizeSymbol(symbol);
    const response = await this.restClient.getProductBook({
      product_id: productId,
      limit,
    });
    const data = response.pricebook;

    return {
      symbol,
      timestamp: new Date(data.time),
      bids:
        data.bids?.map((bid: any) => [
          this.formatDecimal(bid.price),
          this.formatDecimal(bid.size),
        ]) || [],
      asks:
        data.asks?.map((ask: any) => [
          this.formatDecimal(ask.price),
          this.formatDecimal(ask.size),
        ]) || [],
      exchange: this.name,
    };
  }

  public async getTrades(symbol: string, limit = 100): Promise<Trade[]> {
    if (!this.restClient) {
      throw new Error('[CoinbaseAdv] Not connected. Call connect() first.');
    }

    const productId = this.normalizeSymbol(symbol);
    const response = await this.restClient.getMarketTrades({
      product_id: productId,
      limit,
    });
    const trades = response.trades || [];

    return trades.map((trade: any) => ({
      id: trade.trade_id,
      symbol,
      price: this.formatDecimal(trade.price),
      quantity: this.formatDecimal(trade.size),
      side: trade.side === 'BUY' ? 'buy' : 'sell',
      timestamp: new Date(trade.time),
      exchange: this.name,
    }));
  }

  public async getKlines(
    symbol: string,
    interval: string,
    startTime?: Date,
    endTime?: Date,
    _limit = 300,
  ): Promise<Kline[]> {
    if (!this.restClient) {
      throw new Error('[CoinbaseAdv] Not connected. Call connect() first.');
    }

    const productId = this.normalizeSymbol(symbol);

    // Convert interval to Coinbase format (e.g., "15m" -> "FIFTEEN_MINUTE")
    const granularity = this.convertIntervalToGranularity(interval);

    const params: any = {
      product_id: productId,
      granularity,
    };

    if (startTime) {
      params.start = Math.floor(startTime.getTime() / 1000).toString();
    }
    if (endTime) {
      params.end = Math.floor(endTime.getTime() / 1000).toString();
    }

    const response = await this.restClient.getProductCandles(params);

    const candles = response.candles || [];

    return candles.map((candle: any) => ({
      symbol,
      interval,
      openTime: new Date(parseInt(candle.start) * 1000),
      closeTime: new Date(
        (parseInt(candle.start) + this.intervalToSeconds(interval)) * 1000,
      ),
      open: this.formatDecimal(candle.open),
      high: this.formatDecimal(candle.high),
      low: this.formatDecimal(candle.low),
      close: this.formatDecimal(candle.close),
      volume: this.formatDecimal(candle.volume || '0'),
      quoteVolume: this.formatDecimal('0'),
      trades: 0,
      isClosed: true,
      exchange: this.name,
    }));
  }

  // ============================================================
  // Account & Trading (REST API)
  // ============================================================

  public async getAccountInfo(): Promise<AccountInfo> {
    const balances = await this.getBalances();
    return {
      balances,
      canTrade: true,
      canWithdraw: true,
      canDeposit: true,
      updateTime: new Date(),
    };
  }

  public async getBalances(): Promise<Balance[]> {
    if (!this.restClient) {
      throw new Error('[CoinbaseAdv] Not connected. Call connect() first.');
    }

    try {
      // Get spot balances
      const accountsResp = await this.restClient.getAccounts();
      const accounts = accountsResp.accounts || [];

      const spotBalances: Balance[] = accounts
        .map((account: any) => {
          const asset = account.currency || account.asset || 'USD';
          const availableValue = account.available_balance?.value || '0';
          const holdValue = account.hold?.value || '0';

          return {
            asset,
            free: this.formatDecimal(availableValue),
            locked: this.formatDecimal(holdValue),
            total: this.formatDecimal(availableValue).add(this.formatDecimal(holdValue)),
          };
        })
        .filter((b: Balance) => b.total.greaterThan(0));

      // Get INTX perpetual balances
      const intxBalances = await this.getIntxBalances();

      return [...spotBalances, ...intxBalances];
    } catch (error: any) {
      console.error(
        '[CoinbaseAdv] Failed to fetch balances:',
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  /**
   * Get INTX perpetual account balances
   * Uses direct REST API call instead of CBInternationalClient (which requires passphrase)
   */
  private async getIntxBalances(): Promise<Balance[]> {
    try {
      // Step 1: Get all accounts to find perpetual portfolio
      const accountsResp: any = await this.restClient!.getAccounts();
      const accounts = accountsResp.accounts || [];

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

      if (perpetualAccounts.length === 0) {
        return [];
      }

      const balances: Balance[] = [];

      // Step 2: Get balances for each perpetual portfolio
      for (const account of perpetualAccounts) {
        const portfolioUuid = account.portfolio_uuid || account.retail_portfolio_id;
        if (!portfolioUuid) continue;

        try {
          // Use restClient's request method to call INTX endpoint
          const portfolioResp: any = await (this.restClient as any).get(
            `/api/v3/brokerage/intx/portfolio/${portfolioUuid}`,
          );

          const portfolios = portfolioResp.portfolios || [];

          for (const portfolio of portfolios) {
            const collateral = portfolio.collateral || '0';
            const positionNotional = portfolio.position_notional || '0';
            const total = parseFloat(collateral) + parseFloat(positionNotional);

            balances.push({
              asset: 'USDC',
              free: this.formatDecimal(collateral),
              locked: this.formatDecimal(positionNotional),
              total: this.formatDecimal(total.toString()),
            });

            console.log(
              `[CoinbaseAdv] 💰 INTX Portfolio ${portfolio.portfolio_uuid || portfolioUuid}: Collateral=${collateral}, Position=${positionNotional}, Total=${total}`,
            );
          }
        } catch (err: any) {
          console.warn(
            `[CoinbaseAdv] Failed to fetch INTX portfolio ${portfolioUuid}:`,
            err.response?.data || err.message,
          );
        }
      }

      return balances;
    } catch (error: any) {
      console.warn(
        '[CoinbaseAdv] Failed to fetch INTX balances:',
        error.response?.data || error.message,
      );
      return [];
    }
  }

  public async getPositions(): Promise<Position[]> {
    if (!this.restClient) {
      throw new Error('[CoinbaseAdv] Not connected. Call connect() first.');
    }

    try {
      // Step 1: Get all accounts to find perpetual portfolio IDs
      const accountsResp: any = await this.restClient.getAccounts();
      const accounts = accountsResp.accounts || [];

      // Find perpetual accounts
      const perpetualAccounts = accounts.filter((account: any) => {
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

      if (perpetualAccounts.length === 0) {
        return [];
      }

      const positions: Position[] = [];

      // Step 2: Get positions for each perpetual portfolio
      for (const account of perpetualAccounts) {
        const portfolioUuid = account.portfolio_uuid || account.retail_portfolio_id;
        if (!portfolioUuid) continue;

        try {
          // Use restClient's request method to call INTX endpoint
          const positionsResp: any = await (this.restClient as any).get(
            `/api/v3/brokerage/intx/positions/${portfolioUuid}`,
          );
          const portfolioPositions = positionsResp.positions || [];

          for (const pos of portfolioPositions) {
            if (!pos.product_id || !pos.net_size) continue;

            // Helper to extract value from different formats
            const getDecimalValue = (field: any): string => {
              if (typeof field === 'string') return field;
              if (typeof field === 'number') return field.toString();
              if (field && typeof field === 'object' && field.value) return field.value;
              return '0';
            };

            const size = this.formatDecimal(getDecimalValue(pos.net_size));
            if (size.isZero()) continue;

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
        } catch (err: any) {
          // If 404 for this specific portfolio, it might not have positions
          if (err.response?.status === 404) {
            continue;
          }
          console.warn(
            `[CoinbaseAdv] Failed to fetch positions for portfolio ${portfolioUuid}:`,
            err.response?.data || err.message,
          );
        }
      }

      return positions;
    } catch (error: any) {
      console.warn(
        '[CoinbaseAdv] Failed to fetch positions:',
        error.response?.data || error.message,
      );
      return [];
    }
  }

  /**
   * Refresh balances and positions via REST API
   */
  private async refreshBalancesAndPositions(): Promise<void> {
    try {
      const balances = await this.getBalances();
      if (balances?.length) {
        console.log(`[CoinbaseAdv] 💰 Emitting ${balances.length} balances`);
        this.emit('accountUpdate', { exchange: this.name, balances });
      }
    } catch (err) {
      console.warn('[CoinbaseAdv] Balance refresh error:', (err as any)?.message || err);
    }

    try {
      const positions = await this.getPositions();
      if (positions?.length) {
        console.log(`[CoinbaseAdv] 📊 Emitting ${positions.length} positions`);
        this.emit('positionUpdate', { exchange: this.name, positions });
      }
    } catch (err) {
      console.warn('[CoinbaseAdv] Position refresh error:', (err as any)?.message || err);
    }
  }

  // ============================================================
  // Trading Operations (Stubs - implement as needed)
  // ============================================================

  public async createOrder(
    _symbol: string,
    _side: OrderSide,
    _type: OrderType,
    _quantity: Decimal,
    _price?: Decimal,
    _timeInForce?: TimeInForce,
    _clientOrderId?: string,
    _options?: { tradeMode?: TradeMode; leverage?: number },
  ): Promise<Order> {
    throw new Error('[CoinbaseAdv] createOrder not yet implemented');
  }

  public async cancelOrder(
    _symbol: string,
    _orderId: string,
    _clientOrderId?: string,
  ): Promise<Order> {
    throw new Error('[CoinbaseAdv] cancelOrder not yet implemented');
  }

  public async getOrder(
    _symbol: string,
    _orderId: string,
    _clientOrderId?: string,
  ): Promise<Order> {
    throw new Error('[CoinbaseAdv] getOrder not yet implemented');
  }

  public async getOpenOrders(_symbol?: string): Promise<Order[]> {
    throw new Error('[CoinbaseAdv] getOpenOrders not yet implemented');
  }

  public async getOrderHistory(_symbol?: string, _limit?: number): Promise<Order[]> {
    throw new Error('[CoinbaseAdv] getOrderHistory not yet implemented');
  }

  public async getExchangeInfo(): Promise<ExchangeInfo> {
    throw new Error('[CoinbaseAdv] getExchangeInfo not yet implemented');
  }

  public async getSymbols(): Promise<string[]> {
    throw new Error('[CoinbaseAdv] getSymbols not yet implemented');
  }

  public async getSymbolInfo(_symbol: string): Promise<SymbolInfo> {
    throw new Error('[CoinbaseAdv] getSymbolInfo not yet implemented');
  }

  // ============================================================
  // Helper Methods
  // ============================================================

  /**
   * Transform Coinbase order to iTrade Order
   */
  private transformOrder(orderData: any): Order {
    const productId = orderData.product_id;
    const symbol = this.denormalizeSymbol(productId);

    return {
      id: orderData.order_id,
      clientOrderId: orderData.client_order_id,
      symbol,
      side: orderData.order_side === 'BUY' ? OrderSide.BUY : OrderSide.SELL,
      type: this.transformOrderType(orderData.order_type),
      quantity: this.formatDecimal(orderData.leaves_quantity || '0'),
      price: this.formatDecimal(orderData.limit_price || orderData.avg_price || '0'),
      status: this.transformOrderStatus(orderData.status),
      timeInForce: this.transformTimeInForce(orderData.time_in_force),
      timestamp: new Date(orderData.creation_time),
      updateTime: new Date(),
      executedQuantity: this.formatDecimal(orderData.cumulative_quantity || '0'),
      exchange: this.name,
    };
  }

  private transformOrderType(coinbaseType: string): OrderType {
    switch (coinbaseType?.toUpperCase()) {
      case 'LIMIT':
        return OrderType.LIMIT;
      case 'MARKET':
        return OrderType.MARKET;
      case 'STOP':
      case 'STOP_LIMIT':
        return OrderType.STOP_LOSS;
      default:
        return OrderType.LIMIT;
    }
  }

  private transformOrderStatus(coinbaseStatus: string): OrderStatus {
    switch (coinbaseStatus?.toUpperCase()) {
      case 'OPEN':
      case 'PENDING':
        return OrderStatus.NEW;
      case 'FILLED':
      case 'DONE':
        return OrderStatus.FILLED;
      case 'CANCELLED':
      case 'CANCELED':
        return OrderStatus.CANCELED;
      case 'REJECTED':
      case 'FAILED':
        return OrderStatus.REJECTED;
      default:
        return OrderStatus.NEW;
    }
  }

  private transformTimeInForce(coinbaseTif: string): TimeInForce {
    const normalized = (coinbaseTif || 'GTC').toUpperCase().trim();

    switch (normalized) {
      case 'GOOD_UNTIL_CANCELLED':
      case 'GOOD_UNTIL_CANCELED': // Handle both spellings
      case 'GTC':
        return 'GTC' as TimeInForce;
      case 'IMMEDIATE_OR_CANCEL':
      case 'IOC':
        return 'IOC' as TimeInForce;
      case 'FILL_OR_KILL':
      case 'FOK':
        return 'FOK' as TimeInForce;
      default:
        console.warn(
          `[CoinbaseAdv] Unknown TimeInForce: ${coinbaseTif}, defaulting to GTC`,
        );
        return 'GTC' as TimeInForce;
    }
  }

  private transformPositions(positionData: any[]): Position[] {
    return positionData
      .map((pos) => {
        try {
          const productId = pos.product_id;
          const symbol = this.denormalizeSymbol(productId);
          const size = this.formatDecimal(pos.net_size || '0');

          if (size.isZero()) return null;

          return {
            symbol,
            side: size.isPositive() ? 'long' : 'short',
            quantity: size.abs(),
            avgPrice: this.formatDecimal(pos.entry_vwap || pos.vwap || '0'),
            markPrice: this.formatDecimal(pos.mark_price || '0'),
            unrealizedPnl: this.formatDecimal(pos.unrealized_pnl || '0'),
            leverage: new Decimal(pos.leverage || 1),
            timestamp: new Date(),
          } as Position;
        } catch (err) {
          console.warn('[CoinbaseAdv] Failed to transform position:', err);
          return null;
        }
      })
      .filter((p): p is Position => p !== null);
  }

  /**
   * Symbol normalization: iTrade -> Coinbase
   * BTC/USDC:USDC -> BTC-PERP-INTX
   * BTC/USDC -> BTC-USDC
   */
  public normalizeSymbol(symbol: string): string {
    const upper = symbol.toUpperCase();

    if (upper.includes('-')) {
      return upper; // Already Coinbase format
    }

    // Perpetual: BTC/USDC:USDC -> BTC-PERP-INTX
    if (upper.includes(':')) {
      const base = upper.split('/')[0];
      return `${base}-PERP-INTX`;
    }

    // Spot: BTC/USDC -> BTC-USDC
    return upper.replace('/', '-');
  }

  /**
   * Symbol denormalization: Coinbase -> iTrade
   * BTC-PERP-INTX -> BTC/USDC:USDC
   * BTC-USDC -> BTC/USDC
   */
  public denormalizeSymbol(symbol: string): string {
    const upper = symbol.toUpperCase();

    // Perpetual: BTC-PERP-INTX -> BTC/USDC:USDC
    if (upper.endsWith('-PERP-INTX')) {
      const base = upper.replace('-PERP-INTX', '');
      return `${base}/USDC:USDC`;
    }

    // Spot: BTC-USDC -> BTC/USDC
    return upper.replace('-', '/');
  }

  private formatDecimal(value: string | number): Decimal {
    try {
      return new Decimal(value || 0);
    } catch {
      return new Decimal(0);
    }
  }

  private convertIntervalToGranularity(interval: string): string {
    const map: Record<string, string> = {
      '1m': 'ONE_MINUTE',
      '5m': 'FIVE_MINUTE',
      '15m': 'FIFTEEN_MINUTE',
      '30m': 'THIRTY_MINUTE',
      '1h': 'ONE_HOUR',
      '2h': 'TWO_HOUR',
      '6h': 'SIX_HOUR',
      '1d': 'ONE_DAY',
    };
    return map[interval] || 'FIFTEEN_MINUTE';
  }

  private intervalToSeconds(interval: string): number {
    const map: Record<string, number> = {
      '1m': 60,
      '5m': 300,
      '15m': 900,
      '30m': 1800,
      '1h': 3600,
      '2h': 7200,
      '6h': 21600,
      '1d': 86400,
    };
    return map[interval] || 900;
  }
}
