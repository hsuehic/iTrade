/**
 * 🏭 策略注册表和工厂
 *
 * 这个文件是策略包的核心，包含：
 * 1. 策略元数据配置 (STRATEGY_REGISTRY)
 * 2. 策略实现注册表 (StrategyRegistry)
 * 3. 策略工厂方法 (createStrategyInstance)
 */

import type { IStrategy, StrategyConfig, StrategyParameters } from '@itrade/core';

import { MovingAverageStrategy } from '../strategies/MovingAverageStrategy';
import { MovingWindowGridsStrategy } from '../strategies/MovingWindowGridsStrategy';
import { HammerChannelStrategy } from '../strategies/HammerChannelStrategy';

// ============================================================================
// 策略参数接口定义
// ============================================================================

/**
 * 📊 MovingAverageStrategy 参数
 */
export interface MovingAverageParameters extends StrategyParameters {
  fastPeriod: number;
  slowPeriod: number;
  threshold: number;
}

/**
 * 📊 MovingWindowGridsStrategy 参数
 */
export interface MovingWindowGridsParameters extends StrategyParameters {
  windowSize: number;
  gridSize: number;
  gridCount: number;
  minVolatility: number;
  takeProfitRatio: number;
}

/**
 * 📊 HammerChannelStrategy 参数
 */
export interface HammerChannelParameters extends StrategyParameters {
  windowSize: number;
  lowerShadowToBody: number;
  upperShadowToBody: number;
  bodyToRange: number;
  highThreshold: number;
  lowThreshold: number;
}

// ============================================================================
// 策略类型键
// ============================================================================

/**
 * 🎯 策略类型键 - 仅包含已实现的策略
 */
export type StrategyTypeKey =
  | 'MovingAverageStrategy'
  | 'MovingWindowGridsStrategy'
  | 'HammerChannelStrategy';

// ============================================================================
// UI 参数定义
// ============================================================================

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
  documentation?: {
    overview: string;
    parameters: string;
    signals: string;
    riskFactors: string[];
  };
}

/**
 * 🎯 策略元数据注册表 - 所有策略的中央配置
 */
