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

const defaultLogger: Logger = {
  info: console.log,
  debug: console.debug,
  warn: console.warn,
  error: console.error,
};

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
  private reconnectTimers: Map<MarketType, NodeJS.Timeout> = new Map();
  private logger: Logger;

  constructor(private config: WSConfig) {
    super();
    this.config = {
      autoReconnect: true,
      reconnectInterval: 5000,
      pingInterval: 180000,
      ...config,
    };
    this.logger = config.logger || defaultLogger;
  }

  /** ==================== Public API ==================== */
  async start() {
    if (this.config.apiKey) {
      await this.initUserDataStream('spot');
      await this.initUserDataStream('futures');
    }
    this.connectMarket('spot');
    this.connectMarket('futures');
  }

  stop() {
    this.wsMap.forEach((ws) => ws.close());
    this.keepAliveTimers.forEach((t) => clearInterval(t));
    this.pingTimers.forEach((t) => clearInterval(t));
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
        return net === 'testnet'
          ? `wss://stream.binancefuture.com/ws/${listenKey}`
          : `wss://fstream.binance.com/ws/${listenKey}`;
    }

    if (isSpot)
      return net === 'testnet'
        ? 'wss://testnet.binance.vision/ws'
        : // 'wss://itrade.ihsueh.com/spots/stream';
          'wss://stream.binance.com/stream';
    else
      return net === 'testnet'
        ? 'wss://stream.binancefuture.com/stream'
        : // 'wss://itrade.ihsueh.com/futures/stream';
          'wss://fstream.binance.com/stream';
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

      const interval = market === 'spot' ? 20 * 60 * 1000 : 30 * 60 * 1000;
      const timer = setInterval(() => this.keepAliveListenKey(market), interval);
      this.keepAliveTimers.set(market, timer);

      this.connectMarket(market, key); // User Data Stream WS
      this.logger.info(`[WS][${market}] UserDataStream initialized`);
    } catch (err) {
      this.logger.error(`[WS][${market}] UserDataStream init failed`, err);
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
      this.logger.debug?.(`[WS][${market}] keepalive success`);
    } catch (err) {
      this.logger.error(`[WS][${market}] keepalive failed`, err);
    }
  }

  /** ==================== WebSocket Connect ==================== */
  private connectMarket(market: MarketType, listenKey?: string) {
    const wsUrl = this.getWsUrl(market, listenKey);
    console.log(market, ':', wsUrl);
    const ws = new WebSocket(wsUrl);
    this.wsMap.set(market, ws);

    ws.on('open', () => {
      this.logger.info(`[WS][${market}] Connected`);
      this.startPing(ws, market);
      this.resubscribeAll(market);
    });
    ws.on('ping', () => ws.pong());
    ws.on('message', (msg) => this.handleMessage(msg, market));
    ws.on('close', () => this.handleClose(market));
    ws.on('error', (err) => this.logger.error(`[WS][${market}] Error`, err));
  }

  private startPing(ws: WebSocket, market: MarketType) {
    if (market !== 'futures') return;
    const timer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN && market === 'futures') ws.ping();
      this.logger.debug?.(`[WS][${market}] Ping`);
    }, this.config.pingInterval!);
    this.pingTimers.set(market, timer);
  }

  /** ==================== Subscribe/Unsubscribe ==================== */
  private sendSubscribe(stream: string, market: MarketType) {
    const ws = this.wsMap.get(market);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ method: 'SUBSCRIBE', params: [stream], id: Date.now() }));
      this.logger.info(`[WS][${market}] Subscribed: ${stream}`);
    }
  }

  private sendUnsubscribe(stream: string, market: MarketType) {
    const ws = this.wsMap.get(market);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({ method: 'UNSUBSCRIBE', params: [stream], id: Date.now() }),
      );
      this.logger.info(`[WS][${market}] Unsubscribed: ${stream}`);
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
      data = JSON.parse(msg.toString());
    } catch {
      return;
    }

    this.emit('data', data);

    // Handle user data stream events
    const eventType = data.e;

    // Debug logging for user data events
    if (eventType) {
      this.logger.debug?.(`[WS][${market}] Received event: ${eventType}`);
    }

    // Order updates
    if (eventType === 'executionReport' || eventType === 'ORDER_TRADE_UPDATE') {
      this.logger.info(`[WS][${market}] 📦 Order update received: ${eventType}`);
      this.emit(`${market}:orderUpdate`, data);
    }
    // Spot account balance updates
    else if (eventType === 'outboundAccountPosition') {
      this.logger.info(
        `[WS][${market}] 💰 Account balance update received (${data.B?.length || 0} assets)`,
      );
      this.emit(`${market}:accountUpdate`, data);
    }
    // Spot individual balance changes
    else if (eventType === 'balanceUpdate') {
      this.logger.info(`[WS][${market}] 💰 Balance update received for ${data.a}`);
      this.emit(`${market}:accountUpdate`, data);
    }
    // Futures account updates (includes both balance and positions)
    else if (eventType === 'ACCOUNT_UPDATE') {
      this.logger.info(
        `[WS][${market}] 💰 Account update received (${data.a?.B?.length || 0} balances, ${data.a?.P?.length || 0} positions)`,
      );
      this.emit(`${market}:accountUpdate`, data);
    }
    // Listen key expired warning
    else if (eventType === 'listenKeyExpired') {
      this.logger.warn?.(`[WS][${market}] Listen key expired! Reinitializing...`);
      this.initUserDataStream(market).catch((err) => {
        this.logger.error(`[WS][${market}] Failed to reinitialize user data stream`, err);
      });
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
    this.logger.warn?.(`[WS][${market}] Connection closed`);
    this.emit('disconnected', market);

    if (this.config.autoReconnect) {
      const timer = setTimeout(
        () => this.connectMarket(market),
        this.config.reconnectInterval,
      );
      this.reconnectTimers.set(market, timer);
    }
  }
}
