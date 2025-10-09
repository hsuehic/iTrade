# @itrade/backtesting

Comprehensive backtesting engine for validating cryptocurrency trading strategies with historical data.

## Overview

This package provides a robust backtesting framework that simulates trading strategies against historical market data, offering detailed performance analysis and risk metrics.

## Features

### 📈 Historical Simulation

- Process historical price data chronologically
- Realistic order execution with slippage modeling
- Commission and fee calculations
- Multi-symbol backtesting support

### 📊 Performance Analytics

- Comprehensive performance metrics
- Risk-adjusted returns (Sharpe ratio)
- Maximum drawdown analysis
- Win rate and profit factor calculations
- Equity curve generation

### 🔬 Trade Analysis

- Trade-by-trade breakdown
- Entry and exit tracking
- Duration analysis
- P&L attribution

## Installation

```bash
pnpm add @itrade/backtesting @itrade/core
```

## Usage

### Basic Backtesting

```typescript
import { BacktestEngine } from '@itrade/backtesting';
import { MovingAverageStrategy } from '@itrade/strategies';

// Create backtest engine
const engine = new BacktestEngine();

// Configure backtest
const config = {
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-12-31'),
  initialBalance: new Decimal(10000),
  commission: new Decimal(0.001), // 0.1%
  slippage: new Decimal(0.0005),  // 0.05%
  symbols: ['BTCUSDT', 'ETHUSDT'],
  timeframe: '1h'
};

// Create strategy
const strategy = new MovingAverageStrategy({
  fastPeriod: 10,
  slowPeriod: 20,
  threshold: 0.001
});

// Run backtest
const results = await engine.runBacktest(strategy, config, dataManager);

// Display results
console.log(engine.generateReport(results));
```

### Advanced Configuration

```typescript
const config = {
  startDate: new Date('2023-01-01'),
  endDate: new Date('2024-01-01'),
  initialBalance: new Decimal(50000),
  
  // Trading costs
  commission: new Decimal(0.001),  // 0.1% per trade
  slippage: new Decimal(0.0005),   // 0.05% slippage
  
  // Assets to trade
  symbols: [
    'BTCUSDT',   // Bitcoin
    'ETHUSDT',   // Ethereum  
    'ADAUSDT',   // Cardano
    'SOLUSDT'    // Solana
  ],
  
  timeframe: '4h'  // 4-hour candles
};
```

## Results Analysis

### Performance Metrics

```typescript
interface BacktestResult {
  // Returns
  totalReturn: Decimal;        // Total percentage return
  annualizedReturn: Decimal;   // Annualized return
  
  // Risk metrics  
  sharpeRatio: Decimal;        // Risk-adjusted return
  maxDrawdown: Decimal;        // Maximum peak-to-trough loss
  
  // Trading statistics
  totalTrades: number;         // Number of completed trades
  winRate: Decimal;           // Percentage of winning trades
  profitFactor: Decimal;      // Gross profit / gross loss
  avgTradeDuration: number;   // Average trade duration
  
  // Data
  equity: Array<{             // Equity curve
    timestamp: Date;
    value: Decimal;
  }>;
  trades: BacktestTrade[];    // Individual trade records
}
```

### Trade Analysis

```typescript
interface BacktestTrade {
  symbol: string;
  side: OrderSide;           // BUY or SELL
  entryPrice: Decimal;       // Entry price
  exitPrice: Decimal;        // Exit price  
  quantity: Decimal;         // Trade size
  entryTime: Date;          // Entry timestamp
  exitTime: Date;           // Exit timestamp
  pnl: Decimal;             // Profit/loss
  commission: Decimal;       // Trading fees
  duration: number;         // Trade duration in periods
}
```

## Report Generation

The engine automatically generates detailed reports:

