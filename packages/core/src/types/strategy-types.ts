/**
 * 🎯 Core Strategy Type System
 *
 * This file contains ONLY the fundamental types needed by the core trading engine.
 * Strategy-specific types (ParameterDefinition, StrategyRegistryConfig, etc.)
 * are defined in @itrade/strategies package.
 *
 * Core types:
 * - StrategyParameters: Base interface for strategy parameters
 * - StrategyRuntimeContext: System-provided metadata (symbol, exchange, logger)
 * - StrategyConfig<TParams>: Complete configuration (parameters + context)
 */

import type { ILogger } from '../interfaces';
import type { SubscriptionConfig, InitialDataConfig, InitialDataResult } from '.';

/**
 * 📦 Base Strategy Parameters
 * Each strategy extends this with its own specific parameters
 */
export interface StrategyParameters {
  [key: string]: unknown;
}

/**
 * 🔧 Strategy Runtime Context
 * System-provided metadata, same for all strategies
 */
export interface StrategyRuntimeContext {
  // Required
  symbol: string;
  exchange: string | string[];

  // Optional metadata
  strategyId?: number;
  strategyName?: string;
  logger?: ILogger;

  // System-injected
  subscription?: SubscriptionConfig;
  initialData?: InitialDataConfig;
  loadedInitialData?: InitialDataResult;
}

/**
 * 🎯 Complete Strategy Configuration
 * Generic type combining parameters and runtime context
 */
export type StrategyConfig<TParams extends StrategyParameters = StrategyParameters> =
  StrategyRuntimeContext & {
    type: string; // Strategy type/class name
    parameters: TParams; // Strategy-specific parameters
  };
