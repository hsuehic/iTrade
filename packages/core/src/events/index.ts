import { EventEmitter } from 'events';

import {
  Order,
  Position,
  Balance,
  Ticker,
  OrderBook,
  Trade,
  Kline,
} from '../types';

// Event names
export const EVENTS = {
  // Market Data Events
  TICKER_UPDATE: 'ticker_update',
  ORDERBOOK_UPDATE: 'orderbook_update',
  TRADE_UPDATE: 'trade_update',
  KLINE_UPDATE: 'kline_update',

  // Order Events
  ORDER_CREATED: 'order_created',
  ORDER_FILLED: 'order_filled',
  ORDER_PARTIALLY_FILLED: 'order_partially_filled',
  ORDER_CANCELLED: 'order_cancelled',
  ORDER_REJECTED: 'order_rejected',

  // Account Events
  BALANCE_UPDATE: 'balance_update',
  POSITION_UPDATE: 'position_update',

  // Strategy Events
  STRATEGY_SIGNAL: 'strategy_signal',
  STRATEGY_ERROR: 'strategy_error',

  // Risk Events
  RISK_LIMIT_EXCEEDED: 'risk_limit_exceeded',
  EMERGENCY_STOP: 'emergency_stop',

  // Engine Events
  ENGINE_STARTED: 'engine_started',
  ENGINE_STOPPED: 'engine_stopped',
  ENGINE_ERROR: 'engine_error',

  // Connection Events
  EXCHANGE_CONNECTED: 'exchange_connected',
  EXCHANGE_DISCONNECTED: 'exchange_disconnected',
  EXCHANGE_ERROR: 'exchange_error',
} as const;

// Event interfaces
export interface TickerUpdateEvent {
  symbol: string;
  ticker: Ticker;
  timestamp: Date;
}

export interface OrderBookUpdateEvent {
  symbol: string;
  orderbook: OrderBook;
  timestamp: Date;
}

export interface TradeUpdateEvent {
  symbol: string;
  trade: Trade;
  timestamp: Date;
}

export interface KlineUpdateEvent {
  symbol: string;
  kline: Kline;
  timestamp: Date;
}

export interface OrderEventData {
  order: Order;
  timestamp: Date;
}

export interface BalanceUpdateEvent {
  balances: Balance[];
  timestamp: Date;
}

export interface PositionUpdateEvent {
  positions: Position[];
  timestamp: Date;
}

export interface StrategySignalEvent {
  exchange?: string; // to execute order on this exchange, if set
  strategyName: string;
  symbol: string;
  action: 'buy' | 'sell' | 'hold';
  quantity?: number;
  price?: number;
  confidence?: number;
  reason?: string;
  timestamp: Date;
}

export interface RiskEvent {
  type: 'position_limit' | 'daily_loss' | 'drawdown' | 'leverage';
  symbol?: string;
  currentValue: number;
  limitValue: number;
  severity: 'warning' | 'critical';
  timestamp: Date;
}

export interface EngineEvent {
  message: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface ExchangeEvent {
  exchangeName: string;
  message: string;
  error?: Error;
  timestamp: Date;
}

// Event bus for cross-package communication
export class EventBus extends EventEmitter {
  private static instance: EventBus;

  private constructor() {
    super();
    this.setMaxListeners(100); // Allow many listeners
  }

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  // Typed emit methods
  public emitTickerUpdate(data: TickerUpdateEvent): boolean {
    return this.emit(EVENTS.TICKER_UPDATE, data);
  }

  public emitOrderBookUpdate(data: OrderBookUpdateEvent): boolean {
    return this.emit(EVENTS.ORDERBOOK_UPDATE, data);
  }

  public emitTradeUpdate(data: TradeUpdateEvent): boolean {
    return this.emit(EVENTS.TRADE_UPDATE, data);
  }

  public emitKlineUpdate(data: KlineUpdateEvent): boolean {
    return this.emit(EVENTS.KLINE_UPDATE, data);
  }

  public emitOrderCreated(data: OrderEventData): boolean {
    return this.emit(EVENTS.ORDER_CREATED, data);
  }

  public emitOrderFilled(data: OrderEventData): boolean {
    return this.emit(EVENTS.ORDER_FILLED, data);
  }

  public emitOrderPartiallyFilled(data: OrderEventData): boolean {
    return this.emit(EVENTS.ORDER_PARTIALLY_FILLED, data);
  }

  public emitOrderCancelled(data: OrderEventData): boolean {
    return this.emit(EVENTS.ORDER_CANCELLED, data);
  }

  public emitOrderRejected(data: OrderEventData): boolean {
    return this.emit(EVENTS.ORDER_REJECTED, data);
  }

