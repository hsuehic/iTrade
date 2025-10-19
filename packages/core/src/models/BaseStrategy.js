import { EventEmitter } from 'events';
import { Decimal } from 'decimal.js';
export class BaseStrategy extends EventEmitter {
    name;
    _parameters = {};
    _isInitialized = false;
    // 🆕 State Management Properties
    _strategyId;
    _currentPosition = new Decimal(0);
    _averagePrice;
    _lastSignal;
    _lastSignalTime;
    _stateVersion = '1.0.0'; // Override in subclasses if needed
    constructor(name, parameters = {}) {
        super();
        this.name = name;
        this._parameters = { ...parameters };
    }
    get parameters() {
        return { ...this._parameters };
    }
    async initialize(parameters) {
        this._parameters = { ...parameters };
        await this.onInitialize();
        this._isInitialized = true;
        this.emit('initialized', this.name);
    }
    async onOrderFilled(order) {
        this.emit('orderFilled', order);
        // Override in derived classes for custom order handling
    }
    async onPositionChanged(position) {
        this.emit('positionChanged', position);
        // Override in derived classes for custom position handling
    }
    async cleanup() {
        this._isInitialized = false;
        await this.onCleanup();
        this.emit('cleanup', this.name);
    }
    // Protected methods for derived classes to override
    async onInitialize() {
        // Override in derived classes for custom initialization
    }
    async onCleanup() {
        // Override in derived classes for custom cleanup
    }
    // Utility methods for derived strategies
    getParameter(key, defaultValue) {
        const value = this._parameters[key];
        return value !== undefined ? value : defaultValue;
    }
    setParameter(key, value) {
        this._parameters[key] = value;
    }
    validateParameters(requiredParams) {
        const missing = requiredParams.filter((param) => !(param in this._parameters));
        if (missing.length > 0) {
            throw new Error(`Missing required parameters for strategy ${this.name}: ${missing.join(', ')}`);
        }
    }
    ensureInitialized() {
        if (!this._isInitialized) {
            throw new Error(`Strategy ${this.name} is not initialized`);
        }
    }
    // 🆕 State Management Methods Implementation
    /**
     * Save current strategy state - override in derived classes for custom state
     */
    async saveState() {
        return {
            strategyId: this._strategyId,
            internalState: await this.getInternalState(),
            indicatorData: await this.getIndicatorData(),
            lastSignal: this._lastSignal,
            signalTime: this._lastSignalTime,
            currentPosition: this._currentPosition.toString(),
            averagePrice: this._averagePrice?.toString(),
        };
    }
    /**
     * Restore strategy state from snapshot
     */
    async restoreState(snapshot) {
        this._strategyId = snapshot.strategyId;
        this._lastSignal = snapshot.lastSignal;
        this._lastSignalTime = snapshot.signalTime;
        if (snapshot.currentPosition) {
            this._currentPosition = new Decimal(snapshot.currentPosition);
        }
        if (snapshot.averagePrice) {
            this._averagePrice = new Decimal(snapshot.averagePrice);
        }
        // Restore custom state and indicators
        await this.setInternalState(snapshot.internalState);
        await this.setIndicatorData(snapshot.indicatorData);
        this.emit('stateRestored', { strategyId: this._strategyId, snapshot });
    }
    /**
     * Set recovery context for strategy restart
     */
    async setRecoveryContext(context) {
        this._strategyId = context.strategyId;
        if (context.savedState) {
            await this.restoreState(context.savedState);
        }
        // Handle open orders and position recovery
        if (context.totalPosition) {
            this._currentPosition = new Decimal(context.totalPosition);
        }
        await this.onRecoveryContextSet(context);
        this.emit('recoveryContextSet', context);
    }
    /**
     * Get state schema version for compatibility checking
     */
    getStateVersion() {
        return this._stateVersion;
    }
    // 🔧 Protected methods for derived classes to override
    /**
     * Override to provide custom internal state data
     */
    async getInternalState() {
        return {
            isInitialized: this._isInitialized,
            lastAnalysisTime: new Date(),
            // Add more internal state as needed
        };
    }
    /**
     * Override to restore custom internal state
     */
    async setInternalState(_state) {
        // Derived classes should implement custom state restoration
        // Base implementation is intentionally minimal
    }
    /**
     * Override to provide technical indicator data for state persistence
     */
    async getIndicatorData() {
        return {
        // Override in derived classes to save indicator state
        // e.g., moving averages, RSI values, price history, etc.
        };
    }
    /**
     * Override to restore technical indicator data
     */
    async setIndicatorData(_data) {
        // Override in derived classes to restore indicator state
    }
    /**
     * Override to handle recovery context setup
     */
    async onRecoveryContextSet(_context) {
        // Override in derived classes for custom recovery logic
    }
    // 🔧 Position and Signal Management Helpers
    /**
     * Update current position
     */
    updatePosition(position, averagePrice) {
        this._currentPosition = position;
        if (averagePrice) {
            this._averagePrice = averagePrice;
        }
        this.emit('positionUpdated', {
            position: position.toString(),
            averagePrice: averagePrice?.toString(),
        });
    }
    /**
     * Record trading signal
     */
    recordSignal(signal) {
        this._lastSignal = signal;
        this._lastSignalTime = new Date();
        this.emit('signalRecorded', { signal, time: this._lastSignalTime });
    }
    /**
     * Get current position
     */
    getCurrentPosition() {
        return this._currentPosition;
    }
    /**
     * Get average price
     */
    getAveragePrice() {
        return this._averagePrice;
    }
    /**
     * Get last signal
     */
    getLastSignal() {
        return {
            signal: this._lastSignal,
            time: this._lastSignalTime,
        };
    }
    /**
     * Set strategy ID (usually called by StrategyManager)
     */
    setStrategyId(id) {
        this._strategyId = id;
    }
    /**
     * Get strategy ID
     */
    getStrategyId() {
        return this._strategyId;
    }
}
//# sourceMappingURL=BaseStrategy.js.map