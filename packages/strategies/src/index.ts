// Strategies
export { MovingAverageStrategy } from './strategies/MovingAverageStrategy';
export type { MovingAverageParameters } from './strategies/MovingAverageStrategy';

// Re-export from core for convenience
export {
  BaseStrategy,
  type IStrategy,
  type StrategyParameters,
  type StrategyResult,
} from '@crypto-trading/core';
