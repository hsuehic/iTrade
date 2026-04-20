/**
 * 🏭 策略注册表和工厂
 *
 * 这个文件是策略包的核心，包含：
 * 1. 策略元数据配置 (STRATEGY_REGISTRY)
 * 2. 策略实现注册表 (StrategyRegistry)
 * 3. 策略工厂方法 (createStrategyInstance)
 */

import type { IStrategy, StrategyConfig, StrategyParameters } from '@itrade/core';
import { createEmptyPerformance } from '@itrade/core';

import {
  MovingAverageStrategy,
  MovingAverageStrategyRegistryConfig,
} from '../strategies/MovingAverageStrategy';
import {
  MovingWindowGridsStrategy,
  MovingWindowGridsStrategyRegistryConfig,
} from '../strategies/MovingWindowGridsStrategy';
import {
  HammerChannelStrategy,
  HammerChannelStrategyRegistryConfig,
} from '../strategies/HammerChannelStrategy';
import {
  SingleLadderLifoTPStrategy,
  SingleLadderLifoTPStrategyRegistryConfig,
} from '../strategies/SingleLadderLifoTPStrategy';
import { StrategyRegistryConfig } from '../type';

import {
  SpreadGridStrategy,
  SpreadGridStrategyRegistryConfig,
} from '../strategies/SpreadGridStrategy';
import { silentLogger } from '../utils/silent-logger';

// ============================================================================
// 策略参数接口定义
// ============================================================================

// ============================================================================
// 策略类型键
// ============================================================================

/**
 * 🎯 策略类型键 - 仅包含已实现的策略
 */
export type StrategyTypeKey =
  | 'MovingAverageStrategy'
  | 'MovingWindowGridsStrategy'
  | 'HammerChannelStrategy'
  | 'SingleLadderLifoTPStrategy'
  | 'SpreadGridStrategy';

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
  public readonly strategies = new Map<
    StrategyTypeKey,
    StrategyConstructor<StrategyParameters>
  >();
  public readonly strategyRegistryConfigs = new Map<
    StrategyTypeKey,
    StrategyRegistryConfig<StrategyParameters>
  >();

  /*
   * 注册策略实现
   * @param type 策略类型键
   * @param constructor 策略构造函数
   */
  register<TParams extends StrategyParameters>(
    type: StrategyTypeKey,
    constructor: StrategyConstructor<TParams>,
    registryConfig: StrategyRegistryConfig<TParams>,
  ): void {
    this.strategies.set(
      type,
      constructor as unknown as StrategyConstructor<StrategyParameters>,
    );
    this.strategyRegistryConfigs.set(
      type,
      registryConfig as unknown as StrategyRegistryConfig<StrategyParameters>,
    );
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
registry.register(
  'MovingAverageStrategy',
  MovingAverageStrategy,
  MovingAverageStrategyRegistryConfig,
);
registry.register(
  'MovingWindowGridsStrategy',
  MovingWindowGridsStrategy,
  MovingWindowGridsStrategyRegistryConfig,
);
registry.register(
  'HammerChannelStrategy',
  HammerChannelStrategy,
  HammerChannelStrategyRegistryConfig,
);
registry.register(
  'SingleLadderLifoTPStrategy',
  SingleLadderLifoTPStrategy,
  SingleLadderLifoTPStrategyRegistryConfig,
);
registry.register(
  'SpreadGridStrategy',
  SpreadGridStrategy,
  SpreadGridStrategyRegistryConfig,
);

// ============================================================================
// 策略元数据辅助函数
// ============================================================================

/** 获取策略配置 */
export function getStrategyRegistryConfig(
  type: StrategyTypeKey,
): StrategyRegistryConfig | undefined {
  return registry.strategyRegistryConfigs.get(type);
}

/** 获取默认参数 */
export function getStrategyDefaultParameters<
  T extends StrategyParameters = StrategyParameters,
>(type: StrategyTypeKey): T {
  return (getStrategyRegistryConfig(type)?.defaultParameters || {}) as T;
}

/** 获取所有策略类型 */
export function getAllStrategyTypes(): StrategyTypeKey[] {
  return Object.keys(registry.strategyRegistryConfigs) as StrategyTypeKey[];
}

/** 验证策略类型 */
export function isValidStrategyType(type: string): type is StrategyTypeKey {
  return registry.strategyRegistryConfigs.has(type as StrategyTypeKey);
}

/** 按类别获取策略 */
export function getStrategyRegistryConfigsByCategory(
  category: 'trend' | 'momentum' | 'volatility' | 'custom',
): StrategyRegistryConfig[] {
  return Array.from(registry.strategyRegistryConfigs.values()).filter(
    (config) => config.category === category,
  );
}

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
  return Array.from(registry.strategyRegistryConfigs.values())
    .filter((config: StrategyRegistryConfig) =>
      registry.has(config.type as StrategyTypeKey),
    )
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
  const { parameters: customParams, ...contextFields } = customConfig;

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
    logger: silentLogger,
    subscription: contextFields.subscription,
    initialDataConfig: contextFields.initialDataConfig,
    loadedInitialData: contextFields.loadedInitialData,
    performance:
      contextFields.performance ||
      createEmptyPerformance(
        contextFields.symbol || '',
        Array.isArray(contextFields.exchange)
          ? contextFields.exchange[0]
          : contextFields.exchange || '',
        strategyId,
        strategyName,
      ),
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
  return Array.from(registry.strategyRegistryConfigs.values()).map(
    (config: StrategyRegistryConfig) => ({
      type: config.type as StrategyTypeKey,
      name: config.name,
      description: config.description,
      icon: config.icon,
      category: config.category,
      implemented: registry.has(config.type as StrategyTypeKey),
      constructor: registry.get(config.type as StrategyTypeKey)!,
    }),
  );
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
    total: registry.strategyRegistryConfigs.size,
    registeredTypes: registry.getRegisteredTypes(),
  };
}
