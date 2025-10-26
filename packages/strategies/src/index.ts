// Export strategy implementations
export { MovingAverageStrategy } from './strategies/MovingAverageStrategy';
export { MovingWindowGridsStrategy } from './strategies/MovingWindowGridsStrategy';
export { HammerChannelStrategy } from './strategies/HammerChannelStrategy';

// Export策略注册表和工厂（合并后的完整导出）
export {
  // 参数接口
  type MovingAverageParameters,
  type MovingWindowGridsParameters,
  type HammerChannelParameters,
  // 类型定义
  type StrategyTypeKey,
  type StrategyRegistryConfig,
  type StrategyConstructor,
  type StrategyImplementationInfo,
  type ParameterDefinition, // UI 参数定义
  // 元数据注册表
  STRATEGY_REGISTRY,
  // 元数据函数
  getStrategyConfig,
  getStrategyDefaultParameters,
  getAllStrategyTypes,
  isValidStrategyType,
  getStrategiesByCategory,
  // 实现注册表函数
  getImplementedStrategies,
  getAllStrategiesWithImplementationStatus,
  isStrategyImplemented,
  getStrategyConstructor,
  // 工厂方法
  createStrategyInstance,
  getRegistryStats,
} from './registry/strategy-factory';
