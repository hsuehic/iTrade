# @crypto-trading/portfolio-manager

Comprehensive portfolio management and performance analytics system for cryptocurrency trading.

## Overview

This package provides enterprise-grade portfolio management capabilities:

- **Real-time Portfolio Tracking** - Live position and balance monitoring
- **Performance Analytics** - Comprehensive metrics calculation and analysis
- **Position Management** - Advanced position tracking with P&L calculation
- **Risk Metrics** - Portfolio-level risk assessment and monitoring
- **Historical Analysis** - Time-series portfolio performance evaluation

## Features

### 📊 Portfolio Management
- **Multi-Asset Support** - Track positions across multiple cryptocurrencies
- **Real-time Valuation** - Live portfolio value calculation
- **Balance Management** - Free, locked, and total balance tracking
- **Snapshot System** - Historical portfolio state preservation

### 📈 Performance Analytics  
- **Return Calculation** - Total, annualized, and risk-adjusted returns
- **Risk Metrics** - Sharpe ratio, maximum drawdown, volatility analysis
- **Trade Analysis** - Win rate, profit factor, average trade metrics
- **Benchmark Comparison** - Performance vs market indices

### 🎯 Position Tracking
- **Position Lifecycle** - Entry, updates, and exit tracking
- **P&L Calculation** - Realized and unrealized profit/loss
- **Exposure Management** - Position size and concentration monitoring
- **Historical Tracking** - Complete position history and analytics

## Installation

```bash
pnpm add @crypto-trading/portfolio-manager @crypto-trading/core
```

## Quick Start

### Basic Portfolio Management
```typescript
import { PortfolioManager } from '@crypto-trading/portfolio-manager';
import { Decimal } from 'decimal.js';

// Initialize with starting balance
const portfolio = new PortfolioManager(new Decimal('100000')); // $100k starting

// Update positions from trades
await portfolio.updatePosition(
  'BTCUSDT',
  new Decimal('0.5'),    // quantity
  new Decimal('45000'),  // average price
  OrderSide.BUY
);

// Get current portfolio value
const totalValue = portfolio.getTotalValue();
const returnPct = portfolio.calculateReturnPct();

console.log(`Portfolio Value: $${totalValue}`);
console.log(`Total Return: ${returnPct.toFixed(2)}%`);
```

### Performance Analysis
```typescript
import { PerformanceAnalyzer } from '@crypto-trading/portfolio-manager';

const analyzer = new PerformanceAnalyzer();

// Get portfolio snapshots (from portfolio manager)
const snapshots = portfolio.getSnapshots(100); // Last 100 snapshots

// Calculate comprehensive metrics
const metrics = analyzer.calculatePerformanceMetrics(snapshots, 0.02); // 2% risk-free rate

console.log('Performance Metrics:', {
  totalReturn: `${metrics.totalReturn.toFixed(2)}%`,
  annualizedReturn: `${metrics.annualizedReturn.toFixed(2)}%`,
  sharpeRatio: metrics.sharpeRatio.toFixed(2),
  maxDrawdown: `${metrics.maxDrawdown.toFixed(2)}%`,
  volatility: `${metrics.volatility.toFixed(2)}%`
});
```

### Position Tracking
```typescript
import { PositionTracker } from '@crypto-trading/portfolio-manager';

const tracker = new PositionTracker();

// Update from order fills
tracker.processOrderFill({
  symbol: 'ETHUSDT',
  side: OrderSide.BUY,
  quantity: new Decimal('2.0'),
  price: new Decimal('3200'),
  status: 'FILLED'
});

// Get position summaries
const positions = tracker.getPositionSummaries();
positions.forEach(pos => {
  console.log(`${pos.symbol}: ${pos.totalQuantity} (${pos.percentOfPortfolio.toFixed(2)}%)`);
});
```

## Core Components

### PortfolioManager

The main portfolio management class that handles:

