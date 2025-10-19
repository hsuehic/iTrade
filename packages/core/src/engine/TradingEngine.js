import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { OrderSide, OrderType, DEFAULT_TICKER_CONFIG, DEFAULT_ORDERBOOK_CONFIG, DEFAULT_TRADES_CONFIG, DEFAULT_KLINES_CONFIG, } from '../types';
import { EventBus } from '../events';
import { SubscriptionManager } from './SubscriptionManager';
export class TradingEngine extends EventEmitter {
    riskManager;
    portfolioManager;
    logger;
    _isRunning = false;
    _strategies = new Map();
    _exchanges = new Map();
    _eventBus;
    subscriptionManager;
    constructor(riskManager, portfolioManager, logger) {
        super();
        this.riskManager = riskManager;
        this.portfolioManager = portfolioManager;
        this.logger = logger;
        this._eventBus = EventBus.getInstance();
        this.subscriptionManager = new SubscriptionManager(logger);
        this.setupEventListeners();
    }
    get isRunning() {
        return this._isRunning;
    }
    get strategies() {
        return new Map(this._strategies);
    }
    async start() {
        if (this._isRunning) {
            this.logger.warn('Trading engine is already running');
            return;
        }
        try {
            this.logger.info('Starting trading engine...');
            // Initialize all strategies
            for (const [name, strategy] of this._strategies) {
                try {
                    await strategy.initialize(strategy.parameters);
                    this.logger.info(`Strategy ${name} initialized successfully`);
                }
                catch (error) {
                    this.logger.error(`Failed to initialize strategy ${name}`, error);
                    throw error;
                }
            }
            // Connect to all exchanges
            for (const [name, exchange] of this._exchanges) {
                if (!exchange.isConnected) {
                    exchange.connect({
                        apiKey: '',
                        secretKey: '',
                        sandbox: false,
                    });
                    this.logger.warn(`Exchange ${name} is not connected`);
                }
            }
            // Auto-subscribe to all strategy data
            for (const [name, strategy] of this._strategies) {
                try {
                    await this.subscribeStrategyData(name, strategy);
                }
                catch (error) {
                    this.logger.error(`Failed to subscribe data for strategy ${name}`, error);
                    // Continue with other strategies
                }
            }
            this._isRunning = true;
            this._eventBus.emitEngineStarted();
            this.logger.info('Trading engine started successfully');
        }
        catch (error) {
            this._isRunning = false;
            this.logger.error('Failed to start trading engine', error);
            this._eventBus.emitEngineError(error);
            throw error;
        }
    }
    async stop() {
        if (!this._isRunning) {
            this.logger.warn('Trading engine is already stopped');
            return;
        }
        try {
            this.logger.info('Stopping trading engine...');
            // Cleanup all strategies
            for (const [name, strategy] of this._strategies) {
                try {
                    await strategy.cleanup();
                    this.logger.info(`Strategy ${name} cleaned up successfully`);
                }
                catch (error) {
                    this.logger.error(`Failed to cleanup strategy ${name}`, error);
                }
            }
            // Clear all subscriptions
            this.subscriptionManager.clear();
            this._isRunning = false;
            this._eventBus.emitEngineStopped();
            this.logger.info('Trading engine stopped successfully');
        }
        catch (error) {
            this.logger.error('Error stopping trading engine', error);
            this._eventBus.emitEngineError(error);
            throw error;
        }
    }
    async addStrategy(name, strategy) {
        if (this._strategies.has(name)) {
            throw new Error(`Strategy ${name} already exists`);
        }
        // Initialize the strategy before adding it
        await strategy.initialize(strategy.parameters);
        this._strategies.set(name, strategy);
        this.logger.info(`Added strategy: ${name}`);
        // Auto-subscribe to strategy data if engine is running
        if (this._isRunning) {
            await this.subscribeStrategyData(name, strategy);
        }
    }
    async removeStrategy(name) {
        if (!this._strategies.has(name)) {
            throw new Error(`Strategy ${name} does not exist`);
        }
        // Auto-unsubscribe strategy data
        await this.unsubscribeStrategyData(name);
        this._strategies.delete(name);
        this.logger.info(`Removed strategy: ${name}`);
    }
    getStrategy(name) {
        return this._strategies.get(name);
    }
    addExchange(name, exchange) {
        if (this._exchanges.has(name)) {
            throw new Error(`Exchange ${name} already exists`);
        }
        this._exchanges.set(name, exchange);
        this.setupExchangeListeners(exchange);
        this.logger.info(`Added exchange: ${name}`);
    }
    removeExchange(name) {
        const exchange = this._exchanges.get(name);
        if (!exchange) {
            throw new Error(`Exchange ${name} does not exist`);
        }
        exchange.removeAllListeners();
        this._exchanges.delete(name);
        this.logger.info(`Removed exchange: ${name}`);
    }
    /**
     * Process ticker data (recommended)
     */
    async onTicker(symbol, ticker, exchangeName) {
        if (!this._isRunning) {
            return;
        }
        try {
            // Add exchange info to ticker if provided
            if (exchangeName) {
                ticker.exchange = exchangeName;
            }
            // Process ticker with all strategies
            for (const [strategyName, strategy] of this._strategies) {
                try {
                    const result = await strategy.analyze({ ticker });
                    if (result.action !== 'hold') {
                        this._eventBus.emitStrategySignal({
                            strategyName,
                            symbol,
                            action: result.action,
                            quantity: result.quantity?.toNumber(),
                            price: result.price?.toNumber(),
                            confidence: result.confidence,
                            reason: result.reason,
                            timestamp: new Date(),
                        });
                        // Execute the strategy signal
                        await this.executeStrategySignal(strategyName, symbol, result);
                    }
                }
                catch (error) {
                    this.logger.error(`Error in strategy ${strategyName}`, error);
                    this._eventBus.emitStrategyError(strategyName, error);
                }
            }
        }
        catch (error) {
            this.logger.error('Error processing ticker data', error);
        }
    }
    /**
     * Process order book data (recommended)
     */
    async onOrderBook(symbol, orderbook, exchangeName) {
        if (!this._isRunning) {
            return;
        }
        try {
            // Add exchange info to orderbook if provided
            if (exchangeName) {
                orderbook.exchange = exchangeName;
            }
            // Process orderbook with all strategies
            for (const [strategyName, strategy] of this._strategies) {
                try {
                    const result = await strategy.analyze({ orderbook });
                    if (result.action !== 'hold') {
                        this._eventBus.emitStrategySignal({
                            strategyName,
                            symbol,
                            action: result.action,
                            quantity: result.quantity?.toNumber(),
                            price: result.price?.toNumber(),
                            confidence: result.confidence,
                            reason: result.reason,
                            timestamp: new Date(),
                        });
                        await this.executeStrategySignal(strategyName, symbol, result);
                    }
                }
                catch (error) {
                    this.logger.error(`Error in strategy ${strategyName}`, error);
                    this._eventBus.emitStrategyError(strategyName, error);
                }
            }
        }
        catch (error) {
            this.logger.error('Error processing orderbook data', error);
        }
    }
    /**
     * Process trades data (recommended)
     */
    async onTrades(symbol, trades, exchangeName) {
        if (!this._isRunning) {
            return;
        }
        try {
            // Add exchange info to trades if provided
            if (exchangeName) {
                trades.forEach((trade) => {
                    trade.exchange = exchangeName;
                });
            }
            // Process trades with all strategies
            for (const [strategyName, strategy] of this._strategies) {
                try {
                    const result = await strategy.analyze({ trades });
                    if (result.action !== 'hold') {
                        this._eventBus.emitStrategySignal({
                            strategyName,
                            symbol,
                            action: result.action,
                            quantity: result.quantity?.toNumber(),
                            price: result.price?.toNumber(),
                            confidence: result.confidence,
                            reason: result.reason,
                            timestamp: new Date(),
                        });
                        await this.executeStrategySignal(strategyName, symbol, result);
                    }
                }
                catch (error) {
                    this.logger.error(`Error in strategy ${strategyName}`, error);
                    this._eventBus.emitStrategyError(strategyName, error);
                }
            }
        }
        catch (error) {
            this.logger.error('Error processing trades data', error);
        }
    }
    /**
     * Process kline data (recommended)
     */
    async onKline(symbol, kline, exchangeName) {
        if (!this._isRunning) {
            return;
        }
        try {
            // Add exchange info to kline if provided
            if (exchangeName) {
                kline.exchange = exchangeName;
            }
            // Process kline with all strategies
            for (const [strategyName, strategy] of this._strategies) {
                try {
                    const result = await strategy.analyze({ klines: [kline] });
                    if (result.action !== 'hold') {
                        this._eventBus.emitStrategySignal({
                            strategyName,
                            symbol,
                            action: result.action,
                            quantity: result.quantity?.toNumber(),
                            price: result.price?.toNumber(),
                            confidence: result.confidence,
                            reason: result.reason,
                            timestamp: new Date(),
                        });
                        await this.executeStrategySignal(strategyName, symbol, result);
                    }
                }
                catch (error) {
                    this.logger.error(`Error in strategy ${strategyName}`, error);
                    this._eventBus.emitStrategyError(strategyName, error);
                }
            }
        }
        catch (error) {
            this.logger.error('Error processing kline data', error);
        }
    }
    /**
     * @deprecated Use specific methods like onTicker, onOrderBook, onTrades, onKline instead.
     * This method is kept for backward compatibility.
     */
    async onMarketData(symbol, data, exchangeName) {
        if (!this._isRunning) {
            return;
        }
        // Auto-detect data type and call appropriate method
        if (this.isTicker(data)) {
            return this.onTicker(symbol, data, exchangeName);
        }
        else if (this.isOrderBook(data)) {
            return this.onOrderBook(symbol, data, exchangeName);
        }
        else if (this.isKline(data)) {
            return this.onKline(symbol, data, exchangeName);
        }
        else if (Array.isArray(data) &&
            data.length > 0 &&
            this.isTrade(data[0])) {
            return this.onTrades(symbol, data, exchangeName);
        }
        // Fallback to old behavior for unknown data types
        try {
            if (exchangeName && data && typeof data === 'object') {
                data.exchange = exchangeName;
            }
            for (const [strategyName, strategy] of this._strategies) {
                try {
                    const result = await strategy.analyze({ ticker: data });
                    if (result.action !== 'hold') {
                        this._eventBus.emitStrategySignal({
                            strategyName,
                            symbol,
                            action: result.action,
                            quantity: result.quantity?.toNumber(),
                            price: result.price?.toNumber(),
                            confidence: result.confidence,
                            reason: result.reason,
                            timestamp: new Date(),
                        });
                        await this.executeStrategySignal(strategyName, symbol, result);
                    }
                }
                catch (error) {
                    this.logger.error(`Error in strategy ${strategyName}`, error);
                    this._eventBus.emitStrategyError(strategyName, error);
                }
            }
        }
        catch (error) {
            this.logger.error('Error processing market data', error);
        }
    }
    /**
     * Type guard for Ticker
     */
    isTicker(data) {
        return (data &&
            typeof data === 'object' &&
            'price' in data &&
            'volume' in data &&
            'timestamp' in data);
    }
    /**
     * Type guard for OrderBook
     */
    isOrderBook(data) {
        return (data &&
            typeof data === 'object' &&
            'bids' in data &&
            'asks' in data &&
            Array.isArray(data.bids) &&
            Array.isArray(data.asks));
    }
    /**
     * Type guard for Kline
     */
    isKline(data) {
        return (data &&
            typeof data === 'object' &&
            'open' in data &&
            'high' in data &&
            'low' in data &&
            'close' in data &&
            'interval' in data);
    }
    /**
     * Type guard for Trade
     */
    isTrade(data) {
        return (data &&
            typeof data === 'object' &&
            'id' in data &&
            'price' in data &&
            'quantity' in data &&
            'side' in data);
    }
    async executeOrder(params) {
        const { strategyName, symbol, side, quantity, type, price, stopPrice } = params;
        if (!this._isRunning) {
            throw new Error('Trading engine is not running');
        }
        // Get current positions and balances for risk checking
        const positions = await this.portfolioManager.getPositions();
        const balances = await this.portfolioManager.getBalances();
        // Create order object for risk checking
        const order = {
            id: uuidv4(),
            clientOrderId: `${strategyName}_${Date.now()}`,
            symbol,
            side,
            type,
            quantity,
            price,
            stopPrice,
            status: 'NEW',
            timeInForce: 'GTC',
            timestamp: new Date(),
        };
        // Check risk limits
        const riskCheckPassed = await this.riskManager.checkOrderRisk(order, positions, balances);
        if (!riskCheckPassed) {
            const error = new Error(`Order rejected by risk manager: ${JSON.stringify(order)}`);
            this.logger.error('Order rejected by risk manager', error, { order });
            throw error;
        }
        const strategy = this._strategies.get(strategyName);
        const exchangeName = strategy?.parameters.exchange;
        const isPointedExchange = !!exchangeName;
        // Find an available exchange to execute the order
        const exchange = !!isPointedExchange
            ? this._exchanges.get(exchangeName)
            : this.findExchangeForSymbol(symbol);
        if (!exchange) {
            throw new Error(isPointedExchange
                ? `Exchange ${exchangeName} not found`
                : `No exchange available for symbol ${symbol}`);
        }
        try {
            // Execute the order
            const executedOrder = await exchange.createOrder(symbol, side, type, quantity, price, stopPrice, 'GTC', order.clientOrderId);
            this._eventBus.emitOrderCreated({
                order: executedOrder,
                timestamp: new Date(),
            });
            this.logger.logTrade('Order executed', { order: executedOrder });
            return executedOrder;
        }
        catch (error) {
            this.logger.error('Failed to execute order', error, { order });
            throw error;
        }
    }
    async getPositions() {
        return await this.portfolioManager.getPositions();
    }
    async getPosition(symbol) {
        const positions = await this.getPositions();
        return positions.find((p) => p.symbol === symbol);
    }
    async executeStrategySignal(strategyName, symbol, signal) {
        if (signal.action === 'hold' || !signal.quantity) {
            return;
        }
        try {
            const orderType = signal.price ? OrderType.LIMIT : OrderType.MARKET;
            const side = signal.action === 'buy' ? OrderSide.BUY : OrderSide.SELL;
            await this.executeOrder({
                // exchange: exchangeName,
                strategyName,
                symbol,
                side,
                quantity: signal.quantity,
                type: orderType,
                price: signal.price,
                stopPrice: signal.stopLoss,
            });
            this.logger.logStrategy('Executed signal', {
                strategy: strategyName,
                symbol,
                action: signal.action,
                quantity: signal.quantity.toNumber(),
                price: signal.price?.toNumber(),
                confidence: signal.confidence,
                reason: signal.reason,
            });
        }
        catch (error) {
            this.logger.error(`Failed to execute strategy signal for ${strategyName}`, error, {
                symbol,
                signal,
            });
        }
    }
    findExchangeForSymbol(_symbol) {
        // Simple implementation - return the first connected exchange
        // In a real implementation, you might want to choose based on:
        // - Symbol availability
        // - Liquidity
        // - Fees
        // - Latency
        for (const exchange of this._exchanges.values()) {
            if (exchange.isConnected) {
                return exchange;
            }
        }
        return undefined;
    }
    setupEventListeners() {
        // Listen for risk events
        this._eventBus.onRiskLimitExceeded(async (data) => {
            this.logger.logRisk('Risk limit exceeded', data);
            if (data.severity === 'critical') {
                this.logger.warn('Critical risk limit exceeded, stopping engine');
                await this.stop();
            }
        });
        // Listen for emergency stop events
        this._eventBus.onEmergencyStop(async (data) => {
            this.logger.warn(`Emergency stop triggered: ${data.reason}`);
            await this.stop();
        });
    }
    setupExchangeListeners(exchange) {
        const exchangeName = exchange.name;
        // Listen for order updates
        exchange.on('order', (order) => {
            switch (order.status) {
                case 'FILLED':
                    this._eventBus.emitOrderFilled({ order, timestamp: new Date() });
                    this.notifyStrategiesOrderFilled(order);
                    break;
                case 'PARTIALLY_FILLED':
                    this._eventBus.emitOrderPartiallyFilled({
                        order,
                        timestamp: new Date(),
                    });
                    break;
                case 'CANCELED':
                    this._eventBus.emitOrderCancelled({ order, timestamp: new Date() });
                    break;
                case 'REJECTED':
                    this._eventBus.emitOrderRejected({ order, timestamp: new Date() });
                    break;
            }
        });
        // Listen for market data - use specific typed methods
        exchange.on('ticker', (symbol, ticker) => {
            this._eventBus.emitTickerUpdate({
                symbol,
                ticker,
                timestamp: new Date(),
            });
            this.onTicker(symbol, ticker, exchangeName);
        });
        exchange.on('orderbook', (symbol, orderbook) => {
            this._eventBus.emitOrderBookUpdate({
                symbol,
                orderbook,
                timestamp: new Date(),
            });
            this.onOrderBook(symbol, orderbook, exchangeName);
        });
        exchange.on('trade', (symbol, trade) => {
            // Single trade event - wrap in array for consistency
            this.onTrades(symbol, [trade], exchangeName);
        });
        exchange.on('kline', (symbol, kline) => {
            this.onKline(symbol, kline, exchangeName);
        });
    }
    async notifyStrategiesOrderFilled(order) {
        for (const [name, strategy] of this._strategies) {
            try {
                await strategy.onOrderFilled(order);
            }
            catch (error) {
                this.logger.error(`Error notifying strategy ${name} of order fill`, error);
            }
        }
    }
    /**
     * Auto-subscribe to strategy data
     */
    async subscribeStrategyData(strategyName, strategy) {
        const config = strategy.parameters.subscription;
        if (!config) {
            this.logger.debug(`Strategy ${strategyName} has no subscription config`);
            return;
        }
        const symbol = strategy.parameters.symbol;
        if (!symbol) {
            this.logger.warn(`Strategy ${strategyName} has subscription config but no symbol`);
            return;
        }
        const exchanges = this.getTargetExchanges(strategy.parameters.exchange);
        this.logger.info(`Auto-subscribing data for strategy ${strategyName} (symbol: ${symbol}, exchanges: ${exchanges.map((e) => e.name).join(', ')})`);
        for (const exchange of exchanges) {
            // Subscribe to ticker
            if (config.ticker) {
                await this.subscribeData(strategyName, exchange, symbol, 'ticker', config.ticker, config.method);
            }
            // Subscribe to orderbook
            if (config.orderbook) {
                await this.subscribeData(strategyName, exchange, symbol, 'orderbook', config.orderbook, config.method);
            }
            // Subscribe to trades
            if (config.trades) {
                await this.subscribeData(strategyName, exchange, symbol, 'trades', config.trades, config.method);
            }
            // Subscribe to klines
            if (config.klines) {
                await this.subscribeData(strategyName, exchange, symbol, 'klines', config.klines, config.method);
            }
        }
    }
    /**
     * Auto-unsubscribe strategy data
     */
    async unsubscribeStrategyData(strategyName) {
        const strategy = this._strategies.get(strategyName);
        if (!strategy || !strategy.parameters.subscription) {
            return;
        }
        const config = strategy.parameters.subscription;
        const symbol = strategy.parameters.symbol;
        if (!symbol)
            return;
        const exchanges = this.getTargetExchanges(config.exchange);
        this.logger.info(`Auto-unsubscribing data for strategy ${strategyName}`);
        for (const exchange of exchanges) {
            // Unsubscribe from ticker
            if (config.ticker) {
                await this.unsubscribeData(strategyName, exchange, symbol, 'ticker', config.ticker);
            }
            // Unsubscribe from orderbook
            if (config.orderbook) {
                await this.unsubscribeData(strategyName, exchange, symbol, 'orderbook', config.orderbook);
            }
            // Unsubscribe from trades
            if (config.trades) {
                await this.unsubscribeData(strategyName, exchange, symbol, 'trades', config.trades);
            }
            // Unsubscribe from klines
            if (config.klines) {
                await this.unsubscribeData(strategyName, exchange, symbol, 'klines', config.klines);
            }
        }
    }
    /**
     * Subscribe to specific data type
     */
    async subscribeData(strategyName, exchange, symbol, type, config, methodHint) {
        const normalizedConfig = this.normalizeDataConfig(type, config);
        const key = {
            exchange: exchange.name,
            symbol,
            type,
            params: normalizedConfig,
        };
        // Check if already subscribed
        if (this.subscriptionManager.hasSubscription(key)) {
            // Already subscribed, just add reference
            this.subscriptionManager.subscribe(strategyName, key, 'rest');
            return;
        }
        // Determine subscription method
        const method = this.determineSubscriptionMethod(methodHint || 'auto', exchange);
        if (method === 'websocket') {
            await this.subscribeViaWebSocket(exchange, symbol, type, normalizedConfig);
            this.subscriptionManager.subscribe(strategyName, key, 'websocket');
        }
        else {
            const timerId = await this.subscribeViaREST(exchange, symbol, type, normalizedConfig);
            this.subscriptionManager.subscribe(strategyName, key, 'rest', timerId);
        }
    }
    /**
     * Unsubscribe from specific data type
     */
    async unsubscribeData(strategyName, exchange, symbol, type, config) {
        // Normalize config to match what was used during subscription
        const normalizedConfig = this.normalizeDataConfig(type, config);
        const key = {
            exchange: exchange.name,
            symbol,
            type,
            params: normalizedConfig, // ✅ Include params to match subscription key
        };
        const result = this.subscriptionManager.unsubscribe(strategyName, key);
        if (result.shouldCancel) {
            // Cancel the subscription
            if (result.timerId) {
                clearInterval(result.timerId);
            }
            // Note: Most exchanges don't support WebSocket unsubscribe
            this.logger.info(`Cancelled subscription: ${exchange.name} ${symbol} ${type}`);
        }
        else {
            this.logger.debug(`Kept subscription (still used by other strategies): ${exchange.name} ${symbol} ${type}`);
        }
    }
    /**
     * Subscribe via WebSocket
     */
    async subscribeViaWebSocket(exchange, symbol, type, config) {
        try {
            switch (type) {
                case 'ticker':
                    await exchange.subscribeToTicker(symbol);
                    break;
                case 'orderbook':
                    await exchange.subscribeToOrderBook(symbol);
                    break;
                case 'trades':
                    await exchange.subscribeToTrades(symbol);
                    break;
                case 'klines':
                    const interval = config.interval || '1m';
                    await exchange.subscribeToKlines(symbol, interval);
                    break;
            }
            this.logger.info(`Subscribed via WebSocket: ${exchange.name} ${symbol} ${type}`);
        }
        catch (error) {
            this.logger.error(`Failed to subscribe via WebSocket: ${exchange.name} ${symbol} ${type}`, error);
            throw error;
        }
    }
    /**
     * Subscribe via REST polling
     */
    async subscribeViaREST(exchange, symbol, type, config) {
        const interval = this.getPollingInterval(type, config);
        this.logger.info(`Subscribing via REST polling: ${exchange.name} ${symbol} ${type} (interval: ${interval}ms)`);
        const timerId = setInterval(async () => {
            try {
                switch (type) {
                    case 'ticker':
                        const ticker = await exchange.getTicker(symbol);
                        await this.onTicker(symbol, ticker, exchange.name);
                        break;
                    case 'orderbook':
                        const depth = config.depth || 20;
                        const orderbook = await exchange.getOrderBook(symbol, depth);
                        await this.onOrderBook(symbol, orderbook, exchange.name);
                        break;
                    case 'trades':
                        const limit = config.limit || 10;
                        const trades = await exchange.getTrades(symbol, limit);
                        await this.onTrades(symbol, trades, exchange.name);
                        break;
                    case 'klines':
                        const klineInterval = config.interval || '1m';
                        const klineLimit = config.limit || 1;
                        const klines = await exchange.getKlines(symbol, klineInterval, undefined, undefined, klineLimit);
                        if (klines.length > 0) {
                            await this.onKline(symbol, klines[0], exchange.name);
                        }
                        break;
                }
            }
            catch (error) {
                this.logger.error(`Failed to poll ${type} for ${symbol} on ${exchange.name}:`, error);
            }
        }, interval);
        return timerId;
    }
    /**
     * Determine subscription method
     */
    determineSubscriptionMethod(hint, exchange) {
        if (hint === 'rest') {
            return 'rest';
        }
        if (hint === 'websocket') {
            return 'websocket';
        }
        // Auto: prefer WebSocket if connected
        if (exchange.isConnected) {
            return 'websocket';
        }
        return 'rest';
    }
    /**
     * Get target exchanges based on config
     */
    getTargetExchanges(exchangeName) {
        if (exchangeName) {
            const exchange = this._exchanges.get(exchangeName);
            if (!exchange) {
                this.logger.warn(`Exchange ${exchangeName} not found, using all exchanges`);
                return Array.from(this._exchanges.values());
            }
            return [exchange];
        }
        // No specific exchange, use all connected exchanges
        return Array.from(this._exchanges.values());
    }
    /**
     * Normalize data config
     */
    normalizeDataConfig(type, config) {
        if (typeof config === 'boolean') {
            // Use default config
            switch (type) {
                case 'ticker':
                    return DEFAULT_TICKER_CONFIG;
                case 'orderbook':
                    return DEFAULT_ORDERBOOK_CONFIG;
                case 'trades':
                    return DEFAULT_TRADES_CONFIG;
                case 'klines':
                    return DEFAULT_KLINES_CONFIG;
            }
        }
        return config;
    }
    /**
     * Get polling interval for REST
     */
    getPollingInterval(type, config) {
        if (config.interval !== undefined) {
            return config.interval;
        }
        if (config.pollInterval !== undefined) {
            return config.pollInterval;
        }
        // Default intervals
        switch (type) {
            case 'ticker':
                return 5000; // 1 second
            case 'orderbook':
                return 500; // 0.5 seconds
            case 'trades':
                return 5000; // 1 second
            case 'klines':
                return 60000; // 1 minute
            default:
                return 5000;
        }
    }
    /**
     * Get subscription statistics
     */
    getSubscriptionStats() {
        return this.subscriptionManager.getStats();
    }
}
//# sourceMappingURL=TradingEngine.js.map