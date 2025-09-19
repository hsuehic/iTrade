# @crypto-trading/risk-manager

Advanced risk management and position sizing system for cryptocurrency trading applications.

## Overview

This package provides comprehensive risk management capabilities for trading systems:

- **Risk Limit Enforcement** - Automatic order validation against risk parameters
- **Advanced Position Sizing** - Multiple algorithms including Kelly Criterion and Optimal F
- **Real-time Risk Monitoring** - Continuous portfolio risk assessment and alerting  
- **Emergency Controls** - Automatic trading halt on critical risk events
- **Risk Analytics** - VaR, CVaR, drawdown, and concentration risk calculation

## Features

### 🛡️ Risk Management
- **Order Validation** - Pre-trade risk checks and limits enforcement
- **Position Size Limits** - Maximum position size as percentage of portfolio
- **Leverage Controls** - Maximum leverage ratio enforcement
- **Daily Loss Limits** - Stop trading on excessive daily losses
- **Drawdown Protection** - Emergency mode activation on max drawdown breach

### 📏 Position Sizing Algorithms
- **Fixed Risk Sizing** - Risk-based position sizing with stop loss
- **Kelly Criterion** - Optimal position sizing based on win/loss statistics
- **Volatility-based Sizing** - Position sizing based on asset volatility
- **Optimal F** - Ralph Vince's optimal fixed fractional sizing
- **ATR-based Sizing** - Position sizing using Average True Range
- **Monte Carlo Sizing** - Simulation-based position sizing

### 📊 Risk Monitoring  
- **Real-time Alerts** - Instant notifications on risk limit breaches
- **Risk Metrics Dashboard** - Live portfolio risk statistics
- **Stress Testing** - Portfolio performance under adverse scenarios  
- **Correlation Analysis** - Multi-asset correlation risk assessment
- **VaR/CVaR Calculation** - Statistical risk measurement

## Installation

```bash
pnpm add @crypto-trading/risk-manager @crypto-trading/core
```

## Quick Start

### Basic Risk Management
```typescript
import { RiskManager } from '@crypto-trading/risk-manager';
import { Decimal } from 'decimal.js';

// Initialize with risk parameters
const riskManager = new RiskManager({
  maxDrawdown: new Decimal(20),        // 20% max drawdown
  maxPositionSize: new Decimal(10),    // 10% max position size
  maxDailyLoss: new Decimal(5),        // 5% max daily loss
  maxLeverage: new Decimal(2),         // 2:1 max leverage
  riskFreeRate: new Decimal(2)         // 2% risk-free rate
});

// Validate order before placement
const order = {
  symbol: 'BTCUSDT',
  side: OrderSide.BUY,
  quantity: new Decimal('0.1'),
  price: new Decimal('45000')
};

const isValid = await riskManager.validateOrder(
  order, 
  portfolioValue, 
  currentPositions
);

if (isValid) {
  // Place order
  await exchange.placeOrder(order);
} else {
  console.log('Order rejected by risk management');
}
```

### Position Sizing
```typescript
import { PositionSizer } from '@crypto-trading/risk-manager';

const sizer = new PositionSizer();

// Fixed risk position sizing
const positionSize = sizer.calculateFixedRiskSize({
  portfolioValue: new Decimal('100000'),
  riskPerTrade: new Decimal('2'),      // 2% risk per trade
  entryPrice: new Decimal('45000'),
  stopLoss: new Decimal('43000')       // $2000 stop loss
});

console.log(`Position size: ${positionSize} BTC`);

// Kelly Criterion sizing
const kellySize = sizer.calculateKellySize({
  portfolioValue: new Decimal('100000'),
  winRate: new Decimal('65'),          // 65% win rate
  avgWin: new Decimal('150'),          // $150 average win
  avgLoss: new Decimal('80')           // $80 average loss
});

console.log(`Kelly position size: $${kellySize}`);
```

### Risk Monitoring
```typescript
import { RiskMonitor } from '@crypto-trading/risk-manager';

const monitor = new RiskMonitor({
  checkInterval: 5000,                 // Check every 5 seconds
  portfolioVarLimit: new Decimal(5),   // 5% VaR limit
  correlationThreshold: new Decimal(70) // 70% correlation threshold
});

// Start monitoring
monitor.startMonitoring();

// Listen for risk alerts
monitor.on('riskAlert', (alert) => {
  console.log('Risk Alert:', alert);
  
  if (alert.severity === 'CRITICAL') {
    // Take immediate action
    await emergencyStopTrading();
  }
});

// Get risk report
const report = monitor.generateRiskReport();
console.log('Risk Report:', report);
```