```typescript
class PortfolioManager extends EventEmitter {
  // Position management
  async updatePosition(symbol: string, quantity: Decimal, avgPrice: Decimal, side: OrderSide): Promise<void>
  getPosition(symbol: string): Position | undefined
  getAllPositions(): Position[]

  // Balance management  
  setBalance(asset: string, free: Decimal, locked: Decimal): void
  getBalance(asset: string): Balance | undefined
  getAllBalances(): Balance[]

  // Portfolio analytics
  getTotalValue(): Decimal
  getEquity(): Decimal
  calculateReturnPct(): Decimal

  // Snapshots
  takeSnapshot(): PortfolioSnapshot
  getSnapshots(limit?: number): PortfolioSnapshot[]
}
```

### PerformanceAnalyzer

Advanced performance calculation and analysis:

```typescript
class PerformanceAnalyzer {
  // Core metrics
  calculatePerformanceMetrics(snapshots: PortfolioSnapshot[], riskFreeRate?: number): PerformanceMetrics
  calculateTradeAnalysis(trades: Order[]): TradeAnalysis

  // Risk metrics  
  calculateVaR(returns: Decimal[], confidence: number): Decimal
  calculateCVaR(returns: Decimal[], confidence: number): Decimal
  calculateMaxDrawdown(snapshots: PortfolioSnapshot[]): Decimal

  // Return analysis
  calculateSharpeRatio(returns: Decimal[], riskFreeRate: number): Decimal
  calculateSortinoRatio(returns: Decimal[], riskFreeRate: number): Decimal
}
```

### PositionTracker

Real-time position tracking and management:

```typescript
class PositionTracker extends EventEmitter {
  // Position updates
  updatePosition(symbol: string, quantity: Decimal, price: Decimal, side: OrderSide): void
  processOrderFill(order: Order): void

  // Market data
  updateMarketPrice(symbol: string, price: Decimal): void

  // Analytics
  getPositionSummaries(): PositionSummary[]
  getTotalUnrealizedPnl(): Decimal
  getExposureBreakdown(): Map<string, Decimal>
  getConcentrationRisk(): Decimal
}
```

## Advanced Usage Examples

### Portfolio Monitoring Dashboard
```typescript
class PortfolioDashboard {
  private portfolio: PortfolioManager;
  private analyzer: PerformanceAnalyzer;
  
  constructor() {
    this.portfolio = new PortfolioManager(new Decimal('100000'));
    this.analyzer = new PerformanceAnalyzer();
    
    // Listen for portfolio updates
    this.portfolio.on('positionUpdated', this.handlePositionUpdate.bind(this));
    this.portfolio.on('totalValueUpdated', this.handleValueUpdate.bind(this));
  }

  async generateReport(): Promise<DashboardReport> {
    const snapshots = this.portfolio.getSnapshots(365); // Last year
    const metrics = this.analyzer.calculatePerformanceMetrics(snapshots);
    const positions = this.portfolio.getAllPositions();
    
    return {
      currentValue: this.portfolio.getTotalValue(),
      todaysChange: this.calculateDailyChange(),
      positions: this.formatPositions(positions),
      performance: {
        totalReturn: metrics.totalReturn,
        yearlyReturn: metrics.annualizedReturn,
        sharpeRatio: metrics.sharpeRatio,
        maxDrawdown: metrics.maxDrawdown
      },
      riskMetrics: {
        var95: this.analyzer.calculateVaR(this.getReturns(), 0.95),
        concentration: this.calculateConcentration(positions)
      }
    };
  }
}
```