  public emitBalanceUpdate(data: BalanceUpdateEvent): boolean {
    return this.emit(EVENTS.BALANCE_UPDATE, data);
  }

  public emitPositionUpdate(data: PositionUpdateEvent): boolean {
    return this.emit(EVENTS.POSITION_UPDATE, data);
  }

  public emitStrategySignal(data: StrategySignalEvent): boolean {
    return this.emit(EVENTS.STRATEGY_SIGNAL, data);
  }

  public emitStrategyError(strategyName: string, error: Error): boolean {
    return this.emit(EVENTS.STRATEGY_ERROR, {
      strategyName,
      error,
      timestamp: new Date(),
    });
  }

  public emitRiskLimitExceeded(data: RiskEvent): boolean {
    return this.emit(EVENTS.RISK_LIMIT_EXCEEDED, data);
  }

  public emitEmergencyStop(reason: string): boolean {
    return this.emit(EVENTS.EMERGENCY_STOP, { reason, timestamp: new Date() });
  }

  public emitEngineStarted(): boolean {
    return this.emit(EVENTS.ENGINE_STARTED, {
      message: 'Trading engine started',
      timestamp: new Date(),
    });
  }

  public emitEngineStopped(): boolean {
    return this.emit(EVENTS.ENGINE_STOPPED, {
      message: 'Trading engine stopped',
      timestamp: new Date(),
    });
  }

  public emitEngineError(error: Error): boolean {
    return this.emit(EVENTS.ENGINE_ERROR, {
      message: 'Trading engine error',
      error,
      timestamp: new Date(),
    });
  }

  public emitExchangeConnected(exchangeName: string): boolean {
    return this.emit(EVENTS.EXCHANGE_CONNECTED, {
      exchangeName,
      message: 'Exchange connected',
      timestamp: new Date(),
    });
  }

  public emitExchangeDisconnected(exchangeName: string): boolean {
    return this.emit(EVENTS.EXCHANGE_DISCONNECTED, {
      exchangeName,
      message: 'Exchange disconnected',
      timestamp: new Date(),
    });
  }

  public emitExchangeError(exchangeName: string, error: Error): boolean {
    return this.emit(EVENTS.EXCHANGE_ERROR, {
      exchangeName,
      message: 'Exchange error',
      error,
      timestamp: new Date(),
    });
  }

  // Typed listener methods
  public onTickerUpdate(callback: (data: TickerUpdateEvent) => void): this {
    return this.on(EVENTS.TICKER_UPDATE, callback);
  }

  public onOrderBookUpdate(
    callback: (data: OrderBookUpdateEvent) => void
  ): this {
    return this.on(EVENTS.ORDERBOOK_UPDATE, callback);
  }

  public onTradeUpdate(callback: (data: TradeUpdateEvent) => void): this {
    return this.on(EVENTS.TRADE_UPDATE, callback);
  }

  public onKlineUpdate(callback: (data: KlineUpdateEvent) => void): this {
    return this.on(EVENTS.KLINE_UPDATE, callback);
  }

  public onOrderCreated(callback: (data: OrderEventData) => void): this {
    return this.on(EVENTS.ORDER_CREATED, callback);
  }

  public onOrderFilled(callback: (data: OrderEventData) => void): this {
    return this.on(EVENTS.ORDER_FILLED, callback);
  }

  public onOrderPartiallyFilled(
    callback: (data: OrderEventData) => void
  ): this {
    return this.on(EVENTS.ORDER_PARTIALLY_FILLED, callback);
  }

  public onOrderCancelled(callback: (data: OrderEventData) => void): this {
    return this.on(EVENTS.ORDER_CANCELLED, callback);
  }

  public onOrderRejected(callback: (data: OrderEventData) => void): this {
    return this.on(EVENTS.ORDER_REJECTED, callback);
  }

  public onBalanceUpdate(callback: (data: BalanceUpdateEvent) => void): this {
    return this.on(EVENTS.BALANCE_UPDATE, callback);
  }

  public onPositionUpdate(callback: (data: PositionUpdateEvent) => void): this {
    return this.on(EVENTS.POSITION_UPDATE, callback);
  }

  public onStrategySignal(callback: (data: StrategySignalEvent) => void): this {
    return this.on(EVENTS.STRATEGY_SIGNAL, callback);
  }

  public onRiskLimitExceeded(callback: (data: RiskEvent) => void): this {
    return this.on(EVENTS.RISK_LIMIT_EXCEEDED, callback);
  }

  public onEmergencyStop(
    callback: (data: { reason: string; timestamp: Date }) => void
  ): this {
    return this.on(EVENTS.EMERGENCY_STOP, callback);
  }
}
