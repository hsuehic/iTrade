# @crypto-trading/strategies

Collection of cryptocurrency trading strategies with comprehensive technical analysis support.

## Overview

This package provides battle-tested trading strategies and technical indicators for cryptocurrency markets:

- **Pre-built Strategies** - Ready-to-use trading algorithms
- **Strategy Framework** - Foundation for custom strategy development
- **Technical Indicators** - Comprehensive TA library
- **Parameter Optimization** - Built-in parameter tuning support
- **Risk Management** - Integrated position sizing and risk controls

## Features

### 📊 Built-in Strategies

- Moving Average Crossover
- RSI Mean Reversion
- Bollinger Band Squeeze
- Momentum Trading
- Grid Trading

### 🔧 Strategy Framework

- `BaseStrategy` foundation class
- Lifecycle management (initialize, analyze, cleanup)
- Parameter validation and management
- Event-driven architecture

### 📈 Technical Indicators

- Trend indicators (SMA, EMA, MACD)
- Oscillators (RSI, Stochastic, CCI)
- Volatility indicators (Bollinger Bands, ATR)
- Volume indicators (OBV, VWAP)

## Installation

```bash
pnpm add @crypto-trading/strategies @crypto-trading/core
```

## Usage

### Moving Average Strategy

```typescript
import { MovingAverageStrategy } from '@crypto-trading/strategies';

const strategy = new MovingAverageStrategy({
  fastPeriod: 10,        // Fast MA period
  slowPeriod: 20,        // Slow MA period  
  threshold: 0.001,      // 0.1% minimum crossover
  baseQuantity: 100      // Base position size
});

// Initialize with parameters
await strategy.initialize(strategy.parameters);

// Analyze market data
const signal = await strategy.analyze({
  ticker: currentTicker,
  klines: recentCandles
});

if (signal.action !== 'hold') {
  console.log(`Signal: ${signal.action} ${signal.quantity} at ${signal.price}`);
  console.log(`Confidence: ${signal.confidence}`);
  console.log(`Reason: ${signal.reason}`);
}
```

### Custom Strategy Development

```typescript
import { BaseStrategy, StrategyResult } from '@crypto-trading/strategies';

class MyCustomStrategy extends BaseStrategy {
  private indicator: MyIndicator;

  constructor(parameters: MyStrategyParameters) {
    super('MyCustomStrategy', parameters);
  }

  protected async onInitialize(): Promise<void> {
    // Validate required parameters
    this.validateParameters(['period', 'threshold', 'stopLoss']);
    
    // Initialize indicators
    this.indicator = new MyIndicator(this.getParameter('period'));
  }

  public async analyze(marketData: any): Promise<StrategyResult> {
    this.ensureInitialized();

    const { ticker, klines } = marketData;
    
    // Update indicators
    this.indicator.update(ticker.price);
    
    // Generate signals
    if (this.indicator.bullishSignal()) {
      return {
        action: 'buy',
        quantity: this.calculatePositionSize(ticker.price),
        price: ticker.price,
        stopLoss: this.calculateStopLoss(ticker.price),
        takeProfit: this.calculateTakeProfit(ticker.price),
        confidence: this.indicator.confidence,
        reason: 'Bullish indicator signal'
      };
    }

    if (this.indicator.bearishSignal()) {
      return {
        action: 'sell',
        quantity: this.getCurrentPosition(),
        price: ticker.price,
        confidence: this.indicator.confidence,
        reason: 'Bearish indicator signal'
      };
    }

    return { action: 'hold' };
  }

  private calculatePositionSize(price: Decimal): Decimal {
    const riskAmount = this.getParameter<Decimal>('riskPerTrade');
    const stopLoss = this.getParameter<Decimal>('stopLossPercent');
    
    return riskAmount.div(price.mul(stopLoss));
  }
}
```

## Built-in Strategies

### 1. Moving Average Crossover

Classic trend-following strategy using two moving averages.

```typescript
const maStrategy = new MovingAverageStrategy({
  fastPeriod: 12,     // Fast MA periods
  slowPeriod: 26,     // Slow MA periods
  threshold: 0.002,   // 0.2% crossover threshold
  baseQuantity: 1000  // Base trade size
});
```

**Parameters:**

- `fastPeriod` - Fast moving average period
- `slowPeriod` - Slow moving average period  
- `threshold` - Minimum crossover percentage
- `baseQuantity` - Base position size

**Signals:**

- **Buy**: Fast MA crosses above Slow MA
- **Sell**: Fast MA crosses below Slow MA

### 2. RSI Strategy