### Automated Rebalancing
```typescript
class PortfolioRebalancer {
  private portfolio: PortfolioManager;
  private targetAllocations: Map<string, Decimal>;

  constructor(portfolio: PortfolioManager) {
    this.portfolio = portfolio;
    this.targetAllocations = new Map([
      ['BTC', new Decimal('0.4')], // 40%
      ['ETH', new Decimal('0.3')], // 30%
      ['ALT', new Decimal('0.3')]  // 30% others
    ]);
  }

  async rebalance(): Promise<RebalanceAction[]> {
    const currentPositions = this.portfolio.getAllPositions();
    const totalValue = this.portfolio.getTotalValue();
    const actions: RebalanceAction[] = [];

    for (const [asset, targetPct] of this.targetAllocations) {
      const currentValue = this.getCurrentAssetValue(currentPositions, asset);
      const currentPct = currentValue.div(totalValue);
      const targetValue = totalValue.mul(targetPct);
      
      const deviation = currentPct.sub(targetPct).abs();
      
      if (deviation.gt(0.05)) { // 5% threshold
        const tradeAmount = targetValue.sub(currentValue);
        actions.push({
          asset,
          action: tradeAmount.gt(0) ? 'BUY' : 'SELL',
          amount: tradeAmount.abs(),
          reason: `Rebalance from ${currentPct.mul(100).toFixed(1)}% to ${targetPct.mul(100).toFixed(1)}%`
        });
      }
    }

    return actions;
  }
}
```

### Risk Management Integration
```typescript
class PortfolioRiskManager {
  private portfolio: PortfolioManager;
  private analyzer: PerformanceAnalyzer;

  async assessRisk(): Promise<RiskAssessment> {
    const snapshots = this.portfolio.getSnapshots(30); // Last 30 days
    const returns = this.calculateDailyReturns(snapshots);
    
    return {
      var95: this.analyzer.calculateVaR(returns, 0.95),
      cvar95: this.analyzer.calculateCVaR(returns, 0.95),
      maxDrawdown: this.analyzer.calculateMaxDrawdown(snapshots),
      concentrationRisk: this.calculateConcentrationRisk(),
      liquidityRisk: this.assessLiquidityRisk(),
      correlationRisk: await this.calculateCorrelationRisk()
    };
  }

  private calculateConcentrationRisk(): Decimal {
    const positions = this.portfolio.getAllPositions();
    const totalValue = this.portfolio.getTotalValue();
    
    const concentrations = positions.map(pos => {
      const posValue = pos.quantity.mul(pos.avgPrice);
      return posValue.div(totalValue);
    });
    
    // Calculate Herfindahl index
    return concentrations.reduce((sum, conc) => sum.add(conc.pow(2)), new Decimal(0));
  }
}
```

## Event System

The portfolio manager emits events for real-time monitoring:

```typescript
portfolio.on('positionUpdated', (symbol: string, position: Position) => {
  console.log(`Position updated: ${symbol}`, position);
});

portfolio.on('balanceUpdated', (asset: string, balance: Balance) => {
  console.log(`Balance updated: ${asset}`, balance);
});

portfolio.on('totalValueUpdated', (totalValue: Decimal) => {
  console.log(`Portfolio value: $${totalValue}`);
});

portfolio.on('snapshotTaken', (snapshot: PortfolioSnapshot) => {
  // Store snapshot for historical analysis
  saveSnapshot(snapshot);
});

portfolio.on('reset', () => {
  console.log('Portfolio reset');
});
```

## Data Models

### Portfolio Snapshot
```typescript
interface PortfolioSnapshot {
  id: string;
  timestamp: Date;
  totalValue: Decimal;
  positions: Position[];
  balances: Balance[];
  returnPct: Decimal;
}
```

### Performance Metrics
```typescript
interface PerformanceMetrics {
  totalReturn: Decimal;
  annualizedReturn: Decimal;
  volatility: Decimal;
  sharpeRatio: Decimal;
  maxDrawdown: Decimal;
  winRate: Decimal;
  profitFactor: Decimal;
  averageWin: Decimal;
  averageLoss: Decimal;
}
```

### Position Summary
```typescript
interface PositionSummary {
  symbol: string;
  totalQuantity: Decimal;
  totalValue: Decimal;
  avgPrice: Decimal;
  unrealizedPnl: Decimal;
  realizedPnl: Decimal;
  percentOfPortfolio: Decimal;
  side: OrderSide;
}
```

## Best Practices

### 1. Regular Snapshots
```typescript
// Take snapshots regularly for analysis
setInterval(() => {
  portfolio.takeSnapshot();
}, 60000); // Every minute
```

