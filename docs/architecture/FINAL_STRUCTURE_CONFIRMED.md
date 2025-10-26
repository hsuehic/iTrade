# 最终确认的策略类型系统结构

## ✅ 已实现的最终结构

### 核心类型定义

```typescript
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
 * Parameters are nested under 'parameters' field for clarity
 */
export type StrategyConfig<TParams extends StrategyParameters = StrategyParameters> =
  StrategyRuntimeContext & {
    type: string; // Strategy type/class name (e.g., "MovingAverageStrategy")
    parameters: TParams; // Strategy-specific parameters (嵌套结构)
  };
```

### BaseStrategy 实现

```typescript
export abstract class BaseStrategy<TParams extends StrategyParameters = StrategyParameters>
  extends EventEmitter
  implements IStrategy
{
  protected _parameters: TParams;
  protected _context: StrategyRuntimeContext;
  private _strategyType: string;  // ← private 字段

  // ✅ strategyType 作为 getter
  public get strategyType(): string {
    return this._strategyType;
  }

  // ✅ 构造函数只接受 config，从中提取 type
  constructor(config: StrategyConfig<TParams>) {
    super();

    // 提取所有字段
    const {
      type,          // ← 从 config 提取
      parameters,    // ← 嵌套的 parameters
      symbol,
      exchange,
      strategyId,
      strategyName,
      logger,
      subscription,
      initialData,
      loadedInitialData,
    } = config;

    this._strategyType = type;
    this._parameters = parameters;
    this._context = {
      symbol,
      exchange,
      strategyId,
      strategyName,
      logger,
      subscription,
      initialData,
      loadedInitialData,
    };

    // ... 其余初始化
  }

  // ✅ config getter 返回完整结构
  public get config(): any {
    return {
      type: this._strategyType,
      parameters: { ...this._parameters },
      ...this._context,
    };
  }

  // ✅ parameters getter 只返回参数
  public get parameters(): TParams {
    return { ...this._parameters };
  }

  // ✅ context getter 只返回上下文
  public get context(): any {
    return { ...this._context };
  }

  // 工具方法
  protected getParameter<K extends keyof TParams>(key: K): TParams[K] {
    return this._parameters[key];
  }

  protected setParameter<K extends keyof TParams>(key: K, value: TParams[K]): void {
    this._parameters[key] = value;
  }

  protected validateParameters(requiredParams: (keyof TParams)[]): void {
    const missing = requiredParams.filter((param) => !(param in this._parameters));
    if (missing.length > 0) {
      throw new Error(
        `Missing required parameters for strategy ${this.strategyType}: ${missing.map(String).join(', ')}`,
      );
    }
  }
}
```

### 策略实现示例

```typescript
export class MovingAverageStrategy extends BaseStrategy<MovingAverageParameters> {
  // ✅ 构造函数只接受 config
  constructor(config: MovingAverageConfig) {
    super(config);  // ← 不再传递 type
  }

  protected async onInitialize(): Promise<void> {
    this.validateParameters(['fastPeriod', 'slowPeriod', 'threshold']);

    const fastPeriod = this.getParameter('fastPeriod');
    const slowPeriod = this.getParameter('slowPeriod');
    // ...
  }
}
```

### 策略工厂

```typescript
export function createStrategyInstance<TParams extends StrategyParameters>(
  type: StrategyTypeKey,
  customConfig: Partial<StrategyConfig<TParams>>,
  strategyId?: number,
  strategyName?: string,
): IStrategy {
  const StrategyClass = getStrategyConstructor(type);
  const defaultParameters = getStrategyDefaultParameters(type);
  
  // 从 customConfig 中提取 parameters 和其他字段
  const { parameters: customParams, ...contextFields } = customConfig as any;
  
  // ✅ 构建完整配置（嵌套结构）
  const fullConfig: StrategyConfig<TParams> = {
    type, // ← Strategy type
    parameters: {  // ← 嵌套的 parameters
      ...defaultParameters,
      ...customParams,
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

  // ✅ 实例化策略
  return new StrategyClass(fullConfig);
}
```

## 📊 核心特点

### 1. 清晰的嵌套结构

```typescript
const config: StrategyConfig<MovingAverageParameters> = {
  // Strategy type
  type: 'MovingAverageStrategy',
  
  // ✅ Parameters 嵌套在这里
  parameters: {
    fastPeriod: 10,
    slowPeriod: 20,
    threshold: 0.002,
  },
  
  // Runtime context (展开)
  symbol: 'BTC/USDT',
  exchange: 'binance',
  strategyId: 123,
  strategyName: 'My MA Strategy',
  logger: customLogger,
};
```

### 2. 数据库一致性

```typescript
// ✅ 数据库 Entity
@Entity('strategies')
export class StrategyEntity {
  @Column({ type: 'text' })
  type!: string;  // ← Strategy class name

  @Column({ type: 'jsonb' })
  parameters?: StrategyParameters;  // ← 只存储参数

  // 运行时上下文存储在独立列
  @Column({ type: 'text' })
  symbol?: string;

  @Column({ type: 'text' })
  exchange?: string;
}
```

### 3. strategyType 作为 getter

```typescript
// ✅ 不是构造函数参数，而是从 config 提取
private _strategyType: string;

public get strategyType(): string {
  return this._strategyType;
}

constructor(config: StrategyConfig<TParams>) {
  const { type, parameters, ...context } = config;
  this._strategyType = type;  // ← 从 config 设置
}
```

## 🎯 关键优势

1. **结构清晰**: `parameters` 明确嵌套，不与 context 混合
2. **类型安全**: 完整的泛型支持
3. **语义一致**: 字段名与用途完全匹配
4. **易于理解**: 嵌套结构更直观
5. **扩展性强**: 易于添加新的 context 字段

## ✅ 当前状态

- ✅ 类型定义已更新
- ✅ BaseStrategy 已实现
- ✅ 所有策略实现已更新
- ✅ 策略工厂已更新
- ⚠️ 剩余少量编译错误需要修复（主要是 StrategyLoader 和测试文件）

---

**Author**: xiaoweihsueh@gmail.com  
**Date**: October 26, 2025  
**Status**: 最终结构已确认并实现