## Core Components

### RiskManager

The main risk management class that handles order validation and risk limit enforcement:

```typescript
class RiskManager extends EventEmitter {
  // Order validation
  async validateOrder(order: Order, portfolioValue: Decimal, positions: Position[]): Promise<boolean>
  
  // Position sizing  
  calculatePositionSize(portfolioValue: Decimal, riskPerTrade: Decimal, entryPrice: Decimal, stopLoss: Decimal): Decimal
  calculateKellyPositionSize(portfolioValue: Decimal, winRate: Decimal, avgWin: Decimal, avgLoss: Decimal): Decimal
  
  // Risk monitoring
  updatePortfolioMetrics(currentValue: Decimal, positions: Position[], dailyPnl?: Decimal): RiskMetrics
  
  // Stop loss management
  calculateDynamicStopLoss(entryPrice: Decimal, currentPrice: Decimal, atr: Decimal, side: OrderSide): Decimal
  
  // Emergency controls
  enterEmergencyMode(): void
  exitEmergencyMode(): void
  isInEmergencyMode(): boolean
}
```

### PositionSizer

Advanced position sizing algorithms:

```typescript
class PositionSizer {
  // Core sizing methods
  calculateFixedRiskSize(params: PositionSizeParams): Decimal
  calculateKellySize(params: KellyParams): Decimal
  calculateVolatilitySize(params: VolatilityParams): Decimal
  calculateATRSize(portfolioValue: Decimal, riskPerTrade: Decimal, atr: Decimal): Decimal
  calculateOptimalF(portfolioValue: Decimal, tradeOutcomes: Decimal[]): Decimal
  calculateMonteCarloSize(portfolioValue: Decimal, expectedReturn: Decimal, volatility: Decimal): Decimal
  
  // Utility methods
  calculateRiskReward(entryPrice: Decimal, stopLoss: Decimal, takeProfit: Decimal): Decimal
  validatePositionSize(positionSize: Decimal, portfolioValue: Decimal): boolean
}
```

### RiskMonitor

Real-time risk monitoring and alerting:

```typescript
class RiskMonitor extends EventEmitter {
  // Monitoring control
  startMonitoring(): void
  stopMonitoring(): void
  
  // Market data updates
  updateMarketPrices(prices: Map<string, Decimal>): void
  updateVolatilities(volatilities: Map<string, Decimal>): void
  updateCorrelations(correlations: Map<string, Map<string, Decimal>>): void
  
  // Risk analysis
  getVaRTrend(periods: number): { dates: Date[], values: Decimal[] }
  calculateStressTest(scenarios: Map<string, Decimal>): Map<string, Decimal>
  
  // Reporting
  generateRiskReport(): RiskReport
}
```

## Advanced Usage Examples

### Custom Risk Rules
```typescript
class CustomRiskManager extends RiskManager {
  async validateOrder(order: Order, portfolioValue: Decimal, positions: Position[]): Promise<boolean> {
    // Run base validation
    const baseValid = await super.validateOrder(order, portfolioValue, positions);
    if (!baseValid) return false;
    
    // Custom rule: No trading during high volatility
    const volatility = await this.getMarketVolatility(order.symbol);
    if (volatility.gt(0.05)) { // 5% daily volatility threshold
      this.emitRiskAlert({
        type: 'HIGH_VOLATILITY',
        severity: 'MEDIUM',
        message: `High volatility detected: ${volatility.mul(100).toFixed(2)}%`,
        data: { symbol: order.symbol, volatility }
      });
      return false;
    }
    
    // Custom rule: Maximum 3 positions per sector
    const sectorPositions = this.countSectorPositions(order.symbol, positions);
    if (sectorPositions >= 3) {
      return false;
    }
    
    return true;
  }
}
```

