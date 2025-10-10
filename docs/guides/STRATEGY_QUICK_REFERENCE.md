# ⚡ 策略开发快速参考

## 🚀 5分钟创建新策略

### 1️⃣ 添加策略配置 (2分钟)

**文件**: `packages/core/src/config/strategy-registry.ts`

```typescript
// 1. 添加类型
export type StrategyTypeKey = 
  | 'moving_average' 
  | 'your_strategy'  // 🆕 添加这里

// 2. 添加配置
your_strategy: {
  type: 'your_strategy',
  name: 'Your Strategy Name',
  icon: '🎯',
  description: 'Your strategy description',
  category: 'trend', // 'trend' | 'momentum' | 'volatility' | 'custom'
  implemented: false,
  defaultParameters: {
    param1: 100,
    param2: 0.5,
    subscription: { ticker: true, klines: true, method: 'rest' }
  },
  parameterDefinitions: [
    {
      name: 'param1',
      type: 'number',
      description: 'Parameter 1 description',
      defaultValue: 100,
      required: true,
      min: 1,
      max: 1000,
    }
  ]
}
```

### 2️⃣ 实现策略类 (2分钟)

**文件**: `packages/strategies/src/strategies/YourStrategy.ts`

```typescript
import { Decimal } from 'decimal.js';
import { BaseStrategy, StrategyResult, StrategyParameters, Ticker } from '@itrade/core';

export interface YourStrategyParameters extends StrategyParameters {
  param1: number;
  param2: number;
}

export class YourStrategy extends BaseStrategy {
  private yourData: any[] = [];

  constructor(parameters: YourStrategyParameters) {
    super('YourStrategy', parameters);
  }

  protected async onInitialize(): Promise<void> {
    this.validateParameters(['param1', 'param2']);
    // 初始化逻辑
  }

  public async analyze(marketData: { ticker?: Ticker }): Promise<StrategyResult> {
    this.ensureInitialized();
    
    if (!marketData.ticker) {
      return { action: 'hold', reason: 'No ticker data' };
    }

    // 🎯 你的策略逻辑在这里
    const price = marketData.ticker.price;
    const param1 = this.getParameter<number>('param1');
    
    // 示例：简单价格比较
    if (price.gt(param1)) {
      this.recordSignal('buy');
      return { action: 'buy', reason: `Price ${price} > ${param1}` };
    } else if (price.lt(param1 * 0.9)) {
      this.recordSignal('sell');
      return { action: 'sell', reason: `Price ${price} < ${param1 * 0.9}` };
    }

    return { action: 'hold', reason: 'No signal' };
  }

  // 🔥 状态管理 (可选但推荐)
  protected async getIndicatorData(): Promise<Record<string, unknown>> {
    return {
      dataLength: this.yourData.length,
      lastUpdate: new Date(),
      // 保存你的指标数据
    };
  }

  protected async setIndicatorData(data: Record<string, unknown>): Promise<void> {
    // 恢复你的指标数据
    if (data.yourData) {
      this.yourData = data.yourData as any[];
    }
  }
}
```

### 3️⃣ 注册策略 (1分钟)

**文件1**: `packages/strategies/src/registry/strategy-factory.ts`
```typescript
import { YourStrategy } from '../strategies/YourStrategy';

export const IMPLEMENTED_STRATEGIES = {
  // ... 现有策略
  your_strategy: YourStrategy,  // 🆕 添加这里
};
```

**文件2**: `packages/strategies/src/index.ts`
```typescript
export { YourStrategy } from './strategies/YourStrategy';           // 🆕
export type { YourStrategyParameters } from './strategies/YourStrategy';  // 🆕
```

**文件3**: `packages/data-manager/src/entities/Strategy.ts`
```typescript
export enum StrategyType {
  // ... 现有类型
  YOUR_STRATEGY = 'your_strategy',  // 🆕
}
```

### 4️⃣ 构建和测试
```bash
# 构建包
cd packages/core && pnpm build
cd ../strategies && pnpm build

# 重启console
cd ../../apps/console
pm2 restart iTrade-console

# 查看日志确认策略注册
pm2 logs | grep "Available strategy implementations"
```

## 📊 常用策略模式

### 📈 趋势跟踪策略

```typescript
public async analyze(marketData: { ticker?: Ticker }): Promise<StrategyResult> {
  const price = marketData.ticker!.price;
  
  // 更新移动平均
  this.priceHistory.push(price);
  if (this.priceHistory.length > this.period) {
    this.priceHistory.shift();
  }
  
  const ma = this.calculateMA();
  
  if (price.gt(ma.times(1.01))) {  // 价格突破MA 1%
    return { action: 'buy', reason: `Trend up: ${price} > MA ${ma}` };
  } else if (price.lt(ma.times(0.99))) {  // 价格跌破MA 1%
    return { action: 'sell', reason: `Trend down: ${price} < MA ${ma}` };
  }
  
  return { action: 'hold', reason: 'No trend signal' };
}
```

