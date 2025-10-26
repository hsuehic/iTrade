# Strategy Type System - Final Design

## 📋 Overview

清晰的类型分层，确保运行时、配置和存储层的一致性。

## 🎯 Type Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                   Type System Layers                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Layer 1: Strategy Parameters (Pure Parameters)               │
│  ┌─────────────────────────────────────────────┐            │
│  │  StrategeParameters                             │            │
│  │  {                                          │            │
│  │    [key: string]: unknown                   │            │
│  │  }                                          │            │
│  │                                             │            │
│  │  Example: MovingAverageParameters              │            │
│  │  {                                          │            │
│  │    fastPeriod: number;                      │            │
│  │    slowPeriod: number;                      │            │
│  │    threshold: number;                       │            │
│  │  }                                          │            │
│  └─────────────────────────────────────────────┘            │
│                     │                                         │
│                     │                                         │
│  Layer 2: Runtime Context (System Metadata)                  │
│  ┌─────────────────────────────────────────────┐            │
│  │  StrategyRuntimeContext                     │            │
│  │  {                                          │            │
│  │    symbol: string;                          │            │
│  │    exchange: string | string[];             │            │
│  │    strategyId?: number;                     │            │
│  │    strategyName?: string;                   │            │
│  │    logger?: ILogger;                        │            │
│  │    subscription?: SubscriptionConfig;       │            │
│  │    initialData?: InitialDataConfig;         │            │
│  │    loadedInitialData?: InitialDataResult;   │            │
│  │  }                                          │            │
│  └─────────────────────────────────────────────┘            │
│                     │                                         │
│                     ├──────────────┐                         │
│                     ▼              ▼                         │
│  Layer 3: Complete Configuration (Runtime)                      │
│  ┌───────────────────────┐  ┌───────────────────┐          │
│  │ StrategyConfig<T>     │  │  BaseStrategy<T>  │          │
│  │ = TConfig +           │  │  uses typed       │          │
│  │   RuntimeContext      │  │  config           │          │
│  └───────────────────────┘  └───────────────────┘          │
│                     │                                         │
│                     ▼                                         │
│  Layer 4: Storage (Database Entity)                          │
│  ┌─────────────────────────────────────────────┐            │
│  │  StrategyEntity                             │            │
│  │  {                                          │            │
│  │    id: number;                              │            │
│  │    name: string;                            │            │
│  │    type: string; (class name)               │            │
│  │    symbol?: string; (separate column)       │            │
│  │    exchange?: string; (separate column)     │            │
│  │    parameters?: StrategyParameters; (jsonb) │            │
│  │  }                                          │            │
│  └─────────────────────────────────────────────┘            │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## ✅ Key Principles

### 1. Separation of Concerns

```typescript

interface MovingAverageParameters {
  fastPeriod: number;
  slowPeriod: number;
  threshold: number;
}


// ✅ Context: System-provided metadata
interface StrategyRuntimeContext {
  symbol: string;
  exchange: string;
  strategyId?: number;
  // ... system fields
}

interface StrategyConfig<T extends StrategyParameters> implements StrategyRuntimeContext {
  parameters: T;
}

// ✅ Config: Strategy-specific parameters
interface MovingAverageConfig =  StrategyConfig<MovingAverageParameters>;
 
```

### 2. Type Safety

```typescript
// ✅ Type-safe strategy registry
const STRATEGY_REGISTRY = {
  MovingAverageStrategy: {
    defaultParameters: {
      fastPeriod: 12,      // ✅ Type-checked
      slowPeriod: 26,
      threshold: 0.001,
    } as MovingAverageParameters,
  }
};

// ✅ Type-safe strategy class
class MovingAverageStrategy extends BaseStrategy<MovingAverageConfig> {
  constructor(config: MovingAverageConfig) {
    super(config);
    // this._config is typed as MovingAverageConfig
    // this._context is typed as StrategyRuntimeContext
  }
}
```

### 3. Database Consistency

```typescript
// ✅ Entity only stores config (not context)
@Entity('strategies')
class StrategyEntity {
  @Column({ type: 'text' })
  type!: string; // 'MovingAverageStrategy'
  
  @Column({ type: 'text' })
  symbol?: string; // Separate column
  
  @Column({ type: 'text' })
  exchange?: string; // Separate column
  
  @Column({ type: 'jsonb' })
  parameters?: StrategyParameters; // Only parameters, not full config
}

// When loading from database
const entity: StrategyEntity = await repo.findOne(id);

// Reconstruct complete parameters
const config: StrategyConfig<MovingAverageParameters> = {
  paramters: entity.parameters,  // Config from jsonb
  symbol: entity.symbol!, // Context from columns
  exchange: entity.exchange!,
  strategyId: entity.id,
  strategyName: entity.name,
};
```

