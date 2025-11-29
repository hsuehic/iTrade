import { StrategyParameters } from '@itrade/core';

/**
 * 🎨 Parameter Definition for UI Generation
 * Describes how a parameter should be displayed and validated in the UI
 */
export interface ParameterDefinition<T = unknown> {
  name: string;
  type: 'number' | 'string' | 'boolean' | 'object' | 'enum' | 'range';
  description: string;
  defaultValue: T;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  validation?: {
    pattern?: string;
    options?: string[];
  };
  unit?: string;
  group?: string; // UI grouping
  order?: number; // UI ordering
}

/**
 * 🔔 Subscription Requirements Definition
 * Defines what market data subscriptions a strategy needs
 */
export interface SubscriptionRequirements {
  // Klines configuration
  klines?: {
    required: boolean; // Is klines data required for this strategy?
    allowMultipleIntervals: boolean; // Can strategy use multiple intervals?
    defaultIntervals?: string[]; // Default intervals (e.g., ['15m'])
    fixedIntervals?: string[]; // If set, user cannot change intervals
    intervalsEditable?: boolean; // Allow user to select different intervals? (default: true)
    description?: string; // Description for UI
  };

  // Ticker configuration
  ticker?: {
    required: boolean;
    editable?: boolean; // Can user toggle this? (default: true if not required)
    description?: string;
  };

  // OrderBook configuration
  orderbook?: {
    required: boolean;
    editable?: boolean; // Can user toggle this? (default: true if not required)
    defaultDepth?: number;
    depthEditable?: boolean; // Can user change depth? (default: true)
    description?: string;
  };

  // Trades configuration
  trades?: {
    required: boolean;
    editable?: boolean; // Can user toggle this? (default: true if not required)
    defaultLimit?: number;
    description?: string;
  };
}

/**
 * 📊 Initial Data Requirements Definition
 * Defines what initial/historical data to load before strategy starts
 */
export interface InitialDataRequirements {
  // Klines initial data
  klines?: {
    required: boolean; // Is historical klines data required?
    defaultConfig?: Record<string, number>; // Default: { '15m': 20 } or multiple: { '15m': 50, '1h': 20 }
    description?: string;
    allowMultipleIntervals?: boolean; // Can strategy use multiple intervals? (default: true)
    intervalsEditable?: boolean; // Can user select different intervals? (default: true)
    limitsEditable?: boolean; // Can user change the number of bars per interval? (default: true)
  };

  // Account data
  fetchPositions?: {
    required: boolean;
    editable?: boolean; // Can user toggle this? (default: true if not required)
    description?: string;
  };
  fetchOpenOrders?: {
    required: boolean;
    editable?: boolean; // Can user toggle this? (default: true if not required)
    description?: string;
  };
  fetchBalance?: {
    required: boolean;
    editable?: boolean; // Can user toggle this? (default: true if not required)
    description?: string;
  };
  fetchAccountInfo?: {
    required: boolean;
    editable?: boolean; // Can user toggle this? (default: true if not required)
    description?: string;
  };

  // Market data snapshot
  fetchTicker?: {
    required: boolean;
    editable?: boolean; // Can user toggle this? (default: true if not required)
    description?: string;
  };
  fetchOrderBook?: {
    required: boolean;
    editable?: boolean; // Can user toggle this? (default: true if not required)
    defaultDepth?: number;
    depthEditable?: boolean; // Can user change depth? (default: true)
    description?: string;
  };
}

// ============================================================================
// 策略注册配置
// ============================================================================

/**
 * 📋 Strategy Registry Configuration
 * Complete metadata and configuration for a strategy type
 */
export interface StrategyRegistryConfig<
  TParams extends StrategyParameters = StrategyParameters,
> {
  type: string;
  name: string;
  description: string;
  icon?: string;
  implemented: boolean;
  category: 'trend' | 'momentum' | 'volatility' | 'custom';
  defaultParameters: TParams;
  parameterDefinitions: ParameterDefinition[];

  // 🆕 Strategy-specific subscription requirements
  subscriptionRequirements?: SubscriptionRequirements;

  // 🆕 Strategy-specific initial data requirements
  initialDataRequirements?: InitialDataRequirements;

  documentation?: {
    overview: string;
    parameters: string;
    signals: string;
    riskFactors: string[];
  };
}
