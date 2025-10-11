# 动态表单字段使用指南

## 📋 概述

iTrade 策略参数表单现在支持多种字段类型，可以根据参数定义自动生成美观且功能完整的表单UI。

## 🎨 支持的字段类型

### 1️⃣ **Number** - 数字输入

用于数值型参数，支持最小值、最大值验证。

**配置示例：**

```typescript
{
  name: 'fastPeriod',
  type: 'number',
  description: 'Fast moving average period (number of candles)',
  defaultValue: 12,
  required: true,
  min: 2,
  max: 100,
}
```

**渲染效果：**
```
Fast Period *
[    12    ]  ← 数字输入框（可手动输入）
Fast moving average period (range: 2 - 100)
```

---

### 2️⃣ **String** - 文本输入

用于字符串型参数，支持正则验证。

**配置示例：**

```typescript
{
  name: 'apiKey',
  type: 'string',
  description: 'Exchange API key',
  defaultValue: '',
  required: true,
  validation: {
    pattern: '^[A-Za-z0-9_-]+$', // 只允许字母数字下划线和连字符
  },
}
```

**渲染效果：**
```
Api Key *
[________________]  ← 文本输入框
Exchange API key
```

---

### 3️⃣ **Boolean** - 开关按钮

用于布尔型参数，使用 Switch 组件。

**配置示例：**

```typescript
{
  name: 'useStopLoss',
  type: 'boolean',
  description: 'Enable automatic stop loss protection',
  defaultValue: true,
}
```

**渲染效果：**
```
Use Stop Loss              [ON]  ← 开关按钮
Enable automatic stop loss protection
```

---

### 4️⃣ **Object** - JSON 编辑器

用于复杂对象参数，提供 JSON 格式编辑器。

**配置示例：**

```typescript
{
  name: 'advancedConfig',
  type: 'object',
  description: 'Advanced configuration object',
  defaultValue: {
    retryCount: 3,
    timeout: 5000,
  },
}
```

**渲染效果：**
```
Advanced Config
┌─────────────────────────┐
│ {                       │
│   "retryCount": 3,      │  ← JSON 编辑器（可编辑）
│   "timeout": 5000       │
│ }                       │
└─────────────────────────┘
Advanced configuration object
```

---

### 5️⃣ **Date** - 日期选择器 ⭐ NEW

用于日期型参数，提供原生日期选择器。

**配置示例：**

```typescript
{
  name: 'startDate',
  type: 'date',
  description: 'Strategy start date',
  defaultValue: '2024-01-01',
  required: false,
}
```

**渲染效果：**
```
Start Date
[ 2024-01-01 📅 ]  ← 日期选择器（点击打开日历）
Strategy start date
```

---

### 6️⃣ **Enum** - 枚举下拉框 ⭐ NEW

用于从预定义选项中选择，使用下拉菜单。

**配置示例：**

```typescript
{
  name: 'tradingMode',
  type: 'enum',
  description: 'Trading mode strategy',
  defaultValue: 'balanced',
  required: true,
  validation: {
    options: ['conservative', 'balanced', 'aggressive'],
  },
}
```

**渲染效果：**
```
Trading Mode *
┌─────────────────┐
│ Balanced     ▼ │  ← 下拉选择框
└─────────────────┘
  Options:
  • Conservative
  • Balanced
  • Aggressive

Trading mode strategy
```

---

### 7️⃣ **Range** - 范围滑块 ⭐ NEW

用于数值范围选择，提供可视化滑块。

**配置示例：**

```typescript
{
  name: 'riskLevel',
  type: 'range',
  description: 'Risk tolerance level',
  defaultValue: 50,
  min: 0,
  max: 100,
  step: 5,
  unit: '%',
}
```

**渲染效果：**
```
Risk Level                           50%
├────────●─────────────────────────┤  ← 可拖动滑块
0                                   100
Risk tolerance level (range: 0 - 100 %)
```

---

### 8️⃣ **Color** - 颜色选择器 ⭐ NEW

用于颜色选择，提供颜色选择器和十六进制输入。

**配置示例：**

```typescript
{
  name: 'chartColor',
  type: 'color',
  description: 'Chart line color',
  defaultValue: '#3b82f6',
}
```

**渲染效果：**
```
Chart Color
┌────┐  ┌──────────┐
│ 🎨 │  │ #3b82f6  │  ← 颜色选择器 + 十六进制输入
└────┘  └──────────┘
Chart line color
```

---

## 📝 完整示例：高级策略配置