### Multi-Strategy Risk Allocation
```typescript
class StrategyRiskAllocator {
  private strategies: Map<string, StrategyConfig> = new Map();
  private riskManager: RiskManager;

  constructor(totalPortfolioValue: Decimal) {
    this.riskManager = new RiskManager();
    
    // Allocate risk budget per strategy
    this.strategies.set('momentum', {
      riskAllocation: new Decimal('0.4'), // 40% of total risk
      maxPositions: 5,
      avgHoldTime: '2h'
    });
    
    this.strategies.set('meanReversion', {
      riskAllocation: new Decimal('0.3'), // 30% of total risk
      maxPositions: 8,
      avgHoldTime: '30m'
    });
  }

  calculateStrategyPositionSize(
    strategy: string,
    totalRisk: Decimal,
    entryPrice: Decimal,
    stopLoss: Decimal
  ): Decimal {
    const config = this.strategies.get(strategy);
    if (!config) throw new Error(`Unknown strategy: ${strategy}`);
    
    const strategyRisk = totalRisk.mul(config.riskAllocation);
    const riskPerPosition = strategyRisk.div(config.maxPositions);
    
    return this.riskManager.calculatePositionSize(
      this.portfolioValue,
      riskPerPosition,
      entryPrice,
      stopLoss
    );
  }
}
```

### Dynamic Risk Adjustment
```typescript
class DynamicRiskManager {
  private baseRiskManager: RiskManager;
  private marketRegime: 'BULL' | 'BEAR' | 'SIDEWAYS' = 'SIDEWAYS';

  adjustRiskLimits(): void {
    const currentLimits = this.baseRiskManager.getRiskLimits();
    
    switch (this.marketRegime) {
      case 'BULL':
        // Increase risk tolerance in bull markets
        this.baseRiskManager.updateRiskLimits({
          maxPositionSize: currentLimits.maxPositionSize.mul(1.2),
          maxDailyLoss: currentLimits.maxDailyLoss.mul(1.1)
        });
        break;
        
      case 'BEAR':
        // Decrease risk tolerance in bear markets
        this.baseRiskManager.updateRiskLimits({
          maxPositionSize: currentLimits.maxPositionSize.mul(0.8),
          maxDailyLoss: currentLimits.maxDailyLoss.mul(0.9)
        });
        break;
        
      case 'SIDEWAYS':
        // Standard risk limits
        break;
    }
  }

  detectMarketRegime(returns: Decimal[]): void {
    const recentReturns = returns.slice(-20); // Last 20 periods
    const avgReturn = recentReturns.reduce((sum, r) => sum.add(r), new Decimal(0))
                                   .div(recentReturns.length);
    const volatility = this.calculateVolatility(recentReturns);
    
    if (avgReturn.gt(0.001) && volatility.lt(0.02)) {
      this.marketRegime = 'BULL';
    } else if (avgReturn.lt(-0.001) || volatility.gt(0.04)) {
      this.marketRegime = 'BEAR';
    } else {
      this.marketRegime = 'SIDEWAYS';
    }
    
    this.adjustRiskLimits();
  }
}
```

## Risk Metrics and Analysis

### Portfolio Risk Metrics
```typescript
interface RiskMetrics {
  currentDrawdown: Decimal;
  peakValue: Decimal;
  totalExposure: Decimal;
  leverage: Decimal;
  positionCount: number;
  largestPosition: Decimal;
  concentrationRisk: Decimal;
  dailyPnl: Decimal;
  emergencyMode: boolean;
}

// Calculate comprehensive risk metrics
const metrics = riskManager.updatePortfolioMetrics(
  currentPortfolioValue,
  allPositions,
  todaysPnl
);
```

### Value at Risk (VaR) Calculation
```typescript
// Historical VaR
const returns = getHistoricalReturns(30); // 30 days
const var95 = riskManager.getVaR(returns, 0.95); // 95% confidence
const cvar95 = riskManager.getCVaR(returns, 0.95); // Conditional VaR

console.log(`Daily VaR (95%): ${var95.mul(100).toFixed(2)}%`);
console.log(`Daily CVaR (95%): ${cvar95.mul(100).toFixed(2)}%`);

// Parametric VaR (assuming normal distribution)
const portfolio = getCurrentPortfolio();
const volatility = calculatePortfolioVolatility(portfolio);
const parametricVaR = volatility.mul(1.645); // 95% confidence z-score
```

### Stress Testing
```typescript
const stressScenarios = new Map([
  ['Flash Crash', new Decimal(-20)],      // -20% market shock
  ['Crypto Winter', new Decimal(-50)],    // -50% prolonged bear market
  ['Leverage Unwind', new Decimal(-30)],  // -30% deleveraging event
  ['Regulatory Ban', new Decimal(-60)]    // -60% regulatory shutdown
]);

const stressResults = monitor.calculateStressTest(stressScenarios);

stressResults.forEach((loss, scenario) => {
  const lossPercent = loss.div(portfolioValue).mul(100);
  console.log(`${scenario}: ${lossPercent.toFixed(2)}% portfolio loss`);
});
```

