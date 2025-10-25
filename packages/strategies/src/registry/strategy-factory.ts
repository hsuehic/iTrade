/**
 * 🏭 策略工厂和实现注册表
 *
 * 这个文件管理所有已实现的策略类，提供统一的策略创建和查询接口
 * 策略包负责维护自己的实现状态，避免与配置不同步的问题
 */

import {
  IStrategy,
  StrategyParameters,
  type StrategyTypeKey,
  type StrategyConfig,
  STRATEGY_REGISTRY,
  getStrategyConfig,
  getStrategyDefaultParameters,
} from '@itrade/core';

import { MovingAverageStrategy } from '../strategies/MovingAverageStrategy';
import { MovingWindowGridsStrategy } from '../strategies/MovingWindowGridsStrategy';
import { HammerChannelStrategy } from '../strategies/HammerChannelStrategy';

/**
 * 策略构造函数类型
 */
export type StrategyConstructor = new (parameters: any) => IStrategy;

/**
 * 🎯 策略实现映射表
 *
 * 当新增策略实现时，在这里注册：
 * 1. 导入策略类
 * 2. 添加到 IMPLEMENTED_STRATEGIES 映射中
 *
 * 这是策略包的核心注册表，所有其他模块都从这里获取实现状态
 */
export const IMPLEMENTED_STRATEGIES: Partial<
  Record<StrategyTypeKey, StrategyConstructor>
> = {
  // ✅ 已实现的策略
  moving_average: MovingAverageStrategy,
  moving_window_grids: MovingWindowGridsStrategy,
  hammer_channel: HammerChannelStrategy,
  custom: MovingAverageStrategy, // Custom可以复用MovingAverage的基础实现

  // 🚧 待实现的策略 - 实现后请移动到上面
  // rsi: RSIStrategy,
  // macd: MACDStrategy,
  // bollinger_bands: BollingerBandsStrategy,
};

/**
 * 策略实现信息
 */
export interface StrategyImplementationInfo extends StrategyConfig {
  /** 策略构造函数 */
  constructor: StrategyConstructor;
  /** 实现版本 */
  version?: string;
  /** 实现者 */
  author?: string;
}

/**
 * 🔍 获取所有已实现的策略
 *
 * 这个方法会检查策略的实际实现状态，而不是仅仅依赖配置文件
 */
export function getImplementedStrategies(): StrategyImplementationInfo[] {
  const implementedTypes = Object.keys(IMPLEMENTED_STRATEGIES) as StrategyTypeKey[];

  return implementedTypes
    .map((type) => {
      const config = getStrategyConfig(type);
      const constructor = IMPLEMENTED_STRATEGIES[type];

      if (!config || !constructor) {
        console.warn(
          `⚠️ Strategy ${type} has incomplete implementation or configuration`,
        );
        return null;
      }

      return {
        ...config,
        constructor,
        implemented: true, // 强制设置为true，因为这里都是已实现的
      } as StrategyImplementationInfo;
    })
    .filter(Boolean) as StrategyImplementationInfo[];
}

/**
 * 🔍 获取未实现的策略（仅在配置中存在但未实现）
 */
export function getUnimplementedStrategies(): StrategyConfig[] {
  const allConfigs = Object.values(STRATEGY_REGISTRY);
  const implementedTypes = new Set(Object.keys(IMPLEMENTED_STRATEGIES));

  return allConfigs.filter((config) => !implementedTypes.has(config.type));
}

/**
 * 🔍 检查策略是否已实现
 */
export function isStrategyImplemented(type: StrategyTypeKey): boolean {
  return type in IMPLEMENTED_STRATEGIES;
}

/**
 * 🔍 获取策略构造函数
 */
export function getStrategyConstructor(
  type: StrategyTypeKey,
): StrategyConstructor | undefined {
  return IMPLEMENTED_STRATEGIES[type];
}

/**
 * 🏭 创建策略实例
 *
 * 统一的策略创建入口，包含完整的验证和错误处理
 */
