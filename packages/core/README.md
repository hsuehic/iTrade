# @itrade/core

The core trading engine and foundational types for the cryptocurrency trading platform.

## Overview

This package provides the fundamental building blocks for cryptocurrency trading:

- **Trading Engine** - Orchestrates strategies, exchanges, and risk management
- **Type System** - Comprehensive TypeScript definitions for all trading entities
- **Interfaces** - Contracts for exchanges, strategies, and managers
- **Event System** - Real-time event bus for cross-component communication
- **Base Models** - Foundation classes for strategies and order management

## Features

### 🏗️ Trading Engine

- Multi-strategy execution
- Exchange management and routing
- Real-time market data processing
- Risk management integration
- Portfolio tracking

### 📊 Event System

- Real-time market data events
- Order lifecycle tracking
- Strategy signal broadcasting
- Risk alert notifications

### 🔧 Base Classes

- `BaseStrategy` - Foundation for custom trading strategies
- `OrderManager` - Order tracking and management
- `EventBus` - Centralized event communication

## Installation

```bash
pnpm add @itrade/core
```

## Usage

### Basic Trading Engine Setup

```typescript
import { TradingEngine, LogLevel } from '@itrade/core';
import { ConsoleLogger } from '@itrade/logger';
import { RiskManager } from '@itrade/risk-manager';
import { PortfolioManager } from '@itrade/portfolio-manager';
import { BinanceExchange } from '@itrade/exchange-connectors';
import { MovingAverageStrategy } from '@itrade/strategies';
import { Decimal } from 'decimal.js';

// Initialize dependencies
const logger = new ConsoleLogger(LogLevel.INFO);

const riskManager = new RiskManager({
  maxDrawdown: new Decimal(20),
  maxPositionSize: new Decimal(10),
  maxDailyLoss: new Decimal(5),
});

const portfolioManager = new PortfolioManager(new Decimal(10000));

// Create engine with dependencies
const engine = new TradingEngine(
  riskManager,
  portfolioManager,
  logger
);

// Configure and add exchange
const binance = new BinanceExchange();
await binance.connect({
  apiKey: process.env.BINANCE_API_KEY || '',
  secretKey: process.env.BINANCE_SECRET_KEY || '',
  sandbox: true,
});
engine.addExchange('binance', binance);

// Create and add strategy
const strategy = new MovingAverageStrategy({
  fastPeriod: 10,
  slowPeriod: 30,
  threshold: 0.001,  // 0.1% minimum crossover threshold
});
engine.addStrategy('ma-crossover', strategy);

// Start trading
await engine.start();
```

### Creating Custom Strategies

```typescript
import { BaseStrategy, StrategyResult } from '@itrade/core';

class MyCustomStrategy extends BaseStrategy {
  async analyze(marketData: any): Promise<StrategyResult> {
    // Your trading logic here
    if (shouldBuy(marketData)) {
      return {
        action: 'buy',
        quantity: new Decimal(100),
        confidence: 0.8,
        reason: 'Custom signal triggered'
      };
    }
    
    return { action: 'hold' };
  }
}
```

### Event System Usage

```typescript
import { EventBus, EVENTS } from '@itrade/core';

const eventBus = EventBus.getInstance();

// Listen for ticker updates
eventBus.onTickerUpdate((data) => {
  console.log(`${data.symbol}: $${data.ticker.price}`);
});

// Listen for strategy signals
eventBus.onStrategySignal((signal) => {
  console.log(`Strategy ${signal.strategyName} says ${signal.action}`);
});
```

## Types

### Core Types

- `Order` - Trade order representation
- `Ticker` - Market price data
- `OrderBook` - Bid/ask depth
- `Kline` - OHLCV candlestick data
- `Position` - Trading position
- `Balance` - Account balance

### Strategy Types

- `StrategyResult` - Strategy analysis output
- `StrategyParameters` - Strategy configuration

### Event Types

- `MarketDataEvent` - Real-time market updates
- `OrderEvent` - Order lifecycle events
- `StrategySignalEvent` - Trading signals

## Interfaces

### Core Interfaces

- `ITradingEngine` - Main trading orchestrator
- `IStrategy` - Trading strategy contract
- `IExchange` - Exchange connector interface
- `IRiskManager` - Risk management interface
- `IPortfolioManager` - Portfolio tracking interface

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Strategies    │    │ Trading Engine  │    │   Exchanges     │
│                 │◄──►│                 │◄──►│                 │
│ • Moving Avg    │    │ • Orchestration │    │ • Binance       │
│ • RSI           │    │ • Risk Mgmt     │    │ • Coinbase      │
│ • Custom        │    │ • Portfolio     │    │ • Kraken        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         ▲                       ▲                       ▲
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ▼
                     ┌─────────────────┐
                     │   Event Bus     │
                     │                 │
                     │ • Market Data   │
                     │ • Order Events  │
                     │ • Risk Alerts   │
                     └─────────────────┘
```

## Events

The package includes a comprehensive event system:

```typescript
// Market data events
EVENTS.TICKER_UPDATE
EVENTS.ORDERBOOK_UPDATE
EVENTS.TRADE_UPDATE
EVENTS.KLINE_UPDATE

// Trading events
EVENTS.ORDER_CREATED
EVENTS.ORDER_FILLED
EVENTS.ORDER_CANCELLED

// Strategy events
EVENTS.STRATEGY_SIGNAL
EVENTS.STRATEGY_ERROR

// Risk events
EVENTS.RISK_LIMIT_EXCEEDED
EVENTS.EMERGENCY_STOP
```

## Error Handling

The core package includes comprehensive error handling:

```typescript
engine.on('error', (error) => {
  console.error('Trading engine error:', error);
  // Handle gracefully
});

// Risk management errors
eventBus.onRiskLimitExceeded((data) => {
  if (data.severity === 'critical') {
    // Emergency procedures
    engine.stop();
  }
});
```

## Testing

```bash
# Run tests
pnpm test

# Run with coverage
pnpm test:coverage

# Watch mode
pnpm test:watch
```

## Contributing

This package is part of the crypto-trading monorepo. See the main README for contribution guidelines.

## License

MIT - See LICENSE file for details.