```typescript
// packages/core/src/config/strategy-registry.ts

export const STRATEGY_REGISTRY: Record<StrategyTypeKey, StrategyConfig> = {
  advanced_ml_strategy: {
    type: 'advanced_ml_strategy',
    name: 'Advanced ML Strategy',
    description: 'Machine learning powered trading strategy',
    icon: '🤖',
    implemented: false,
    category: 'custom',
    
    defaultParameters: {
      // Number fields
      lookbackPeriod: 30,
      predictionHorizon: 5,
      
      // Range fields
      confidence: 75,
      riskLevel: 50,
      
      // Enum field
      modelType: 'lstm',
      tradingMode: 'balanced',
      
      // Boolean fields
      useStopLoss: true,
      enableRetraining: false,
      
      // Date field
      trainingStartDate: '2024-01-01',
      
      // Color fields
      buySignalColor: '#10b981',
      sellSignalColor: '#ef4444',
      
      // String field
      modelName: 'default-model',
      
      // Object field
      advancedConfig: {
        batchSize: 32,
        epochs: 100,
      },
    },
    
    parameterDefinitions: [
      // ========== Number Fields ==========
      {
        name: 'lookbackPeriod',
        type: 'number',
        description: 'Historical data lookback period (days)',
        defaultValue: 30,
        required: true,
        min: 7,
        max: 365,
      },
      {
        name: 'predictionHorizon',
        type: 'number',
        description: 'Price prediction time horizon (hours)',
        defaultValue: 5,
        required: true,
        min: 1,
        max: 48,
      },
      
      // ========== Range Fields ==========
      {
        name: 'confidence',
        type: 'range',
        description: 'Minimum confidence threshold for signals',
        defaultValue: 75,
        min: 50,
        max: 99,
        step: 1,
        unit: '%',
      },
      {
        name: 'riskLevel',
        type: 'range',
        description: 'Risk tolerance level',
        defaultValue: 50,
        min: 0,
        max: 100,
        step: 5,
        unit: '%',
      },
      
      // ========== Enum Fields ==========
      {
        name: 'modelType',
        type: 'enum',
        description: 'Machine learning model architecture',
        defaultValue: 'lstm',
        required: true,
        validation: {
          options: ['lstm', 'gru', 'transformer', 'cnn'],
        },
      },
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
      
      // ========== Boolean Fields ==========
      {
        name: 'useStopLoss',
        type: 'boolean',
        description: 'Enable automatic stop loss protection',
        defaultValue: true,
      },
      {
        name: 'enableRetraining',
        type: 'boolean',
        description: 'Automatically retrain model periodically',
        defaultValue: false,
      },
      
      // ========== Date Field ==========
      {
        name: 'trainingStartDate',
        type: 'date',
        description: 'Model training data start date',
        defaultValue: '2024-01-01',
      },
      
      // ========== Color Fields ==========
      {
        name: 'buySignalColor',
        type: 'color',
        description: 'Buy signal indicator color',
        defaultValue: '#10b981',
      },
      {
        name: 'sellSignalColor',
        type: 'color',
        description: 'Sell signal indicator color',
        defaultValue: '#ef4444',
      },
      
      // ========== String Field ==========
      {
        name: 'modelName',
        type: 'string',
        description: 'Custom model identifier',
        defaultValue: 'default-model',
        validation: {
          pattern: '^[a-z0-9-]+$',
        },
      },
      
      // ========== Object Field ==========
      {
        name: 'advancedConfig',
        type: 'object',
        description: 'Advanced model training configuration',
        defaultValue: {
          batchSize: 32,
          epochs: 100,
        },
      },
    ],
    
    documentation: {
      overview: 'Uses machine learning models to predict price movements and generate trading signals.',
      parameters: 'Configure model architecture, training parameters, and signal thresholds.',
      signals: 'Generates buy/sell signals based on model predictions with confidence scores.',
      riskFactors: [
        'Model predictions may not be accurate in all market conditions',
        'Requires sufficient historical data for training',
        'Computational resources needed for model training',
        'Past performance does not guarantee future results',
      ],
    },
  },
};
```

---

## 🎨 UI 预览

添加上述配置后，表单会自动渲染为：