export function createStrategyInstance(
  type: StrategyTypeKey,
  customParameters: Partial<StrategyParameters> = {},
  options: {
    symbol: string;
    exchange: string;
    logger?: any;
  },
): IStrategy {
  const { symbol, exchange, logger } = options;

  // 🔍 验证策略配置
  const strategyConfig = getStrategyConfig(type);
  if (!strategyConfig) {
    throw new Error(
      `Unknown strategy type: ${type}. Please check STRATEGY_REGISTRY configuration.`,
    );
  }

  // 🔍 验证策略实现
  if (!isStrategyImplemented(type)) {
    throw new Error(
      `Strategy type '${type}' (${strategyConfig.name}) is not yet implemented.`,
    );
  }

  // 🏭 获取策略构造函数
  const StrategyClass = getStrategyConstructor(type);
  if (!StrategyClass) {
    throw new Error(`Strategy constructor not found for type '${type}'.`);
  }

  // 📋 合并默认配置和用户参数
  const defaultParameters = getStrategyDefaultParameters(type);
  const fullParameters: StrategyParameters = {
    ...defaultParameters, // 来自策略配置的默认参数
    ...customParameters, // 用户自定义参数覆盖默认参数
    symbol,
    exchange,
  };

  // 🔧 确保必要的 subscription 配置
  if (!fullParameters.subscription) {
    fullParameters.subscription = {
      ticker: false,
      klines: false,
      trades: false,
      orderbook: false,
      method: 'websocket', // Use WebSocket by default
    };
  }

  if (logger) {
    logger.debug(`Creating strategy instance: ${strategyConfig.name} (${type})`, {
      symbol,
      exchange,
      parametersKeys: Object.keys(fullParameters),
    });
  }

  // 🎯 创建策略实例
  try {
    return new StrategyClass(fullParameters);
  } catch (error) {
    const errorMsg = `Failed to instantiate strategy '${type}': ${(error as Error).message}`;
    if (logger) {
      logger.error(`Failed to create strategy instance for ${type}:`, error as Error);
    }
    throw new Error(errorMsg);
  }
}

/**
 * 🔍 获取所有策略的实现状态
 *
 * 返回每个策略的完整信息，包括实现状态
 */
export function getAllStrategiesWithImplementationStatus(): (Omit<
  StrategyConfig,
  'constructor'
> & {
  implemented: boolean;
  constructor?: StrategyConstructor;
})[] {
  return Object.values(STRATEGY_REGISTRY).map((config) => {
    const { constructor: _, ...configWithoutConstructor } = config as any;
    return {
      ...configWithoutConstructor,
      implemented: isStrategyImplemented(config.type),
      constructor: getStrategyConstructor(config.type),
    };
  });
}

/**
 * 📊 获取实现统计信息
 */
export function getImplementationStats(): {
  total: number;
  implemented: number;
  unimplemented: number;
  implementationRate: number;
} {
  const total = Object.keys(STRATEGY_REGISTRY).length;
  const implemented = Object.keys(IMPLEMENTED_STRATEGIES).length;
  const unimplemented = total - implemented;
  const implementationRate = total > 0 ? (implemented / total) * 100 : 0;

  return {
    total,
    implemented,
    unimplemented,
    implementationRate: Math.round(implementationRate * 100) / 100,
  };
}

/**
 * 🔧 开发工具：验证实现和配置的一致性
 */
export function validateStrategyImplementations(): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // 检查每个已实现的策略是否有对应的配置
  Object.keys(IMPLEMENTED_STRATEGIES).forEach((type) => {
    const config = getStrategyConfig(type as StrategyTypeKey);
    if (!config) {
      issues.push(
        `Strategy '${type}' is implemented but missing configuration in STRATEGY_REGISTRY`,
      );
    }
  });

  // 检查标记为已实现但实际未实现的策略
  Object.values(STRATEGY_REGISTRY).forEach((config) => {
    if (config.implemented && !isStrategyImplemented(config.type)) {
      issues.push(
        `Strategy '${config.type}' is marked as implemented in config but not found in IMPLEMENTED_STRATEGIES`,
      );
    }
  });

  return {
    valid: issues.length === 0,
    issues,
  };
}

// 在开发环境下进行验证
if (process.env.NODE_ENV === 'development') {
  const validation = validateStrategyImplementations();
  if (!validation.valid) {
    console.warn('⚠️ Strategy implementation validation issues:', validation.issues);
  }

  const stats = getImplementationStats();
  console.info(
    `📊 Strategy Implementation Stats: ${stats.implemented}/${stats.total} (${stats.implementationRate}%)`,
  );
}