## Risk Alert System

### Alert Types and Handling
```typescript
monitor.on('riskAlert', (alert: RiskAlert) => {
  switch (alert.type) {
    case 'POSITION_SIZE_EXCEEDED':
      // Reduce position size or reject order
      await handlePositionSizeAlert(alert);
      break;
      
    case 'DAILY_LOSS_LIMIT':
      // Stop trading for the day
      await stopDayTrading();
      break;
      
    case 'MAX_DRAWDOWN_EXCEEDED':
      // Enter emergency mode
      riskManager.enterEmergencyMode();
      await notifyRiskTeam(alert);
      break;
      
    case 'CORRELATION_RISK_HIGH':
      // Diversify positions
      await rebalancePortfolio();
      break;
      
    case 'LEVERAGE_EXCEEDED':
      // Reduce leverage
      await reduceLeverage(alert.data);
      break;
  }
});
```

### Custom Alert Configuration
```typescript
const customMonitor = new RiskMonitor({
  checkInterval: 1000,                    // Check every second
  portfolioVarLimit: new Decimal(3),      // 3% VaR limit
  positionVarLimit: new Decimal(1.5),     // 1.5% per position
  correlationThreshold: new Decimal(80),   // 80% correlation alert
  liquidityThreshold: new Decimal(5000),  // $5k minimum liquidity
  maxDrawdownAlert: new Decimal(10)       // 10% drawdown warning
});
```

## Integration Examples

### With Trading Engine
```typescript
class SafeTradingEngine {
  private riskManager: RiskManager;
  
  constructor() {
    this.riskManager = new RiskManager({
      maxPositionSize: new Decimal(5),
      maxDailyLoss: new Decimal(3)
    });
  }

  async executeStrategy(signals: TradingSignal[]): Promise<void> {
    for (const signal of signals) {
      // Calculate position size
      const positionSize = this.riskManager.calculatePositionSize(
        this.portfolioValue,
        new Decimal(2), // 2% risk per trade
        signal.entryPrice,
        signal.stopLoss
      );
      
      const order = {
        symbol: signal.symbol,
        side: signal.side,
        quantity: positionSize,
        price: signal.entryPrice
      };
      
      // Validate with risk manager
      const isValid = await this.riskManager.validateOrder(
        order,
        this.portfolioValue,
        this.currentPositions
      );
      
      if (isValid && !this.riskManager.isInEmergencyMode()) {
        await this.exchange.placeOrder(order);
      } else {
        console.log('Order blocked by risk management');
      }
    }
  }
}
```

### With Portfolio Manager
```typescript
class RiskAwarePortfolio {
  private portfolio: PortfolioManager;
  private riskManager: RiskManager;
  private monitor: RiskMonitor;

  constructor() {
    this.portfolio = new PortfolioManager();
    this.riskManager = new RiskManager();
    this.monitor = new RiskMonitor();
    
    // Update risk metrics when portfolio changes
    this.portfolio.on('totalValueUpdated', (value) => {
      const positions = this.portfolio.getAllPositions();
      this.riskManager.updatePortfolioMetrics(value, positions);
    });
  }

  async rebalanceWithRiskLimits(): Promise<void> {
    const rebalanceActions = await this.calculateRebalance();
    
    for (const action of rebalanceActions) {
      // Check if action violates risk limits
      const wouldExceedLimits = await this.wouldExceedRiskLimits(action);
      
      if (!wouldExceedLimits) {
        await this.executeRebalanceAction(action);
      } else {
        console.log(`Skipping rebalance action due to risk limits: ${action.symbol}`);
      }
    }
  }
}
```

## Configuration

### Risk Manager Configuration
```typescript
interface RiskManagerConfig {
  maxDrawdown: Decimal;           // Maximum portfolio drawdown (%)
  maxPositionSize: Decimal;       // Maximum position size (% of portfolio)
  maxDailyLoss: Decimal;         // Maximum daily loss (% of portfolio)
  maxLeverage: Decimal;          // Maximum leverage ratio
  maxCorrelatedExposure: Decimal; // Maximum exposure to correlated assets (%)
  stopLossBuffer: Decimal;       // Buffer above stop loss levels (%)
  riskFreeRate: Decimal;         // Annual risk-free rate for calculations (%)
}
```

