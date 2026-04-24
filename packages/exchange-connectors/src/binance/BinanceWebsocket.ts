import WebSocket from 'ws';
import axios from 'axios';
import EventEmitter from 'events';

import { StreamRawMapping } from './type';
import { WSDataEvent } from '../base/TypedEventEmiter';

export interface Logger {
  info: (...args: any[]) => void;
  debug?: (...args: any[]) => void;
  warn?: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

type MarketType = 'spot' | 'futures';
type NetworkType = 'mainnet' | 'testnet';

interface WSConfig {
  network: NetworkType;
  apiKey?: string;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  pingInterval?: number;
  logger?: Logger;
}

export type BinanceWebsocketEventMap = {
  [key in keyof StreamRawMapping]: [StreamRawMapping[key]];
} & {
  data: [WSDataEvent<StreamRawMapping>];
  disconnected: [MarketType];
};

export class BinanceWebsocket extends EventEmitter<BinanceWebsocketEventMap> {
  private wsMap: Map<MarketType, WebSocket> = new Map();
  private subscriptions: Map<MarketType, Map<string, Set<string>>> = new Map();
  private listenerCallbacks: Map<string, (data: any) => void> = new Map();
  private listenKeyMap: Map<MarketType, string> = new Map();
  private keepAliveTimers: Map<MarketType, NodeJS.Timeout> = new Map();
  private pingTimers: Map<MarketType, NodeJS.Timeout> = new Map();
  private activityTimers: Map<MarketType, NodeJS.Timeout> = new Map();
  private reconnectTimers: Map<MarketType, NodeJS.Timeout> = new Map();
  private lastActivityAt: Map<MarketType, number> = new Map();
  constructor(private config: WSConfig) {
    super();
    this.config = {
      autoReconnect: true,
      reconnectInterval: 5000,
      pingInterval: 180000,
      ...config,
    };
  }

  /** ==================== Public API ==================== */
  async start() {
    if (this.config.apiKey) {
      await this.initUserDataStream('spot');
      await this.initUserDataStream('futures');
    } else {
      this.connectMarket('spot');
      this.connectMarket('futures');
    }
  }

  stop() {
    this.wsMap.forEach((ws) => ws.close());
    this.keepAliveTimers.forEach((t) => clearInterval(t));
    this.pingTimers.forEach((t) => clearInterval(t));
    this.activityTimers.forEach((t) => clearInterval(t));
    this.reconnectTimers.forEach((t) => clearTimeout(t));
  }

  /** ==================== Subscribe / Unsubscribe ==================== */
  subscribe(
    market: MarketType = 'spot',
    stream: string,
    listenerId: string,
    callback: (data: any) => void,
  ) {
    this.listenerCallbacks.set(listenerId, callback);

    if (!this.subscriptions.has(market)) this.subscriptions.set(market, new Map());
    const marketSubs = this.subscriptions.get(market)!;

    if (!marketSubs.has(stream)) {
      marketSubs.set(stream, new Set());
      this.sendSubscribe(stream, market);
    }

    marketSubs.get(stream)!.add(listenerId);
  }

  unsubscribe(stream: string, listenerId: string, market: MarketType = 'spot') {
    const marketSubs = this.subscriptions.get(market);
    if (!marketSubs) return;

    const listeners = marketSubs.get(stream);
    if (!listeners) return;

    listeners.delete(listenerId);
    this.listenerCallbacks.delete(listenerId);

    if (listeners.size === 0) {
      this.sendUnsubscribe(stream, market);
      marketSubs.delete(stream);
    }
  }

