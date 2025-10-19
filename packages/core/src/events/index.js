import { EventEmitter } from 'events';
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
};
// Event bus for cross-package communication
export class EventBus extends EventEmitter {
    static instance;
    constructor() {
        super();
        this.setMaxListeners(100); // Allow many listeners
    }
    static getInstance() {
        if (!EventBus.instance) {
            EventBus.instance = new EventBus();
        }
        return EventBus.instance;
    }
    // Typed emit methods
    emitTickerUpdate(data) {
        return this.emit(EVENTS.TICKER_UPDATE, data);
    }
    emitOrderBookUpdate(data) {
        return this.emit(EVENTS.ORDERBOOK_UPDATE, data);
    }
    emitTradeUpdate(data) {
        return this.emit(EVENTS.TRADE_UPDATE, data);
    }
    emitKlineUpdate(data) {
        return this.emit(EVENTS.KLINE_UPDATE, data);
    }
    emitOrderCreated(data) {
        return this.emit(EVENTS.ORDER_CREATED, data);
    }
    emitOrderFilled(data) {
        return this.emit(EVENTS.ORDER_FILLED, data);
    }
    emitOrderPartiallyFilled(data) {
        return this.emit(EVENTS.ORDER_PARTIALLY_FILLED, data);
    }
    emitOrderCancelled(data) {
        return this.emit(EVENTS.ORDER_CANCELLED, data);
    }
    emitOrderRejected(data) {
        return this.emit(EVENTS.ORDER_REJECTED, data);
    }
    emitBalanceUpdate(data) {
        return this.emit(EVENTS.BALANCE_UPDATE, data);
    }
    emitPositionUpdate(data) {
        return this.emit(EVENTS.POSITION_UPDATE, data);
    }
    emitStrategySignal(data) {
        return this.emit(EVENTS.STRATEGY_SIGNAL, data);
    }
    emitStrategyError(strategyName, error) {
        return this.emit(EVENTS.STRATEGY_ERROR, {
            strategyName,
            error,
            timestamp: new Date(),
        });
    }
    emitRiskLimitExceeded(data) {
        return this.emit(EVENTS.RISK_LIMIT_EXCEEDED, data);
    }
    emitEmergencyStop(reason) {
        return this.emit(EVENTS.EMERGENCY_STOP, { reason, timestamp: new Date() });
    }
    emitEngineStarted() {
        return this.emit(EVENTS.ENGINE_STARTED, {
            message: 'Trading engine started',
            timestamp: new Date(),
        });
    }
    emitEngineStopped() {
        return this.emit(EVENTS.ENGINE_STOPPED, {
            message: 'Trading engine stopped',
            timestamp: new Date(),
        });
    }
    emitEngineError(error) {
        return this.emit(EVENTS.ENGINE_ERROR, {
            message: 'Trading engine error',
            error,
            timestamp: new Date(),
        });
    }
    emitExchangeConnected(exchangeName) {
        return this.emit(EVENTS.EXCHANGE_CONNECTED, {
            exchangeName,
            message: 'Exchange connected',
            timestamp: new Date(),
        });
    }
    emitExchangeDisconnected(exchangeName) {
        return this.emit(EVENTS.EXCHANGE_DISCONNECTED, {
            exchangeName,
            message: 'Exchange disconnected',
            timestamp: new Date(),
        });
    }
    emitExchangeError(exchangeName, error) {
        return this.emit(EVENTS.EXCHANGE_ERROR, {
            exchangeName,
            message: 'Exchange error',
            error,
            timestamp: new Date(),
        });
    }
    // Typed listener methods
    onTickerUpdate(callback) {
        return this.on(EVENTS.TICKER_UPDATE, callback);
    }
    onOrderBookUpdate(callback) {
        return this.on(EVENTS.ORDERBOOK_UPDATE, callback);
    }
    onTradeUpdate(callback) {
        return this.on(EVENTS.TRADE_UPDATE, callback);
    }
    onKlineUpdate(callback) {
        return this.on(EVENTS.KLINE_UPDATE, callback);
    }
    onOrderCreated(callback) {
        return this.on(EVENTS.ORDER_CREATED, callback);
    }
    onOrderFilled(callback) {
        return this.on(EVENTS.ORDER_FILLED, callback);
    }
    onOrderPartiallyFilled(callback) {
        return this.on(EVENTS.ORDER_PARTIALLY_FILLED, callback);
    }
    onOrderCancelled(callback) {
        return this.on(EVENTS.ORDER_CANCELLED, callback);
    }
    onOrderRejected(callback) {
        return this.on(EVENTS.ORDER_REJECTED, callback);
    }
    onBalanceUpdate(callback) {
        return this.on(EVENTS.BALANCE_UPDATE, callback);
    }
    onPositionUpdate(callback) {
        return this.on(EVENTS.POSITION_UPDATE, callback);
    }
    onStrategySignal(callback) {
        return this.on(EVENTS.STRATEGY_SIGNAL, callback);
    }
    onRiskLimitExceeded(callback) {
        return this.on(EVENTS.RISK_LIMIT_EXCEEDED, callback);
    }
    onEmergencyStop(callback) {
        return this.on(EVENTS.EMERGENCY_STOP, callback);
    }
}
//# sourceMappingURL=index.js.map