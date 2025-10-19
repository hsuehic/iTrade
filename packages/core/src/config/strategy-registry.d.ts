export interface StrategyParameterDefinition {
    name: string;
    type: 'number' | 'string' | 'boolean' | 'object' | 'date' | 'enum' | 'range' | 'color';
    description: string;
    defaultValue: any;
    required?: boolean;
    min?: number;
    max?: number;
    step?: number;
    validation?: {
        pattern?: string;
        options?: string[];
    };
    unit?: string;
}
export interface StrategyConfig {
    /** 策略类型标识 */
    type: StrategyTypeKey;
    /** 策略显示名称 */
    name: string;
    /** 策略描述 */
    description: string;
    /** 策略图标或标识符 */
    icon?: string;
    /** 是否已实现 */
    implemented: boolean;
    /** 策略分类 */
    category: 'trend' | 'momentum' | 'volatility' | 'custom';
    /** 默认参数配置 */
    defaultParameters: Record<string, any>;
    /** 参数定义（用于UI生成和验证） */
    parameterDefinitions: StrategyParameterDefinition[];
    /** 策略说明文档 */
    documentation?: {
        overview: string;
        parameters: string;
        signals: string;
        riskFactors: string[];
    };
}
/**
 * 策略注册表 - 集中管理所有策略类型和配置
 *
 * 添加新策略时只需要在这里配置，系统会自动同步到前端、后端和console应用
 */
export type StrategyTypeKey = 'moving_average' | 'rsi' | 'macd' | 'bollinger_bands' | 'window_grids' | 'custom';
/**
 * 🎯 策略注册表 - 所有策略的中央配置
 *
 * 当需要添加新策略时，只需要在这里添加配置即可
 */
export declare const STRATEGY_REGISTRY: Record<StrategyTypeKey, StrategyConfig>;
/**
 * 🔧 辅助函数
 */
/**
 * 获取所有已实现的策略
 *
 * ⚠️ 注意：这个方法仅基于配置文件的 `implemented` 字段
 * 如果需要获取实际的实现状态，请使用 @itrade/strategies 包中的 `getImplementedStrategies()` 方法
 *
 * @deprecated 推荐使用 @itrade/strategies 包中的方法，它能提供真实的实现状态
 */
export declare function getImplementedStrategies(): StrategyConfig[];
/** 获取所有策略类型 */
export declare function getAllStrategyTypes(): StrategyTypeKey[];
/** 根据类型获取策略配置 */
export declare function getStrategyConfig(type: StrategyTypeKey): StrategyConfig | undefined;
/** 获取策略的默认参数 */
export declare function getStrategyDefaultParameters(type: StrategyTypeKey): Record<string, any>;
/** 验证策略类型是否有效 */
export declare function isValidStrategyType(type: string): type is StrategyTypeKey;
/** 按分类获取策略 */
export declare function getStrategiesByCategory(category: StrategyConfig['category']): StrategyConfig[];
/**
 * 🎯 类型导出
 *
 * 其他模块可以导入这些类型以确保类型安全
 */
/**
 * 📝 使用说明
 *
 * 添加新策略的步骤：
 * 1. 在 STRATEGY_REGISTRY 中添加配置
 * 2. 实现策略类 (packages/strategies)
 * 3. 在 console/strategy-manager.ts 的工厂中注册
 * 4. 如需要，在 data-manager 的 StrategyType 枚举中添加
 *
 * 所有其他地方会自动使用新配置！
 */
//# sourceMappingURL=strategy-registry.d.ts.map