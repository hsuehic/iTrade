// Export strategy implementations
export {
  type MovingAverageParameters,
  MovingAverageStrategy,
} from './strategies/MovingAverageStrategy';
export {
  type MovingWindowGridsParameters,
  MovingWindowGridsStrategy,
} from './strategies/MovingWindowGridsStrategy';
export {
  type HammerChannelParameters,
  HammerChannelStrategy,
} from './strategies/HammerChannelStrategy';

// Export策略注册表和工厂（合并后的完整导出）
export {
  // 类型定义
  type StrategyTypeKey,
  type StrategyConstructor,
  type StrategyImplementationInfo, // UI 参数定义
  getStrategyRegistryConfig as getStrategyConfig,
  getStrategyDefaultParameters,
  getAllStrategyTypes,
  isValidStrategyType,
  getStrategyRegistryConfigsByCategory as getStrategiesByCategory,
  // 实现注册表函数
  getImplementedStrategies,
  getAllStrategiesWithImplementationStatus,
  isStrategyImplemented,
  getStrategyConstructor,
  // 工厂方法
  createStrategyInstance,
  getRegistryStats,
} from './registry/strategy-factory';
export {
  type StrategyRegistryConfig,
  type ParameterDefinition,
  type SubscriptionRequirements,
  type InitialDataRequirements,
} from './type';