Mean reversion strategy using Relative Strength Index.

```typescript
const rsiStrategy = new RSIStrategy({
  period: 14,         // RSI calculation period
  overbought: 70,     // Overbought level
  oversold: 30,       // Oversold level
  divergenceEnabled: true
});
```

**Parameters:**

- `period` - RSI calculation period
- `overbought` - Overbought threshold (0-100)
- `oversold` - Oversold threshold (0-100)
- `divergenceEnabled` - Enable divergence detection

**Signals:**

- **Buy**: RSI < oversold level
- **Sell**: RSI > overbought level

### 3. Bollinger Bands Strategy

Volatility-based strategy using Bollinger Bands.

```typescript
const bbStrategy = new BollingerBandsStrategy({
  period: 20,         // Moving average period
  standardDeviations: 2,  // Band width multiplier
  squeezeThreshold: 0.1   // Squeeze detection
});
```

**Signals:**

- **Buy**: Price touches lower band and bounces
- **Sell**: Price touches upper band and reverses
- **Breakout**: Price breaks bands during squeeze

## Strategy Lifecycle

### Initialization

```typescript
// Strategy initialization with parameter validation
await strategy.initialize({
  period: 14,
  threshold: 0.05,
  riskPerTrade: 0.02
});

// Listen for initialization events
strategy.on('initialized', (strategyName) => {
  console.log(`${strategyName} initialized successfully`);
});
```

### Market Analysis

```typescript
// Continuous market analysis
const marketData = {
  ticker: await exchange.getTicker('BTCUSDT'),
  orderbook: await exchange.getOrderBook('BTCUSDT'),
  klines: await exchange.getKlines('BTCUSDT', '1h', startTime, endTime)
};

const result = await strategy.analyze(marketData);
```

### Event Handling

```typescript
// Listen for strategy events
strategy.on('orderFilled', (order) => {
  console.log(`Order filled: ${order.id}`);
});

strategy.on('positionChanged', (position) => {
  console.log(`Position updated: ${position.size}`);
});

strategy.on('error', (error) => {
  console.error('Strategy error:', error);
});
```

### Cleanup

```typescript
// Proper cleanup
await strategy.cleanup();

strategy.on('cleanup', (strategyName) => {
  console.log(`${strategyName} cleaned up`);
});
```

## Technical Indicators

### Trend Indicators

```typescript
import { SMA, EMA, MACD } from '@crypto-trading/strategies';

// Simple Moving Average
const sma = new SMA(20);
sma.update(price);
console.log('SMA:', sma.getValue());

// Exponential Moving Average  
const ema = new EMA(12);
ema.update(price);
console.log('EMA:', ema.getValue());

// MACD
const macd = new MACD(12, 26, 9);
macd.update(price);
console.log('MACD:', macd.getValue());
console.log('Signal:', macd.getSignal());
console.log('Histogram:', macd.getHistogram());
```

### Oscillators

```typescript
import { RSI, Stochastic, CCI } from '@crypto-trading/strategies';

// RSI
const rsi = new RSI(14);
rsi.update(price);
console.log('RSI:', rsi.getValue()); // 0-100

// Stochastic
const stoch = new Stochastic(14, 3, 3);
stoch.update(high, low, close);
console.log('Stochastic %K:', stoch.getPercentK());
console.log('Stochastic %D:', stoch.getPercentD());
```

### Volatility Indicators

```typescript
import { BollingerBands, ATR } from '@crypto-trading/strategies';

// Bollinger Bands
const bb = new BollingerBands(20, 2);
bb.update(price);
console.log('Upper Band:', bb.getUpperBand());
console.log('Middle Band:', bb.getMiddleBand());  
console.log('Lower Band:', bb.getLowerBand());

// Average True Range
const atr = new ATR(14);
atr.update(high, low, close);
console.log('ATR:', atr.getValue());
```

## Parameter Optimization

### Grid Search

```typescript
import { ParameterOptimizer } from '@crypto-trading/strategies';

const optimizer = new ParameterOptimizer();

// Define parameter ranges
const parameterRanges = {
  fastPeriod: [5, 10, 15, 20],
  slowPeriod: [20, 30, 40, 50],
  threshold: [0.001, 0.002, 0.005, 0.01]
};

// Run optimization
const results = await optimizer.optimize(
  MovingAverageStrategy,
  parameterRanges,
  historicalData,
  {
    metric: 'sharpeRatio',
    direction: 'maximize'
  }
);

console.log('Best parameters:', results.bestParameters);
console.log('Best performance:', results.bestScore);
```