### 📊 振荡器策略

```typescript
public async analyze(marketData: { ticker?: Ticker }): Promise<StrategyResult> {
  const price = marketData.ticker!.price;
  
  // 计算RSI或其他振荡器
  const oscillator = this.calculateOscillator(price);
  
  const overbought = this.getParameter<number>('overbought');
  const oversold = this.getParameter<number>('oversold');
  
  if (oscillator > overbought) {
    return { action: 'sell', reason: `Overbought: ${oscillator} > ${overbought}` };
  } else if (oscillator < oversold) {
    return { action: 'buy', reason: `Oversold: ${oscillator} < ${oversold}` };
  }
  
  return { action: 'hold', reason: `Neutral: ${oscillator}` };
}
```

### 🎯 价格行动策略

```typescript
public async analyze(marketData: { ticker?: Ticker }): Promise<StrategyResult> {
  const price = marketData.ticker!.price;
  
  // 支撑/阻力位
  const support = this.getParameter<number>('support');
  const resistance = this.getParameter<number>('resistance');
  
  if (price.lte(support)) {
    return { action: 'buy', reason: `Support bounce: ${price} <= ${support}` };
  } else if (price.gte(resistance)) {
    return { action: 'sell', reason: `Resistance rejection: ${price} >= ${resistance}` };
  }
  
  return { action: 'hold', reason: 'In range' };
}
```

## 🔧 常用工具方法

### 计算移动平均
```typescript
private calculateMA(period: number = this.getParameter('period')): Decimal {
  if (this.priceHistory.length < period) return new Decimal(0);
  
  const sum = this.priceHistory
    .slice(-period)
    .reduce((acc, price) => acc.plus(price), new Decimal(0));
  
  return sum.div(period);
}
```

### 计算标准差
```typescript
private calculateStdDev(period: number): Decimal {
  if (this.priceHistory.length < period) return new Decimal(0);
  
  const prices = this.priceHistory.slice(-period);
  const mean = this.calculateMA(period);
  
  const variance = prices
    .map(p => p.minus(mean).pow(2))
    .reduce((acc, v) => acc.plus(v), new Decimal(0))
    .div(period);
  
  return variance.sqrt();
}
```

### 价格变化率
```typescript
private getPriceChange(periods: number = 1): Decimal {
  if (this.priceHistory.length <= periods) return new Decimal(0);
  
  const current = this.priceHistory[this.priceHistory.length - 1];
  const previous = this.priceHistory[this.priceHistory.length - 1 - periods];
  
  return current.minus(previous).div(previous);
}
```

## 🎯 调试技巧

### 添加调试日志
```typescript
public async analyze(marketData: any): Promise<StrategyResult> {
  const price = marketData.ticker?.price;
  
  // 调试信息
  this.emit('debug', {
    strategyId: this.getStrategyId(),
    price: price?.toString(),
    indicators: this.getIndicators(),
    parameters: this.parameters,
  });
  
  // ... 策略逻辑
}
```

### 状态检查
```typescript
public getDebugInfo() {
  return {
    initialized: this._isInitialized,
    position: this.getCurrentPosition().toString(),
    lastSignal: this.getLastSignal(),
    dataPoints: this.priceHistory.length,
    // 添加你的调试信息
  };
}
```

## ⚠️ 常见错误

### ❌ 参数验证不足
```typescript
// 错误
constructor(parameters) {
  super('Strategy', parameters);
}

// 正确
protected async onInitialize(): Promise<void> {
  this.validateParameters(['period', 'threshold']);
  
  const period = this.getParameter<number>('period');
  if (period < 1) throw new Error('Period must be positive');
}
```

### ❌ 状态管理缺失
```typescript
// 错误 - 没有状态保存
private indicators = [];

// 正确 - 实现状态保存
protected async getIndicatorData(): Promise<Record<string, unknown>> {
  return {
    indicators: this.indicators,
    lastUpdate: new Date(),
  };
}
```

### ❌ 内存泄漏
```typescript
// 错误 - 无限增长
this.priceHistory.push(price);

// 正确 - 限制历史长度  
this.priceHistory.push(price);
if (this.priceHistory.length > this.maxHistory) {
  this.priceHistory.shift();
}
```

## ✅ 最佳实践清单

- [ ] 策略配置添加到注册表
- [ ] 参数类型接口定义
- [ ] 继承 BaseStrategy
- [ ] 实现必要的方法
- [ ] 参数验证
- [ ] 状态管理方法
- [ ] 错误处理
- [ ] 单元测试
- [ ] 注册到工厂
- [ ] 构建测试
- [ ] 集成测试
- [ ] 监控日志

## 🎉 快速检查

```bash
# 策略是否注册成功？
curl http://localhost:3000/api/strategies/types

# 策略配置是否正确？
curl http://localhost:3000/api/strategies/config/your_strategy

# 策略运行状态？
curl http://localhost:3000/api/strategies/1/status
```

现在你可以在5分钟内创建一个新的交易策略！🚀