### 2. Market Price Updates
```typescript
// Update market prices for accurate valuation
websocket.on('price', (data) => {
  tracker.updateMarketPrice(data.symbol, new Decimal(data.price));
});
```

### 3. Error Handling
```typescript
try {
  await portfolio.updatePosition('BTCUSDT', quantity, price, side);
} catch (error) {
  logger.error('Failed to update position', { error, symbol: 'BTCUSDT' });
  // Handle error appropriately
}
```

### 4. Performance Monitoring
```typescript
// Monitor performance calculation time
const startTime = Date.now();
const metrics = analyzer.calculatePerformanceMetrics(snapshots);
const calculationTime = Date.now() - startTime;

if (calculationTime > 1000) {
  logger.warn('Slow performance calculation', { 
    time: calculationTime, 
    snapshots: snapshots.length 
  });
}
```

## Integration Examples

### With Trading Engine
```typescript
class TradingEngine {
  private portfolio: PortfolioManager;

  constructor() {
    this.portfolio = new PortfolioManager(new Decimal('100000'));
  }

  async executeOrder(order: Order): Promise<void> {
    // Execute order with exchange
    const result = await this.exchange.placeOrder(order);
    
    if (result.status === 'FILLED') {
      // Update portfolio
      await this.portfolio.updatePosition(
        order.symbol,
        result.executedQty,
        result.price,
        order.side
      );
      
      // Process with position tracker
      await this.portfolio.processOrderFill(result);
    }
  }
}
```

### With Risk Management
```typescript
class RiskManager {
  constructor(private portfolio: PortfolioManager) {}

  async validateOrder(order: Order): Promise<boolean> {
    const currentValue = this.portfolio.getTotalValue();
    const orderValue = order.quantity.mul(order.price);
    const positionSizePercent = orderValue.div(currentValue).mul(100);
    
    // Check position size limits
    if (positionSizePercent.gt(10)) { // 10% max position
      throw new Error('Position size exceeds limit');
    }
    
    // Check concentration risk
    const concentration = this.calculateConcentrationRisk();
    if (concentration.gt(0.5)) { // 50% max concentration
      throw new Error('Portfolio concentration too high');
    }
    
    return true;
  }
}
```

## API Reference

### PortfolioManager Methods
- `updatePosition(symbol, quantity, avgPrice, side)` - Update position from trade
- `getPosition(symbol)` - Get specific position
- `getAllPositions()` - Get all positions
- `setBalance(asset, free, locked)` - Update balance
- `getTotalValue()` - Get current portfolio value
- `calculateReturnPct()` - Calculate total return percentage
- `takeSnapshot()` - Create portfolio snapshot
- `getSnapshots(limit)` - Get historical snapshots
- `processOrderFill(order)` - Process order execution
- `reset()` - Reset portfolio state

### PerformanceAnalyzer Methods
- `calculatePerformanceMetrics(snapshots, riskFreeRate)` - Comprehensive metrics
- `calculateTradeAnalysis(trades)` - Trade-specific analysis
- `calculateVaR(returns, confidence)` - Value at Risk
- `calculateCVaR(returns, confidence)` - Conditional VaR
- `calculateSharpeRatio(returns, riskFreeRate)` - Risk-adjusted return
- `calculateMaxDrawdown(snapshots)` - Maximum drawdown

### PositionTracker Methods
- `updatePosition(symbol, quantity, price, side)` - Update position
- `updateMarketPrice(symbol, price)` - Update market price
- `getPositionSummaries()` - Get position summaries
- `getTotalUnrealizedPnl()` - Total unrealized P&L
- `getExposureBreakdown()` - Exposure by asset
- `getConcentrationRisk()` - Concentration risk metric
- `processOrderFill(order)` - Process order execution

## Dependencies

- **decimal.js** - Precision decimal arithmetic
- **uuid** - Unique identifier generation
- **@crypto-trading/core** - Core types and interfaces