export const STRATEGY_REGISTRY: Record<StrategyTypeKey, StrategyRegistryConfig> = {
  MovingAverageStrategy: {
    type: 'MovingAverageStrategy',
    name: 'Moving Average Crossover',
    description: 'Classic trend-following strategy using two moving averages',
    icon: '📈',
    implemented: true,
    category: 'trend',
    defaultParameters: {
      fastPeriod: 10,
      slowPeriod: 20,
      threshold: 0.01,
    },
    parameterDefinitions: [
      {
        name: 'fastPeriod',
        type: 'number',
        description: 'Fast moving average period',
        defaultValue: 10,
        required: true,
        min: 1,
        max: 100,
        group: 'Basic',
        order: 1,
      },
      {
        name: 'slowPeriod',
        type: 'number',
        description: 'Slow moving average period',
        defaultValue: 20,
        required: true,
        min: 2,
        max: 200,
        group: 'Basic',
        order: 2,
      },
      {
        name: 'threshold',
        type: 'number',
        description: 'Minimum crossover percentage',
        defaultValue: 0.01,
        required: true,
        min: 0,
        max: 1,
        group: 'Signal',
        order: 3,
        unit: '%',
      },
    ],
    documentation: {
      overview:
        'Generates buy signals when fast MA crosses above slow MA, and sell signals when it crosses below.',
      parameters: 'Fast MA should be shorter than Slow MA.',
      signals: 'Buy: Fast MA > Slow MA. Sell: Fast MA < Slow MA.',
      riskFactors: ['Lagging indicator', 'Choppy markets'],
    },
  },

  MovingWindowGridsStrategy: {
    type: 'MovingWindowGridsStrategy',
    name: 'Moving Window Grids',
    description: 'Grid trading strategy within a moving price window',
    icon: '🎯',
    implemented: true,
    category: 'volatility',
    defaultParameters: {
      windowSize: 20,
      gridSize: 0.005,
      gridCount: 5,
      minVolatility: 0.001,
      takeProfitRatio: 0.01,
    },
    parameterDefinitions: [
      {
        name: 'windowSize',
        type: 'number',
        description: 'Number of candles for price window',
        defaultValue: 20,
        required: true,
        min: 5,
        max: 100,
        group: 'Window',
        order: 1,
      },
      {
        name: 'gridSize',
        type: 'number',
        description: 'Grid spacing as percentage',
        defaultValue: 0.005,
        required: true,
        min: 0.001,
        max: 0.1,
        group: 'Grid',
        order: 2,
        unit: '%',
      },
      {
        name: 'gridCount',
        type: 'number',
        description: 'Number of grid levels',
        defaultValue: 5,
        required: true,
        min: 2,
        max: 20,
        group: 'Grid',
        order: 3,
      },
      {
        name: 'minVolatility',
        type: 'number',
        description: 'Minimum volatility threshold',
        defaultValue: 0.001,
        required: true,
        min: 0,
        max: 0.1,
        group: 'Risk',
        order: 4,
        unit: '%',
      },
      {
        name: 'takeProfitRatio',
        type: 'number',
        description: 'Take profit ratio',
        defaultValue: 0.01,
        required: true,
        min: 0.001,
        max: 0.5,
        group: 'Risk',
        order: 5,
        unit: '%',
      },
    ],
    documentation: {
      overview:
        'Places grid orders within a moving window, capturing profits from oscillations.',
      parameters: 'Window size determines range, grid size and count define placement.',
      signals: 'Buy at lower levels, sell at upper levels.',
      riskFactors: ['Trending markets', 'Low volatility'],
    },
  },

  HammerChannelStrategy: {
    type: 'HammerChannelStrategy',
    name: 'Hammer Channel',
    description: 'Identifies hammer patterns within price channels',
    icon: '🔨',
    implemented: true,
    category: 'momentum',
    defaultParameters: {
      windowSize: 15,
      lowerShadowToBody: 2,
      upperShadowToBody: 0.3,
      bodyToRange: 0.35,
      highThreshold: 0.9,
      lowThreshold: 0.1,
    },
    parameterDefinitions: [
      {
        name: 'windowSize',
        type: 'number',
        description: 'Channel calculation window',
        defaultValue: 15,
        required: true,
        min: 5,
        max: 100,
        group: 'Channel',
        order: 1,
      },
      {
        name: 'lowerShadowToBody',
        type: 'number',
        description: 'Lower shadow to body ratio',
        defaultValue: 2,
        required: true,
        min: 1,
        max: 10,
        group: 'Hammer',
        order: 2,
      },
      {
        name: 'upperShadowToBody',
        type: 'number',
        description: 'Upper shadow to body ratio',
        defaultValue: 0.3,
        required: true,
        min: 0,
        max: 1,
        group: 'Hammer',
        order: 3,
      },
      {
        name: 'bodyToRange',
        type: 'number',
        description: 'Body to range ratio',
        defaultValue: 0.35,
        required: true,
        min: 0.1,
        max: 0.9,
        group: 'Hammer',
        order: 4,
      },
      {
        name: 'highThreshold',
        type: 'number',
        description: 'Upper channel threshold',
        defaultValue: 0.9,
        required: true,
        min: 0.5,
        max: 1,
        group: 'Channel',
        order: 5,
      },
      {
        name: 'lowThreshold',
        type: 'number',
        description: 'Lower channel threshold',
        defaultValue: 0.1,
        required: true,
        min: 0,
        max: 0.5,
        group: 'Channel',
        order: 6,
      },
    ],
    documentation: {
      overview: 'Detects hammer patterns and signals based on channel position.',
      parameters: 'Adjust ratios for pattern strictness, thresholds for timing.',
      signals: 'Buy: Bearish hammer at low. Sell: Bullish hammer at high.',
      riskFactors: ['False hammers', 'Strong trends'],
    },
  },
};