```
┌─────────────────────────────────────────────────────────────┐
│ 🤖 Advanced ML Strategy Parameters                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ℹ️ Strategy Overview                                        │
│ Uses machine learning models to predict price movements    │
│ and generate trading signals.                               │
│                                                             │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                             │
│ Configuration Parameters                                    │
│                                                             │
│ ┌─────────────────────┬─────────────────────┐             │
│ │ Lookback Period *   │ Prediction Horizon *│             │
│ │ [     30      ]     │ [      5       ]    │             │
│ │ Historical data...  │ Price prediction... │             │
│ │                     │                     │             │
│ │ Confidence                                │             │
│ │ ├────────●──────┤ 75%                     │             │
│ │ Minimum confidence threshold for signals  │             │
│ │                                           │             │
│ │ Risk Level                                │             │
│ │ ├──────●────────┤ 50%                     │             │
│ │ Risk tolerance level                      │             │
│ │                                           │             │
│ │ Model Type *        │ Trading Mode *      │             │
│ │ ┌─────────────┐     │ ┌─────────────┐    │             │
│ │ │ Lstm     ▼ │     │ │ Balanced  ▼ │    │             │
│ │ └─────────────┘     │ └─────────────┘    │             │
│ │                     │                     │             │
│ │ Use Stop Loss              [ON]           │             │
│ │ Enable automatic stop loss protection     │             │
│ │                                           │             │
│ │ Enable Retraining          [OFF]          │             │
│ │ Automatically retrain model periodically  │             │
│ │                                           │             │
│ │ Training Start Date                       │             │
│ │ [ 2024-01-01 📅 ]                         │             │
│ │ Model training data start date            │             │
│ │                                           │             │
│ │ Buy Signal Color    │ Sell Signal Color   │             │
│ │ 🎨 #10b981          │ 🎨 #ef4444          │             │
│ │                     │                     │             │
│ │ Model Name                                │             │
│ │ [default-model]                           │             │
│ │                                           │             │
│ │ Advanced Config                           │             │
│ │ ┌───────────────────────────┐             │             │
│ │ │ {                         │             │             │
│ │ │   "batchSize": 32,        │             │             │
│ │ │   "epochs": 100           │             │             │
│ │ │ }                         │             │             │
│ │ └───────────────────────────┘             │             │
│ └─────────────────────┴─────────────────────┘             │
│                                                             │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                             │
│ ⚠️ Risk Factors                                             │
│ • Model predictions may not be accurate in all market...   │
│ • Requires sufficient historical data for training         │
│ • Computational resources needed for model training        │
│ • Past performance does not guarantee future results       │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 使用步骤

### 1. 定义参数配置

在 `packages/core/src/config/strategy-registry.ts` 中添加你的策略配置。

### 2. 添加参数定义

在 `parameterDefinitions` 数组中定义每个参数的类型、验证规则等。

### 3. 设置默认值

在 `defaultParameters` 对象中设置每个参数的默认值。

### 4. 自动生成表单

表单会根据配置自动生成，无需编写任何 UI 代码！

---

## 📊 字段类型选择指南

| 数据类型 | 推荐字段类型 | 说明 |
|---------|------------|------|
| 整数 (0-100) | `range` | 可视化滑块，用户体验更好 |
| 整数 (>100) | `number` | 使用数字输入框 |
| 小数 | `number` | 精确数值输入 |
| 文本标识符 | `string` | 简单文本输入 |
| 预定义选项 | `enum` | 限制用户选择范围 |
| 开关选项 | `boolean` | 是/否选择 |
| 日期时间 | `date` | 日期选择器 |
| 颜色值 | `color` | 颜色选择器 |
| 复杂配置 | `object` | JSON 编辑器 |

---

## 🎯 最佳实践

### ✅ DO

1. **使用语义化的字段名**：`lookbackPeriod` 而不是 `p1`
2. **提供清晰的描述**：说明参数的作用和取值范围
3. **设置合理的默认值**：让用户快速开始使用
4. **使用 `range` 替代 `number`**：当值在 0-100 范围内时
5. **使用 `enum` 限制选项**：避免用户输入无效值
6. **标记必填字段**：使用 `required: true`
7. **添加单位说明**：使用 `unit` 属性（如 `'%'`, `'ms'`）

### ❌ DON'T

1. **不要使用缩写**：`lb` → `lookbackPeriod`
2. **不要省略描述**：总是添加有意义的描述
3. **不要使用过宽的范围**：`min: 0, max: 999999` → 设置合理范围
4. **不要对简单选项使用 `object`**：使用 `enum` 代替
5. **不要忘记验证规则**：添加 `min`, `max`, `pattern` 等

---

## 🔧 扩展新字段类型

如需添加新的字段类型，只需在以下两个地方修改：

### 1. 更新类型定义

在 `packages/core/src/config/strategy-registry.ts`：

```typescript
export interface StrategyParameterDefinition {
  type: 'number' | 'string' | 'boolean' | 'object' | 
         'date' | 'enum' | 'range' | 'color' | 
         'your-new-type'; // 添加新类型
  // ...
}
```

### 2. 添加渲染逻辑

在 `apps/web/components/strategy-parameter-form-dynamic.tsx` 的 `renderField` 函数中添加新的 `case`：

```typescript
case 'your-new-type':
  return (
    <div key={paramDef.name} className="space-y-2">
      {/* 你的自定义 UI 组件 */}
    </div>
  );
```

---

## 📚 相关文档

- [策略开发指南](./STRATEGY_DEVELOPMENT_GUIDE.md)
- [策略参数表单指南](./STRATEGY_PARAMETER_FORM_GUIDE.md)
- [策略快速参考](./STRATEGY_QUICK_REFERENCE.md)

---

**通过配置化的方式，添加新策略参数变得前所未有的简单！** 🎉

---

Author: xiaoweihsueh@gmail.com  
Date: October 11, 2025

