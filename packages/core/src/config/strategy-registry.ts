/**
 * 策略注册表 - 集中管理所有策略类型和配置
 *
 * 添加新策略时只需要在这里配置，系统会自动同步到前端、后端和console应用
 */

export type StrategyTypeKey =
  | 'moving_average'
  | 'rsi'
  | 'macd'
  | 'bollinger_bands'
  | 'custom';

export interface StrategyParameterDefinition {
  name: string;
  type:
    | 'number'
    | 'string'
    | 'boolean'
    | 'object'
    | 'date'
    | 'enum'
    | 'range'
    | 'color';
  description: string;
  defaultValue: any;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number; // For range/number input step
  validation?: {
    pattern?: string;
    options?: string[]; // For enum/dropdown
  };
  unit?: string; // Display unit (e.g., 'ms', '%', 'px')
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
 * 🎯 策略注册表 - 所有策略的中央配置
 *
 * 当需要添加新策略时，只需要在这里添加配置即可
 */
export const STRATEGY_REGISTRY: Record<StrategyTypeKey, StrategyConfig> = {
  moving_average: {
    type: 'moving_average',
    name: 'Moving Average Crossover',
    description: 'Classic trend-following strategy using two moving averages',
    icon: '📈',
    implemented: false, // 🔄 实际实现状态由 @itrade/strategies 包动态确定
    category: 'trend',
    defaultParameters: {
      fastPeriod: 12,
      slowPeriod: 26,
      threshold: 0.001,
      subscription: {
        ticker: true,
        klines: true,
        method: 'rest',
      },
    },
    parameterDefinitions: [
      {
        name: 'fastPeriod',
        type: 'number',
        description: 'Fast moving average period (number of candles)',
        defaultValue: 12,
        required: true,
        min: 2,
        max: 100,
      },
      {
        name: 'slowPeriod',
        type: 'number',
        description: 'Slow moving average period (number of candles)',
        defaultValue: 26,
        required: true,
        min: 3,
        max: 200,
      },
      {
        name: 'threshold',
        type: 'number',
        description: 'Minimum crossover threshold (0.001 = 0.1%)',
        defaultValue: 0.001,
        required: false,
        min: 0,
        max: 0.1,
      },
    ],
    documentation: {
      overview:
        'Uses two moving averages to identify trend changes. Generates buy signals when fast MA crosses above slow MA, and sell signals when fast MA crosses below slow MA.',
      parameters:
        'FastPeriod should be smaller than slowPeriod. Common combinations: 5/20, 10/30, 12/26.',
      signals:
        'BUY: Fast MA > Slow MA with sufficient threshold. SELL: Fast MA < Slow MA.',
      riskFactors: [
        'Lagging indicator - may enter trades late',
        'Poor performance in sideways markets',
        'Prone to false signals in choppy conditions',
      ],
    },
  },

  rsi: {
    type: 'rsi',
    name: 'RSI Indicator',
    description: 'Mean reversion strategy based on Relative Strength Index',
    icon: '📊',
    implemented: false, // 🚧 待实现
    category: 'momentum',
    defaultParameters: {
      period: 14,
      overboughtLevel: 70,
      oversoldLevel: 30,
      subscription: {
        ticker: true,
        klines: true,
        method: 'rest',
      },
    },
    parameterDefinitions: [
      {
        name: 'period',
        type: 'number',
        description: 'RSI calculation period',
        defaultValue: 14,
        required: true,
        min: 2,
        max: 50,
      },
      {
        name: 'overboughtLevel',
        type: 'number',
        description: 'Overbought threshold (sell signal)',
        defaultValue: 70,
        required: true,
        min: 50,
        max: 95,
      },
      {
        name: 'oversoldLevel',
        type: 'number',
        description: 'Oversold threshold (buy signal)',
        defaultValue: 30,
        required: true,
        min: 5,
        max: 50,
      },
    ],
    documentation: {
      overview:
        'RSI oscillator identifies overbought and oversold conditions. Generates contrarian signals.',
      parameters:
        'Standard period is 14. Overbought level typically 70-80, oversold level 20-30.',
      signals: 'BUY: RSI < oversoldLevel. SELL: RSI > overboughtLevel.',
      riskFactors: [
        'Can remain overbought/oversold for extended periods',
        'May generate false signals during strong trends',
      ],
    },
  },

  macd: {
    type: 'macd',
    name: 'MACD Strategy',
    description: 'Moving Average Convergence Divergence momentum strategy',
    icon: '〰️',
    implemented: false, // 🚧 待实现
    category: 'momentum',
    defaultParameters: {
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      subscription: {
        ticker: true,
        klines: true,
        method: 'rest',
      },
    },
    parameterDefinitions: [
      {
        name: 'fastPeriod',
        type: 'number',
        description: 'Fast EMA period for MACD line',
        defaultValue: 12,
        required: true,
        min: 2,
        max: 50,
      },
      {
        name: 'slowPeriod',
        type: 'number',
        description: 'Slow EMA period for MACD line',
        defaultValue: 26,
        required: true,
        min: 5,
        max: 100,
      },
      {
        name: 'signalPeriod',
        type: 'number',
        description: 'EMA period for signal line',
        defaultValue: 9,
        required: true,
        min: 3,
        max: 30,
      },
    ],
    documentation: {
      overview:
        'MACD combines trend and momentum analysis. Uses MACD line crossovers with signal line.',
      parameters: 'Standard settings are 12/26/9. FastPeriod < slowPeriod.',
      signals:
        'BUY: MACD crosses above signal line. SELL: MACD crosses below signal line.',
      riskFactors: [
        'Lagging indicator with delayed signals',
        'Multiple false signals in ranging markets',
      ],
    },
  },

  bollinger_bands: {
    type: 'bollinger_bands',
    name: 'Bollinger Bands',
    description: 'Volatility-based mean reversion strategy',
    icon: '📏',
    implemented: false, // 🚧 待实现
    category: 'volatility',
    defaultParameters: {
      period: 20,
      stdDev: 2,
      subscription: {
        ticker: true,
        klines: true,
        method: 'rest',
      },
    },
    parameterDefinitions: [
      {
        name: 'period',
        type: 'number',
        description: 'Moving average period for middle band',
        defaultValue: 20,
        required: true,
        min: 5,
        max: 100,
      },
      {
        name: 'stdDev',
        type: 'number',
        description: 'Standard deviation multiplier for bands',
        defaultValue: 2,
        required: true,
        min: 1,
        max: 4,
      },
    ],
    documentation: {
      overview:
        'Uses volatility bands around a moving average to identify overbought/oversold conditions.',
      parameters: 'Standard settings: 20-period MA with 2 standard deviations.',
      signals: 'BUY: Price touches lower band. SELL: Price touches upper band.',
      riskFactors: [
        'Assumes mean reversion behavior',
        'May fail during strong breakout moves',
      ],
    },
  },

  custom: {
    type: 'custom',
    name: 'Custom Strategy',
    description:
      'User-defined custom trading strategy with advanced parameters',
    icon: '🛠️',
    implemented: false, // 🔄 实际实现状态由 @itrade/strategies 包动态确定
    category: 'custom',
    defaultParameters: {
      // Basic parameters
      lookbackPeriod: 20,
      signalStrength: 70,
      riskLevel: 50,

      // Advanced parameters demonstrating new field types
      tradingMode: 'balanced',
      startDate: '2024-01-01',
      buyColor: '#10b981',
      sellColor: '#ef4444',
      useStopLoss: true,

      // Custom logic
      customLogic: {
        entryRules: [],
        exitRules: [],
      },

      subscription: {
        ticker: true,
        klines: true,
        method: 'rest',
      },
    },
    parameterDefinitions: [
      // Number field
      {
        name: 'lookbackPeriod',
        type: 'number',
        description: 'Historical data lookback period (candles)',
        defaultValue: 20,
        required: true,
        min: 5,
        max: 200,
      },

      // Range field with percentage
      {
        name: 'signalStrength',
        type: 'range',
        description: 'Minimum signal strength threshold',
        defaultValue: 70,
        min: 50,
        max: 95,
        step: 5,
        unit: '%',
      },

      // Range field for risk level
      {
        name: 'riskLevel',
        type: 'range',
        description: 'Risk tolerance level (higher = more aggressive)',
        defaultValue: 50,
        min: 0,
        max: 100,
        step: 10,
        unit: '%',
      },

      // Enum field
      {
        name: 'tradingMode',
        type: 'enum',
        description: 'Trading mode strategy',
        defaultValue: 'balanced',
        required: true,
        validation: {
          options: ['conservative', 'balanced', 'aggressive'],
        },
      },

      // Date field
      {
        name: 'startDate',
        type: 'date',
        description: 'Strategy activation start date',
        defaultValue: '2024-01-01',
      },

      // Color fields
      {
        name: 'buyColor',
        type: 'color',
        description: 'Buy signal indicator color',
        defaultValue: '#10b981',
      },
      {
        name: 'sellColor',
        type: 'color',
        description: 'Sell signal indicator color',
        defaultValue: '#ef4444',
      },

      // Boolean field
      {
        name: 'useStopLoss',
        type: 'boolean',
        description: 'Enable automatic stop loss protection',
        defaultValue: true,
      },

      // Object field
      {
        name: 'customLogic',
        type: 'object',
        description: 'Custom strategy logic configuration (JSON format)',
        defaultValue: {
          entryRules: [],
          exitRules: [],
        },
        required: false,
      },
    ],
    documentation: {
      overview:
        'Highly customizable strategy with support for all parameter types. Demonstrates date pickers, color selectors, range sliders, enums, and more.',
      parameters:
        'Configure strategy using visual controls like sliders, date pickers, and color selectors. Advanced users can define custom logic in JSON format.',
      signals:
        'Signals depend on custom implementation and configured parameters.',
      riskFactors: [
        'Risk profile depends on implementation',
        'Requires thorough testing before live trading',
        'Custom parameters need careful validation',
      ],
    },
  },
};

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
export function getImplementedStrategies(): StrategyConfig[] {
  return Object.values(STRATEGY_REGISTRY).filter(
    (config) => config.implemented
  );
}

/** 获取所有策略类型 */
export function getAllStrategyTypes(): StrategyTypeKey[] {
  return Object.keys(STRATEGY_REGISTRY) as StrategyTypeKey[];
}

/** 根据类型获取策略配置 */
export function getStrategyConfig(
  type: StrategyTypeKey
): StrategyConfig | undefined {
  return STRATEGY_REGISTRY[type];
}

/** 获取策略的默认参数 */
export function getStrategyDefaultParameters(
  type: StrategyTypeKey
): Record<string, any> {
  return STRATEGY_REGISTRY[type]?.defaultParameters || {};
}

/** 验证策略类型是否有效 */
export function isValidStrategyType(type: string): type is StrategyTypeKey {
  return type in STRATEGY_REGISTRY;
}

/** 按分类获取策略 */
export function getStrategiesByCategory(
  category: StrategyConfig['category']
): StrategyConfig[] {
  return Object.values(STRATEGY_REGISTRY).filter(
    (config) => config.category === category
  );
}

/**
 * 🎯 类型导出
 *
 * 其他模块可以导入这些类型以确保类型安全
 */
// 注意：类型已在接口定义处导出，此处不需要重复导出

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