## 📊 Usage Flow

### 1. Strategy Registration

```typescript
// packages/core/src/config/strategy-registry.ts
export interface MovingAverageParameters {
  fastPeriod: number;
  slowPeriod: number;
  threshold: number;

}
export interface MovingAverageConfig = StrategyConfig<MovingAverageParameters>;

export const STRATEGY_REGISTRY = {
  MovingAverageStrategy: {
    type: 'MovingAverageStrategy',
    name: 'Moving Average Crossover',
    defaultParameters: {
      fastPeriod: 12,
      slowPeriod: 26,
      threshold: 0.001,
    } as MovingAverageParameters,
    parameterDefinitions: [
      {
        name: 'fastPeriod',
        type: 'number',
        defaultValue: 12,
        min: 2,
        max: 100,
      },
      // ...
    ],
  },
};
```

### 2. Strategy Implementation

```typescript
// packages/strategies/src/strategies/MovingAverageStrategy.ts

export class MovingAverageStrategy extends BaseStrategy<MovingAverageConfig> {
  private fastPeriod: number;
  private slowPeriod: number;
  private threshold: number;

  constructor(config: MovingAverageConfig) {
    super('MovingAverageStrategy', config);
    
    // ✅ Type-safe config access
    this.fastPeriod = this._config.fastPeriod;
    this.slowPeriod = this._config.slowPeriod;
    this.threshold = this._config.threshold;
    
    // ✅ Type-safe context access
    this._logger.info(`Strategy for ${this._context.symbol} on ${this._context.exchange}`);
  }
}
```

### 3. Strategy Creation

```typescript
// packages/strategies/src/registry/strategy-factory.ts

export function createStrategyInstance<TConfig extends StrategyConfig>(
  type: StrategyTypeKey,
  customConfig: Partial<TConfig>,
  runtimeContext: StrategyRuntimeContext,
): IStrategy {
  const strategyConfig = getStrategyConfig(type);
  const defaultConfig = strategyConfig.defaultConfig;
  
  // Merge: default + custom + context
  const config: StrategyParameters<TConfig> = {
    ...defaultConfig,
    ...customConfig,
    ...runtimeContext,
  };
  
  const StrategyClass = getStrategyConstructor(type);
  return new StrategyClass(config);
}
```

### 4. Database Storage

```typescript
// Save strategy to database
await dataManager.createStrategy({
  name: 'My MA Strategy',
  type: 'MovingAverageStrategy',
  symbol: 'BTCUSDT',
  exchange: 'binance',
  parameters: {
    fastPeriod: 10,    // Only config
    slowPeriod: 30,
    threshold: 0.002,
  } as MovingAverageConfig,
});

// Load from database
const entity = await dataManager.getStrategy(id);

// Create instance with complete parameters
const strategy = createStrategyInstance<MovingAverageConfig>(
  {
    type: entity.type,
    parameters: entity.parameters|| {},,
    symbol: entity.symbol!,
    exchange: entity.exchange!,
    strategyId: entity.id,
    strategyName: entity.name,
    logger: myLogger,
  }
);
```

## 🎯 Benefits

### 1. Clear Separation

- **Config**: Pure strategy parameters
- **Context**: System metadata
- **No mixing**: Never confuse the two

### 2. Type Safety

- Compile-time checking
- IDE autocomplete
- Refactoring safety

### 3. Database Efficiency

- No redundant data in jsonb
- Proper indexing on columns
- Clear schema

### 4. Maintainability

- Easy to understand
- Easy to extend
- Self-documenting

## 📝 Summary

| Aspect | Old System | New System |
|--------|-----------|------------|
| Type Safety | ❌ No | ✅ Yes |
| Separation | ❌ Mixed | ✅ Clear |
| Database | ❌ Redundant | ✅ Efficient |
| Maintainability | ❌ Confusing | ✅ Clear |
| Extensibility | ❌ Hard | ✅ Easy |

---

Author: <xiaoweihsueh@gmail.com>  
Date: October 26, 2025