```
=== BACKTEST RESULTS ===

Performance Metrics:
- Total Return: 15.67%
- Annualized Return: 12.45% 
- Sharpe Ratio: 1.342
- Maximum Drawdown: 8.23%

Trading Statistics:
- Total Trades: 156
- Win Rate: 58.97%
- Profit Factor: 1.89
- Average Trade Duration: 3.2 periods

Trade Summary:
SELL 0.5 BTCUSDT @ 45230.50 | PnL: 156.78
BUY 1.2 ETHUSDT @ 2847.35 | PnL: -23.45
SELL 0.8 BTCUSDT @ 47892.10 | PnL: 234.67
... and 153 more trades
```

## Data Requirements

### Data Manager Interface

```typescript
interface IDataManager {
  // Historical data retrieval
  getKlines(
    symbol: string,
    interval: string, 
    startTime: Date,
    endTime: Date
  ): Promise<Kline[]>;
  
  // Data validation
  validateData(data: Kline[]): boolean;
  cleanData(data: Kline[]): Kline[];
}
```

### Sample Data Implementation

```typescript
class FileDataManager implements IDataManager {
  async getKlines(symbol: string, interval: string, startTime: Date, endTime: Date): Promise<Kline[]> {
    // Load from CSV, JSON, or database
    const data = await this.loadHistoricalData(symbol, interval, startTime, endTime);
    
    return data.map(row => ({
      symbol,
      interval, 
      openTime: new Date(row.timestamp),
      closeTime: new Date(row.timestamp + intervalMs),
      open: new Decimal(row.open),
      high: new Decimal(row.high), 
      low: new Decimal(row.low),
      close: new Decimal(row.close),
      volume: new Decimal(row.volume),
      quoteVolume: new Decimal(row.quoteVolume),
      trades: row.trades
    }));
  }
}
```

## Strategy Integration

Compatible with any strategy implementing `IStrategy`:

```typescript
// Moving Average Strategy
const maStrategy = new MovingAverageStrategy({
  fastPeriod: 12,
  slowPeriod: 26
});

// RSI Strategy  
const rsiStrategy = new RSIStrategy({
  period: 14,
  overbought: 70,
  oversold: 30
});

// Multi-strategy backtesting
const results1 = await engine.runBacktest(maStrategy, config, dataManager);
const results2 = await engine.runBacktest(rsiStrategy, config, dataManager);
```

## Performance Analysis

### Equity Curve Visualization

```typescript
// Generate equity curve data
const equityData = results.equity.map(point => ({
  date: point.timestamp.toISOString().split('T')[0],
  value: point.value.toNumber()
}));

// Export for charting
console.table(equityData);
```

### Risk Metrics Calculation

```typescript
// Calculate additional metrics
const metrics = {
  // Volatility (annualized)
  volatility: engine.calculateVolatility(results.equity),
  
  // Maximum consecutive losses
  maxConsecutiveLosses: engine.calculateMaxLossStreak(results.trades),
  
  // Average win/loss
  avgWin: engine.calculateAverageWin(results.trades),
  avgLoss: engine.calculateAverageLoss(results.trades),
  
  // Recovery factor
  recoveryFactor: results.totalReturn.div(results.maxDrawdown)
};
```

## Configuration Options

### Commission Models

```typescript
// Fixed percentage
commission: new Decimal(0.001)  // 0.1% per trade

// Tiered structure
commission: (volume: Decimal) => {
  if (volume.gte(100000)) return new Decimal(0.0005); // 0.05%
  return new Decimal(0.001); // 0.1%
}
```

### Slippage Models

```typescript
// Fixed slippage
slippage: new Decimal(0.0005)  // 0.05%

// Market impact model
slippage: (quantity: Decimal, marketData: OrderBook) => {
  const impact = quantity.div(marketData.bids[0][1]); // Size vs top bid
  return impact.mul(0.1); // 10% of market impact
}
```

## Testing

```bash
# Run backtest tests
pnpm test

# Test with sample data
pnpm test:sample

# Performance benchmarks
pnpm test:perf
```

## Contributing

This package is part of the crypto-trading monorepo. Contributions welcome!

## License

MIT - See LICENSE file for details.
