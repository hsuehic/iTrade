// Types and Interfaces
export * from './types';
export * from './interfaces';
export type {
  ISubscriptionCoordinator,
  ISubscriptionObserver,
  SubscriptionInfo as CoordinatorSubscriptionInfo,
} from './interfaces/ISubscriptionCoordinator';

// Core Engine
export { TradingEngine } from './engine/TradingEngine';

// Models
export { BaseStrategy } from './models/BaseStrategy';
export { OrderManager } from './models/OrderManager';
export { OrderSyncService } from './models/OrderSyncService';
export type {
  OrderSyncConfig,
  OrderSyncStats,
  IOrderDataManager,
} from './models/OrderSyncService';

// Services
export { AccountPollingService } from './services/AccountPollingService';
export type {
  AccountPollingConfig,
  PollingResult,
  AccountSnapshotData,
} from './services/AccountPollingService';

// Events
export { EVENTS, EventBus } from './events';
export type {
  TickerUpdateEvent,
  OrderBookUpdateEvent,
  TradeUpdateEvent,
  KlineUpdateEvent,
  OrderEventData,
  BalanceUpdateEvent,
  PositionUpdateEvent,
  StrategySignalEvent,
  RiskEvent,
  EngineEvent,
  ExchangeEvent,
} from './events';

// Strategy Registry - 策略配置中心
export {
  STRATEGY_REGISTRY,
  getImplementedStrategies,
  getAllStrategyTypes,
  getStrategyConfig,
  getStrategyDefaultParameters,
  isValidStrategyType,
  getStrategiesByCategory,
} from './config/strategy-registry';
export type {
  StrategyTypeKey,
  StrategyConfig,
  StrategyParameterDefinition,
} from './config/strategy-registry';

// Strategy State Management & Monitoring
export { StrategyStateManager } from './models/StrategyStateManager';
export { StrategyStateMonitor } from './monitoring/StrategyStateMonitor';
export { TypeOrmStrategyStateAdapter } from './adapters/TypeOrmStrategyStateAdapter';
export type {
  StateRecoveryMetrics,
  StrategyHealthStatus,
} from './monitoring/StrategyStateMonitor';
export type { StrategyRecoveryResult } from './models/StrategyStateManager';

// Subscription Management
export { SubscriptionCoordinator } from './engine/SubscriptionCoordinator';
export { SubscriptionManager } from './engine/SubscriptionManager'; // Legacy

// Utilities
export { PrecisionUtils } from './utils/PrecisionUtils';