// ============================================================================
// 策略元数据辅助函数
// ============================================================================

/** 获取策略配置 */
export function getStrategyConfig(
  type: StrategyTypeKey,
): StrategyRegistryConfig | undefined {
  return STRATEGY_REGISTRY[type];
}

/** 获取默认参数 */
export function getStrategyDefaultParameters<
  T extends StrategyParameters = StrategyParameters,
>(type: StrategyTypeKey): T {
  return (STRATEGY_REGISTRY[type]?.defaultParameters || {}) as T;
}

/** 获取所有策略类型 */
export function getAllStrategyTypes(): StrategyTypeKey[] {
  return Object.keys(STRATEGY_REGISTRY) as StrategyTypeKey[];
}

/** 验证策略类型 */
export function isValidStrategyType(type: string): type is StrategyTypeKey {
  return type in STRATEGY_REGISTRY;
}

/** 按类别获取策略 */
export function getStrategiesByCategory(
  category: 'trend' | 'momentum' | 'volatility' | 'custom',
): StrategyRegistryConfig[] {
  return Object.values(STRATEGY_REGISTRY).filter(
    (config) => config.category === category,
  );
}

// ============================================================================
// 策略实现注册表
// ============================================================================

/**
 * 策略构造函数类型
 */
export type StrategyConstructor<TParams extends StrategyParameters = StrategyParameters> =
  new (config: StrategyConfig<TParams>) => IStrategy<TParams>;

/**
 * 🎯 策略注册表类
 *
 * 使用类来管理策略注册，提供更好的类型安全性
 */
class StrategyRegistry {
  private strategies = new Map<StrategyTypeKey, StrategyConstructor<any>>();

  /*
   * 注册策略实现
   * @param type 策略类型键
   * @param constructor 策略构造函数
   */
  register<TParams extends StrategyParameters>(
    type: StrategyTypeKey,
    constructor: StrategyConstructor<TParams>,
  ): void {
    this.strategies.set(type, constructor);
  }

  /**
   * 获取策略构造函数
   * @param type 策略类型键
   * @returns 策略构造函数，如果未找到则为 undefined
   */
  get<TParams extends StrategyParameters>(
    type: StrategyTypeKey,
  ): StrategyConstructor<TParams> | undefined {
    return this.strategies.get(type) as StrategyConstructor<TParams> | undefined;
  }

  /**
   * 检查策略是否已注册
   * @param type 策略类型键
   * @returns 如果已注册则为 true，否则为 false
   */
  has(type: StrategyTypeKey): boolean {
    return this.strategies.has(type);
  }

