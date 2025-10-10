# 🚀 策略配置系统快速入门

## 📋 概述

新的策略配置系统让你可以轻松添加和管理交易策略，无需在多个地方修改代码。

## 🎯 核心概念

### 📦 包结构
- **@itrade/core**: 策略配置和元数据
- **@itrade/strategies**: 策略实现和工厂方法
- **应用层**: 使用策略包的方法

### 🔍 查看可用策略

```typescript
import { 
  getImplementedStrategies,
  getAllStrategiesWithImplementationStatus,
  getImplementationStats 
} from '@itrade/strategies';

// 获取已实现的策略
const implemented = getImplementedStrategies();
console.log('已实现的策略:', implemented.map(s => s.name));

// 获取所有策略及实现状态
const all = getAllStrategiesWithImplementationStatus();
all.forEach(strategy => {
  console.log(`${strategy.name}: ${strategy.isImplemented ? '✅' : '🚧'}`);
});

// 获取实现统计
const stats = getImplementationStats();
console.log(`实现进度: ${stats.implemented}/${stats.total} (${stats.implementationRate}%)`);
```

### 🏭 创建策略实例

```typescript
import { createStrategyInstance } from '@itrade/strategies';

// 创建移动平均策略
const strategy = createStrategyInstance(
  'moving_average',
  {
    fastPeriod: 10,
    slowPeriod: 20,
    threshold: 0.005,
  },
  {
    symbol: 'BTC/USDT',
    exchange: 'binance',
    logger: console, // 可选
  }
);

// 初始化策略
await strategy.initialize(strategy.parameters);

// 使用策略分析市场数据
const result = await strategy.analyze({
  ticker: { price: new Decimal('50000'), volume: new Decimal('100') },
});

console.log('策略信号:', result.action, result.reason);
```

## 🚀 添加新策略示例

假设我们要添加一个简单的RSI策略：

### 1. 📋 更新配置

**文件**: `packages/core/src/config/strategy-registry.ts`

```typescript
export type StrategyTypeKey = 
  | 'moving_average' 
  | 'rsi' // ← 添加新类型
  | 'macd' 
  | 'bollinger_bands' 
  | 'custom';

export const STRATEGY_REGISTRY: Record<StrategyTypeKey, StrategyConfig> = {
  // ... existing strategies
  
  rsi: {
    type: 'rsi',
    name: 'RSI Strategy',
    description: 'Relative Strength Index momentum strategy',
    icon: '📊',
    implemented: false, // 由策略包动态确定
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
  },
};
```

### 2. 🏗️ 实现策略类

**文件**: `packages/strategies/src/strategies/RSIStrategy.ts`

```typescript
import { Decimal } from 'decimal.js';
import {
  BaseStrategy,
  StrategyResult,
  StrategyParameters,
  Ticker,
  Kline,
} from '@itrade/core';

export interface RSIParameters extends StrategyParameters {
  period: number;
  overboughtLevel: number;
  oversoldLevel: number;
}

export class RSIStrategy extends BaseStrategy {
  private priceHistory: Decimal[] = [];
  private rsi: number = 50;

  constructor(parameters: RSIParameters) {
    super('RSIStrategy', parameters);
  }

  protected async onInitialize(): Promise<void> {
    this.validateParameters(['period', 'overboughtLevel', 'oversoldLevel']);
    
    const period = this.getParameter<number>('period');
    const overbought = this.getParameter<number>('overboughtLevel');
    const oversold = this.getParameter<number>('oversoldLevel');
    
    if (period < 2) throw new Error('Period must be at least 2');
    if (overbought <= oversold) throw new Error('Overbought level must be higher than oversold level');
    
    this.priceHistory = [];
  }

  public async analyze(marketData: {
    ticker?: Ticker;
    klines?: Kline[];
  }): Promise<StrategyResult> {
    this.ensureInitialized();

    // 获取当前价格
    let currentPrice: Decimal;
    if (marketData.ticker) {
      currentPrice = marketData.ticker.price;
    } else if (marketData.klines && marketData.klines.length > 0) {
      const latestKline = marketData.klines[marketData.klines.length - 1];
      currentPrice = latestKline.close;
    } else {
      return { action: 'hold', reason: 'No price data available' };
    }

    // 更新价格历史
    this.priceHistory.push(currentPrice);
    const period = this.getParameter<number>('period');
    
    // 保留所需的历史数据
    if (this.priceHistory.length > period + 1) {
      this.priceHistory = this.priceHistory.slice(-(period + 1));
    }

    // 需要足够的数据计算RSI
    if (this.priceHistory.length < period + 1) {
      return { action: 'hold', reason: 'Insufficient data for RSI calculation' };
    }

    // 计算RSI
    this.rsi = this.calculateRSI();

    // 生成信号
    const overbought = this.getParameter<number>('overboughtLevel');
    const oversold = this.getParameter<number>('oversoldLevel');

    if (this.rsi < oversold) {
      return {
        action: 'buy',
        reason: `RSI oversold: ${this.rsi.toFixed(2)} < ${oversold}`,
        confidence: Math.min((oversold - this.rsi) / 10, 1),
      };
    } else if (this.rsi > overbought) {
      return {
        action: 'sell',
        reason: `RSI overbought: ${this.rsi.toFixed(2)} > ${overbought}`,
        confidence: Math.min((this.rsi - overbought) / 10, 1),
      };
    }

    return { 
      action: 'hold', 
      reason: `RSI neutral: ${this.rsi.toFixed(2)}`,
    };
  }

  private calculateRSI(): number {
    const prices = this.priceHistory;
    const period = this.getParameter<number>('period');
    
    if (prices.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    // 计算价格变化
    for (let i = 1; i < prices.length; i++) {
      const change = prices[i].minus(prices[i - 1]).toNumber();
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }

    // 平均收益和损失
    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100; // 没有损失，RSI = 100
    
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    
    return Math.round(rsi * 100) / 100; // 保留2位小数
  }
}
```