### Position Sizer Parameters
```typescript
interface PositionSizeParams {
  portfolioValue: Decimal;
  riskPerTrade: Decimal;    // Percentage of portfolio to risk
  entryPrice: Decimal;
  stopLoss: Decimal;
  maxPositionSize?: Decimal; // Maximum position size as % of portfolio
  leverage?: Decimal;
}

interface KellyParams {
  portfolioValue: Decimal;
  winRate: Decimal;         // Win rate as percentage (0-100)
  avgWin: Decimal;          // Average winning trade amount
  avgLoss: Decimal;         // Average losing trade amount
  kellyFraction?: Decimal;  // Fraction of Kelly to use (default 0.25)
  maxPositionSize?: Decimal;
}
```

## Best Practices

### 1. Conservative Risk Limits
```typescript
// Start with conservative limits
const conservativeConfig = {
  maxDrawdown: new Decimal(10),      // 10% max drawdown
  maxPositionSize: new Decimal(5),   // 5% max position
  maxDailyLoss: new Decimal(2),      // 2% max daily loss
  maxLeverage: new Decimal(1)        // No leverage initially
};
```

### 2. Regular Risk Assessment  
```typescript
// Daily risk review
setInterval(async () => {
  const riskMetrics = await riskManager.updatePortfolioMetrics(
    portfolio.getTotalValue(),
    portfolio.getAllPositions()
  );
  
  if (riskMetrics.currentDrawdown.gt(15)) {
    await reviewRiskLimits();
  }
}, 24 * 60 * 60 * 1000); // Daily
```

### 3. Position Size Validation
```typescript
// Always validate position sizes
const positionSize = sizer.calculateFixedRiskSize(params);

if (!sizer.validatePositionSize(positionSize, portfolioValue)) {
  throw new Error('Calculated position size exceeds limits');
}
```

### 4. Emergency Procedures
```typescript
// Set up emergency procedures
riskManager.on('emergencyModeActivated', async (data) => {
  // Close all positions
  await closeAllPositions();
  
  // Notify administrators
  await sendAlert('EMERGENCY_MODE_ACTIVATED', data);
  
  // Log the event
  logger.error('Emergency mode activated', data);
});
```

## API Reference

### RiskManager Methods
- `validateOrder(order, portfolioValue, positions)` - Validate order against risk limits
- `calculatePositionSize(portfolioValue, riskPerTrade, entryPrice, stopLoss)` - Basic position sizing
- `calculateKellyPositionSize(portfolioValue, winRate, avgWin, avgLoss)` - Kelly criterion sizing
- `updatePortfolioMetrics(currentValue, positions, dailyPnl)` - Update risk metrics
- `calculateDynamicStopLoss(entryPrice, currentPrice, atr, side)` - Dynamic stop loss
- `enterEmergencyMode()` - Activate emergency trading halt
- `exitEmergencyMode()` - Deactivate emergency mode
- `getVaR(returns, confidence)` - Calculate Value at Risk
- `getCVaR(returns, confidence)` - Calculate Conditional VaR

### PositionSizer Methods
- `calculateFixedRiskSize(params)` - Fixed risk position sizing
- `calculateKellySize(params)` - Kelly criterion sizing
- `calculateVolatilitySize(params)` - Volatility-based sizing
- `calculateOptimalF(portfolioValue, tradeOutcomes)` - Optimal F sizing
- `calculateATRSize(portfolioValue, riskPerTrade, atr)` - ATR-based sizing
- `calculateMonteCarloSize(params)` - Monte Carlo sizing
- `calculateRiskReward(entryPrice, stopLoss, takeProfit)` - Risk/reward ratio

### RiskMonitor Methods
- `startMonitoring()` - Start risk monitoring
- `stopMonitoring()` - Stop risk monitoring
- `updateMarketPrices(prices)` - Update market price data
- `getVaRTrend(periods)` - Get VaR trend data
- `calculateStressTest(scenarios)` - Perform stress testing
- `generateRiskReport()` - Generate comprehensive risk report

## Dependencies

- **decimal.js** - Precision decimal arithmetic
- **@crypto-trading/core** - Core types and interfaces
