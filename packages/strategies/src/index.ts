// Strategies
export { MovingAverageStrategy } from './strategies/MovingAverageStrategy';
export type { MovingAverageParameters } from './strategies/MovingAverageStrategy';

// Strategy Factory & Registry - 策略工厂和注册表
export {
  getImplementedStrategies,
  getUnimplementedStrategies,
  isStrategyImplemented,
  getStrategyConstructor,
  createStrategyInstance,
  getAllStrategiesWithImplementationStatus,
  getImplementationStats,
  validateStrategyImplementations,
  IMPLEMENTED_STRATEGIES,
} from './registry/strategy-factory';
export type {
  StrategyConstructor,
  StrategyImplementationInfo,
} from './registry/strategy-factory';

// Re-export from core for convenience
export {
  BaseStrategy,
  type IStrategy,
  type StrategyParameters,
  type StrategyResult,
} from '@itrade/core';