### 3. 🏭 注册策略

**文件**: `packages/strategies/src/registry/strategy-factory.ts`

```typescript
import { RSIStrategy } from '../strategies/RSIStrategy'; // 添加导入

export const IMPLEMENTED_STRATEGIES: Partial<Record<StrategyTypeKey, StrategyConstructor>> = {
  moving_average: MovingAverageStrategy,
  custom: MovingAverageStrategy,
  rsi: RSIStrategy, // 🎯 注册新策略
};
```

### 4. 📤 导出策略

**文件**: `packages/strategies/src/index.ts`

```typescript
// Strategies
export { MovingAverageStrategy } from './strategies/MovingAverageStrategy';
export type { MovingAverageParameters } from './strategies/MovingAverageStrategy';
export { RSIStrategy } from './strategies/RSIStrategy'; // 添加导出
export type { RSIParameters } from './strategies/RSIStrategy';
```

### 5. 🎉 使用新策略

```typescript
import { createStrategyInstance, isStrategyImplemented } from '@itrade/strategies';

// 检查策略是否可用
if (isStrategyImplemented('rsi')) {
  // 创建RSI策略实例
  const rsiStrategy = createStrategyInstance(
    'rsi',
    {
      period: 21,           // 自定义周期
      overboughtLevel: 75,  // 自定义超买线
      oversoldLevel: 25,    // 自定义超卖线
    },
    {
      symbol: 'ETH/USDT',
      exchange: 'binance',
    }
  );

  console.log('✅ RSI策略创建成功!');
}
```

## 🎯 在应用中使用

### 📱 Web应用

策略选择器会自动显示新策略：

```tsx
// 自动显示所有已实现的策略，包括新添加的RSI
{getAllStrategiesWithImplementationStatus().map(strategy => (
  <SelectItem 
    key={strategy.type} 
    value={strategy.type}
    disabled={!strategy.isImplemented}
  >
    <span>{strategy.icon}</span>
    {strategy.name}
    {!strategy.isImplemented && <span>Coming Soon</span>}
  </SelectItem>
))}
```

### 🖥️ Console应用

Console会自动发现并使用新策略：

```
📈 Available strategy implementations: 3
  ✅ Moving Average Crossover (moving_average)
  ✅ Custom Strategy (custom) 
  ✅ RSI Strategy (rsi)            ← 新策略自动显示
```

## 🔧 开发提示

### ✅ 最佳实践

1. **先配置后实现**: 总是先在配置文件中定义，然后实现
2. **参数验证**: 在 `onInitialize` 中验证所有必需参数
3. **错误处理**: 提供清晰的错误消息
4. **文档完整**: 填写完整的策略文档

### 🐛 常见问题

**Q: 策略显示"Coming Soon"？**
A: 检查策略是否在 `IMPLEMENTED_STRATEGIES` 中注册

**Q: 参数验证失败？**
A: 确保默认参数与参数定义一致

**Q: TypeScript 错误？**
A: 检查参数接口是否继承 `StrategyParameters`

## 🎉 总结

新系统的优势：
- **🎯 配置驱动**: 添加策略只需几个步骤
- **🔍 真实状态**: 实现状态自动同步
- **🚀 类型安全**: 完整的TypeScript支持
- **📊 自动验证**: 开发时检查一致性

现在添加新策略变得非常简单！🚀
