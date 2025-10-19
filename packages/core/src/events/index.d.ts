import { EventEmitter } from 'events';
import { Order, Position, Balance, Ticker, OrderBook, Trade, Kline } from '../types';
export declare const EVENTS: {
    readonly TICKER_UPDATE: "ticker_update";
    readonly ORDERBOOK_UPDATE: "orderbook_update";
    readonly TRADE_UPDATE: "trade_update";
    readonly KLINE_UPDATE: "kline_update";
    readonly ORDER_CREATED: "order_created";
    readonly ORDER_FILLED: "order_filled";
    readonly ORDER_PARTIALLY_FILLED: "order_partially_filled";
    readonly ORDER_CANCELLED: "order_cancelled";
    readonly ORDER_REJECTED: "order_rejected";
    readonly BALANCE_UPDATE: "balance_update";
    readonly POSITION_UPDATE: "position_update";
    readonly STRATEGY_SIGNAL: "strategy_signal";
    readonly STRATEGY_ERROR: "strategy_error";
    readonly RISK_LIMIT_EXCEEDED: "risk_limit_exceeded";
    readonly EMERGENCY_STOP: "emergency_stop";
    readonly ENGINE_STARTED: "engine_started";
    readonly ENGINE_STOPPED: "engine_stopped";
    readonly ENGINE_ERROR: "engine_error";
    readonly EXCHANGE_CONNECTED: "exchange_connected";
    readonly EXCHANGE_DISCONNECTED: "exchange_disconnected";
    readonly EXCHANGE_ERROR: "exchange_error";
};
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
    exchange?: string;
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
export declare class EventBus extends EventEmitter {
    private static instance;
    private constructor();
    static getInstance(): EventBus;
    emitTickerUpdate(data: TickerUpdateEvent): boolean;
    emitOrderBookUpdate(data: OrderBookUpdateEvent): boolean;
    emitTradeUpdate(data: TradeUpdateEvent): boolean;
    emitKlineUpdate(data: KlineUpdateEvent): boolean;
    emitOrderCreated(data: OrderEventData): boolean;
    emitOrderFilled(data: OrderEventData): boolean;
    emitOrderPartiallyFilled(data: OrderEventData): boolean;
    emitOrderCancelled(data: OrderEventData): boolean;
    emitOrderRejected(data: OrderEventData): boolean;
    emitBalanceUpdate(data: BalanceUpdateEvent): boolean;
    emitPositionUpdate(data: PositionUpdateEvent): boolean;
    emitStrategySignal(data: StrategySignalEvent): boolean;
    emitStrategyError(strategyName: string, error: Error): boolean;
    emitRiskLimitExceeded(data: RiskEvent): boolean;
    emitEmergencyStop(reason: string): boolean;
    emitEngineStarted(): boolean;
    emitEngineStopped(): boolean;
    emitEngineError(error: Error): boolean;
    emitExchangeConnected(exchangeName: string): boolean;
    emitExchangeDisconnected(exchangeName: string): boolean;
    emitExchangeError(exchangeName: string, error: Error): boolean;
    onTickerUpdate(callback: (data: TickerUpdateEvent) => void): this;
    onOrderBookUpdate(callback: (data: OrderBookUpdateEvent) => void): this;
    onTradeUpdate(callback: (data: TradeUpdateEvent) => void): this;
    onKlineUpdate(callback: (data: KlineUpdateEvent) => void): this;
    onOrderCreated(callback: (data: OrderEventData) => void): this;
    onOrderFilled(callback: (data: OrderEventData) => void): this;
    onOrderPartiallyFilled(callback: (data: OrderEventData) => void): this;
    onOrderCancelled(callback: (data: OrderEventData) => void): this;
    onOrderRejected(callback: (data: OrderEventData) => void): this;
    onBalanceUpdate(callback: (data: BalanceUpdateEvent) => void): this;
    onPositionUpdate(callback: (data: PositionUpdateEvent) => void): this;
    onStrategySignal(callback: (data: StrategySignalEvent) => void): this;
    onRiskLimitExceeded(callback: (data: RiskEvent) => void): this;
    onEmergencyStop(callback: (data: {
        reason: string;
        timestamp: Date;
    }) => void): this;
}
//# sourceMappingURL=index.d.ts.map