  /** ==================== Internal ==================== */
  private getWsUrl(market: MarketType, listenKey?: string) {
    const isSpot = market === 'spot';
    const net = this.config.network;

    if (listenKey) {
      if (isSpot)
        return net === 'testnet'
          ? `wss://testnet.binance.vision/ws/${listenKey}`
          : `wss://stream.binance.com/ws/${listenKey}`;
      else
        // Updated April 2026: Use new /private endpoint with explicit events subscription.
        // The old wss://fstream.binance.com/ws/<listenKey> was decommissioned on 2026-04-23.
        return net === 'testnet'
          ? `wss://stream.binancefuture.com/ws/${listenKey}`
          : `wss://fstream.binance.com/private/ws?listenKey=${listenKey}&events=ORDER_TRADE_UPDATE/ACCOUNT_UPDATE/MARGIN_CALL/ACCOUNT_CONFIG_UPDATE/STRATEGY_UPDATE/GRID_UPDATE/CONDITIONAL_ORDER_TRIGGER_REJECT/listenKeyExpired`;
    }

    if (isSpot)
      return net === 'testnet'
        ? 'wss://testnet.binance.vision/ws'
        : // 'wss://itrade.ihsueh.com/spots/stream';
          'wss://stream.binance.com/stream';
    else
      // Updated April 2026: Use new /market endpoint for regular market data streams.
      // The old wss://fstream.binance.com/stream was decommissioned on 2026-04-23.
      return net === 'testnet'
        ? 'wss://stream.binancefuture.com/stream'
        : // 'wss://itrade.ihsueh.com/futures/stream';
          'wss://fstream.binance.com/market/stream';
  }

  /** ==================== User Data Stream ==================== */
  private async initUserDataStream(market: MarketType) {
    if (!this.config.apiKey) return;

    const url =
      market === 'spot'
        ? this.config.network === 'testnet'
          ? 'https://testnet.binance.vision/api/v3/userDataStream'
          : 'https://api.binance.com/api/v3/userDataStream'
        : this.config.network === 'testnet'
          ? 'https://testnet.binancefuture.com/fapi/v1/listenKey'
          : 'https://fapi.binance.com/fapi/v1/listenKey';

    try {
      const resp = await axios.post(url, undefined, {
        headers: { 'X-MBX-APIKEY': this.config.apiKey },
      });
      const key = resp.data.listenKey;
      this.listenKeyMap.set(market, key);

      // Clear existing timer if any
      if (this.keepAliveTimers.has(market)) {
        clearInterval(this.keepAliveTimers.get(market));
        this.keepAliveTimers.delete(market);
      }

      const interval = market === 'spot' ? 20 * 60 * 1000 : 30 * 60 * 1000;
      const timer = setInterval(() => this.keepAliveListenKey(market), interval);
      this.keepAliveTimers.set(market, timer);

      this.connectMarket(market, key); // User Data Stream WS
    } catch {
      // noop
    }
  }

  private async keepAliveListenKey(market: MarketType) {
    const key = this.listenKeyMap.get(market);
    if (!key) return;

    const url =
      market === 'spot'
        ? this.config.network === 'testnet'
          ? `https://testnet.binance.vision/api/v3/userDataStream?listenKey=${key}`
          : `https://api.binance.com/api/v3/userDataStream?listenKey=${key}`
        : this.config.network === 'testnet'
          ? `https://testnet.binancefuture.com/fapi/v1/listenKey?listenKey=${key}`
          : `https://fapi.binance.com/fapi/v1/listenKey?listenKey=${key}`;

    try {
      await axios.put(url, undefined, {
        headers: { 'X-MBX-APIKEY': this.config.apiKey },
      });
    } catch {
      // noop
    }
  }

  /** ==================== WebSocket Connect ==================== */
  private connectMarket(market: MarketType, listenKey?: string) {
    const wsUrl = this.getWsUrl(market, listenKey);
    const ws = new WebSocket(wsUrl);
    this.wsMap.set(market, ws);

    ws.on('open', () => {
      this.lastActivityAt.set(market, Date.now());
      this.startPing(ws, market);
      this.startActivityMonitor(ws, market);
      this.resubscribeAll(market);
    });
    ws.on('pong', () => this.lastActivityAt.set(market, Date.now()));
    ws.on('ping', () => ws.pong());
    ws.on('message', (msg) => this.handleMessage(msg, market));
    ws.on('close', () => this.handleClose(market));
    ws.on('error', () => undefined);
  }