  /**
   * 获取所有已注册的策略类型
   * @returns 策略类型数组
   */
  getRegisteredTypes(): StrategyTypeKey[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * 获取已注册策略数量
   * @returns 数量
   */
  size(): number {
    return this.strategies.size;
  }
}

// 创建单例注册表
const registry = new StrategyRegistry();

/**
 * 🔧 注册所有已实现的策略
 *
 * 当新增策略实现时，在这里注册：
 * registry.register('StrategyTypeKey', StrategyClass);
 */
registry.register('MovingAverageStrategy', MovingAverageStrategy);
registry.register('MovingWindowGridsStrategy', MovingWindowGridsStrategy);
registry.register('HammerChannelStrategy', HammerChannelStrategy);

/**
 * 获取所有已实现的策略信息
 * @returns 包含策略类型、名称、描述和构造函数的信息数组
 */
export interface StrategyImplementationInfo {
  type: StrategyTypeKey;
  name: string;
  description: string;
  icon?: string;
  category: 'trend' | 'momentum' | 'volatility' | 'custom';
  constructor: StrategyConstructor;
}

export function getImplementedStrategies(): StrategyImplementationInfo[] {
  return Object.values(STRATEGY_REGISTRY)
    .filter((config) => registry.has(config.type as StrategyTypeKey))
    .map((config) => ({
      type: config.type as StrategyTypeKey,
      name: config.name,
      description: config.description,
      icon: config.icon,
      category: config.category,
      constructor: registry.get(config.type as StrategyTypeKey)!,
    }));
}

/**
 * 检查某个策略类型是否已实现
 * @param type 策略类型键
 * @returns 如果已实现则为 true，否则为 false
 */
export function isStrategyImplemented(type: StrategyTypeKey): boolean {
  return registry.has(type);
}

/**
 * 获取策略的构造函数
 * @param type 策略类型键
 * @returns 策略构造函数，如果未找到则为 undefined
 */
export function getStrategyConstructor<
  TParams extends StrategyParameters = StrategyParameters,
>(type: StrategyTypeKey): StrategyConstructor<TParams> | undefined {
  return registry.get<TParams>(type);
}

/**
 * 创建一个策略实例
 * @param type 策略类型键
 * @param customConfig 用户提供的自定义配置
 * @param strategyId 策略在数据库中的ID (可选)
 * @param strategyName 策略在数据库中的名称 (可选)
 * @returns 策略实例
 * @throws 如果策略类型未实现或配置无效
 */
export function createStrategyInstance<TParams extends StrategyParameters>(
  type: StrategyTypeKey,
  customConfig: Partial<StrategyConfig<TParams>>,
  strategyId?: number,
  strategyName?: string,
): IStrategy<TParams> {
  const StrategyClass = getStrategyConstructor<TParams>(type);

  if (!StrategyClass) {
    throw new Error(`Strategy constructor not found for type '${type}'.`);
  }

  // 📋 合并默认参数和用户配置
  const defaultParameters = getStrategyDefaultParameters(type);

  // 从 customConfig 中提取 parameters 和其他字段
  const { parameters: customParams, ...contextFields } = customConfig as any;

  // 构建完整配置
  const fullConfig: StrategyConfig<TParams> = {
    type, // Strategy type
    parameters: {
      ...defaultParameters, // 默认参数
      ...customParams, // 用户自定义参数覆盖默认参数
    } as TParams,
    // Runtime context
    symbol: contextFields.symbol || '',
    exchange: contextFields.exchange || '',
    strategyId,
    strategyName,
    logger: contextFields.logger,
    subscription: contextFields.subscription,
    initialData: contextFields.initialData,
    loadedInitialData: contextFields.loadedInitialData,
  };

  // 🔧 确保必要的 symbol 和 exchange
  if (!fullConfig.symbol) {
    throw new Error(
      `Missing required runtime context for strategy '${type}': symbol is mandatory.`,
    );
  }
  if (!fullConfig.exchange) {
    throw new Error(
      `Missing required runtime context for strategy '${type}': exchange is mandatory.`,
    );
  }

  // 🔧 确保必要的 subscription 配置
  if (!fullConfig.subscription) {
    fullConfig.subscription = {
      ticker: false,
      klines: false,
      trades: false,
      orderbook: false,
      method: 'websocket', // Use WebSocket by default
    };
  }

  // 实例化策略
  const strategyInstance = new StrategyClass(fullConfig);

  return strategyInstance;
}

/**
 * 获取所有策略及其实现状态
 * @returns 包含所有策略配置和实现状态的数组
 */
export function getAllStrategiesWithImplementationStatus(): (StrategyImplementationInfo & {
  implemented: boolean;
})[] {
  return Object.values(STRATEGY_REGISTRY).map((config) => ({
    type: config.type as StrategyTypeKey,
    name: config.name,
    description: config.description,
    icon: config.icon,
    category: config.category,
    implemented: registry.has(config.type as StrategyTypeKey),
    constructor: registry.get(config.type as StrategyTypeKey)!,
  }));
}

/**
 * 🔧 开发工具：获取注册表统计信息
 */
export function getRegistryStats(): {
  registered: number;
  total: number;
  registeredTypes: StrategyTypeKey[];
} {
  return {
    registered: registry.size(),
    total: Object.keys(STRATEGY_REGISTRY).length,
    registeredTypes: registry.getRegisteredTypes(),
  };
}