### Walk-Forward Analysis

```typescript
const wfa = new WalkForwardAnalysis();

const results = await wfa.analyze(
  MovingAverageStrategy,
  parameterRanges,
  historicalData,
  {
    trainingPeriod: 252,  // 1 year
    testingPeriod: 63,    // 3 months
    stepSize: 21          // 1 month
  }
);

console.log('Out-of-sample performance:', results.oosPerformance);
```

## Risk Management

### Position Sizing

```typescript
class MyStrategy extends BaseStrategy {
  private calculatePositionSize(price: Decimal, confidence: number): Decimal {
    const accountBalance = this.getParameter<Decimal>('accountBalance');
    const maxRiskPerTrade = this.getParameter<number>('maxRiskPerTrade', 0.02);
    const stopLossPercent = this.getParameter<number>('stopLoss', 0.05);
    
    // Kelly criterion with confidence scaling
    const kellyFraction = confidence * maxRiskPerTrade;
    const riskAmount = accountBalance.mul(kellyFraction);
    
    return riskAmount.div(price.mul(stopLossPercent));
  }
}
```

### Stop Loss Management

```typescript
class MyStrategy extends BaseStrategy {
  private updateStopLoss(currentPrice: Decimal, entryPrice: Decimal): Decimal {
    const staticStopLoss = entryPrice.mul(0.95); // 5% stop loss
    const trailingStopLoss = currentPrice.mul(0.98); // 2% trailing stop
    
    // Use the higher of static or trailing stop
    return Decimal.max(staticStopLoss, trailingStopLoss);
  }
}
```

## Testing

```bash
# Run strategy tests
pnpm test

# Backtest strategies
pnpm test:backtest

# Performance benchmarks  
pnpm test:performance
```

## Examples

### Complete Strategy Implementation

```typescript
import { BaseStrategy, StrategyResult, SMA, RSI } from '@crypto-trading/strategies';

interface TrendFollowingParameters extends StrategyParameters {
  smaPeriod: number;
  rsiPeriod: number;
  rsiOverbought: number;
  rsiOversold: number;
  riskPerTrade: number;
}

class TrendFollowingStrategy extends BaseStrategy {
  private sma: SMA;
  private rsi: RSI;
  
  constructor(parameters: TrendFollowingParameters) {
    super('TrendFollowing', parameters);
  }
  
  protected async onInitialize(): Promise<void> {
    this.validateParameters(['smaPeriod', 'rsiPeriod', 'rsiOverbought', 'rsiOversold']);
    
    this.sma = new SMA(this.getParameter('smaPeriod'));
    this.rsi = new RSI(this.getParameter('rsiPeriod'));
  }
  
  public async analyze(marketData: any): Promise<StrategyResult> {
    const { ticker } = marketData;
    const price = ticker.price;
    
    // Update indicators
    this.sma.update(price);
    this.rsi.update(price);
    
    // Check if we have enough data
    if (!this.sma.isReady() || !this.rsi.isReady()) {
      return { action: 'hold', reason: 'Insufficient data' };
    }
    
    const smaValue = this.sma.getValue();
    const rsiValue = this.rsi.getValue();
    
    // Generate signals
    if (price.gt(smaValue) && rsiValue < this.getParameter('rsiOversold')) {
      return {
        action: 'buy',
        quantity: this.calculatePositionSize(price),
        price,
        confidence: (100 - rsiValue) / 100,
        reason: `Price above SMA (${smaValue.toFixed(2)}) and RSI oversold (${rsiValue.toFixed(2)})`
      };
    }
    
    if (price.lt(smaValue) && rsiValue > this.getParameter('rsiOverbought')) {
      return {
        action: 'sell',
        quantity: this.getCurrentPosition(),
        price,
        confidence: rsiValue / 100,
        reason: `Price below SMA (${smaValue.toFixed(2)}) and RSI overbought (${rsiValue.toFixed(2)})`
      };
    }
    
    return { action: 'hold' };
  }
  
  private calculatePositionSize(price: Decimal): Decimal {
    const riskAmount = this.getParameter<Decimal>('accountBalance').mul(this.getParameter<number>('riskPerTrade'));
    const stopLossDistance = price.mul(0.05); // 5% stop loss
    
    return riskAmount.div(stopLossDistance);
  }
}
```

## Contributing

When adding new strategies or indicators:

1. Extend `BaseStrategy` or create indicator class
2. Include comprehensive parameter validation
3. Add unit tests and backtests
4. Document parameters and signals
5. Update this README

## License

MIT - See LICENSE file for details.