  private startPing(ws: WebSocket, market: MarketType) {
    if (market !== 'futures') return;
    const timer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN && market === 'futures') ws.ping();
    }, this.config.pingInterval!);
    this.pingTimers.set(market, timer);
  }

  private startActivityMonitor(ws: WebSocket, market: MarketType) {
    const timer = setInterval(() => {
      const lastActivity = this.lastActivityAt.get(market) ?? 0;
      const now = Date.now();
      const staleThreshold = (this.config.pingInterval ?? 180000) * 2;
      if (lastActivity && now - lastActivity > staleThreshold) {
        ws.terminate();
      }
    }, this.config.pingInterval ?? 180000);
    this.activityTimers.set(market, timer);
  }

  /** ==================== Subscribe/Unsubscribe ==================== */
  private sendSubscribe(stream: string, market: MarketType) {
    const ws = this.wsMap.get(market);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ method: 'SUBSCRIBE', params: [stream], id: Date.now() }));
    }
  }

  private sendUnsubscribe(stream: string, market: MarketType) {
    const ws = this.wsMap.get(market);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({ method: 'UNSUBSCRIBE', params: [stream], id: Date.now() }),
      );
    }
  }

  private resubscribeAll(market: MarketType) {
    const marketSubs = this.subscriptions.get(market);
    if (!marketSubs) return;

    for (const stream of marketSubs.keys()) {
      this.sendSubscribe(stream, market);
    }
  }

  /** ==================== Message Handling ==================== */
  private handleMessage(msg: WebSocket.Data, market: MarketType) {
    let data: any;
    try {
      this.lastActivityAt.set(market, Date.now());
      data = JSON.parse(msg.toString());
    } catch {
      return;
    }

    this.emit('data', data);

    // Handle user data stream events
    const eventType = data.e;

    // Debug logging for user data events
    // Order updates
    if (eventType === 'executionReport' || eventType === 'ORDER_TRADE_UPDATE') {
      this.emit(`${market}:orderUpdate`, data);
    }
    // Spot account balance updates
    else if (eventType === 'outboundAccountPosition') {
      this.emit(`${market}:accountUpdate`, data);
    }
    // Spot individual balance changes
    else if (eventType === 'balanceUpdate') {
      this.emit(`${market}:accountUpdate`, data);
    }
    // Futures account updates (includes both balance and positions)
    else if (eventType === 'ACCOUNT_UPDATE') {
      this.emit(`${market}:accountUpdate`, data);
    }
    // Listen key expired warning
    else if (eventType === 'listenKeyExpired') {
      this.initUserDataStream(market).catch(() => undefined);
    }

    const stream = data.stream;
    const marketSubs = this.subscriptions.get(market);
    if (stream && marketSubs?.has(stream)) {
      for (const listenerId of marketSubs.get(stream)!) {
        const cb = this.listenerCallbacks.get(listenerId);
        cb?.(data);
      }
      this.emit(`${market}:${stream}` as keyof BinanceWebsocketEventMap, data);
    }
  }

  private handleClose(market: MarketType) {
    this.emit('disconnected', market);
    const activityTimer = this.activityTimers.get(market);
    if (activityTimer) clearInterval(activityTimer);
    this.activityTimers.delete(market);

    // Stop keep-alive timer since connection is dead
    const keepAliveTimer = this.keepAliveTimers.get(market);
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      this.keepAliveTimers.delete(market);
    }

    if (this.config.autoReconnect) {
      const timer = setTimeout(() => {
        // If we had a listen key, we must re-initialize to get a fresh one
        if (this.listenKeyMap.has(market)) {
          this.initUserDataStream(market).catch(() => undefined);
        } else {
          this.connectMarket(market);
        }
      }, this.config.reconnectInterval);
      this.reconnectTimers.set(market, timer);
    }
  }
}
