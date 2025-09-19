# Crypto Currency Trading Monorepo

A comprehensive cryptocurrency trading platform with strategy backtesting, built as a monorepo using pnpm.

## 🏗️ Architecture

This monorepo is organized into packages and applications:

### 📦 Packages

- **`@crypto-trading/core`** - Core trading engine, types, and interfaces
- **`@crypto-trading/exchange-connectors`** - Exchange API connectors (REST & WebSocket)
- **`@crypto-trading/strategies`** - Trading strategy implementations
- **`@crypto-trading/backtesting`** - Backtesting engine for strategy validation

### 🚀 Applications

- **`@crypto-trading/cli`** - Command-line interface for backtesting and strategy management

## 🛠️ Development Setup

### Prerequisites

- Node.js 18+ 
- pnpm 8+

### Installation

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Run tests
pnpm run test
```

### Development

```bash
# Start development mode (with watch)
pnpm run dev

# Run linting
pnpm run lint

# Type checking
pnpm run type-check
```

## 📊 Using the CLI

### Running Backtests

```bash
# Interactive mode
pnpm --filter @crypto-trading/cli start backtest --interactive

# Direct mode
pnpm --filter @crypto-trading/cli start backtest \\
  --strategy moving-average \\
  --symbol BTCUSDT \\
  --start-date 2024-01-01 \\
  --end-date 2024-12-31 \\
  --initial-balance 10000
```

## 📈 Strategies

### Moving Average Strategy

A simple moving average crossover strategy:

- **Fast MA**: Short-term moving average (default: 10 periods)
- **Slow MA**: Long-term moving average (default: 20 periods)  
- **Signal**: Buy when fast MA crosses above slow MA, sell when below

## 🔗 Exchange Support

### Currently Implemented

- **Binance** - Spot trading with REST and WebSocket APIs

### Planned

- Coinbase Pro
- Kraken
- FTX (if available)

## 🏛️ Package Structure

```
packages/
├── core/                 # Core trading engine
│   ├── src/
│   │   ├── types/       # TypeScript type definitions
│   │   ├── interfaces/  # Core interfaces
│   │   ├── engine/      # Trading engine implementation
│   │   ├── events/      # Event system
│   │   └── models/      # Base models
├── exchange-connectors/ # Exchange API connectors
│   ├── src/
│   │   ├── base/       # Base exchange implementation
│   │   ├── binance/    # Binance connector
│   │   └── utils/      # Utilities
├── strategies/          # Trading strategies
│   ├── src/
│   │   ├── strategies/ # Strategy implementations
│   │   └── indicators/ # Technical indicators
└── backtesting/         # Backtesting engine
    └── src/
        └── BacktestEngine.ts

apps/
├── cli/                 # Command-line interface
│   └── src/
│       ├── commands/    # CLI commands
│       └── index.ts
└── web-dashboard/       # Web dashboard (planned)
```

## 🔧 Configuration

### Environment Variables

```bash
# Exchange API Keys (for live trading)
BINANCE_API_KEY=your_api_key
BINANCE_SECRET_KEY=your_secret_key
BINANCE_TESTNET=true  # Use testnet for development

# Risk Management
MAX_POSITION_SIZE=0.1    # 10% of portfolio per position
MAX_DAILY_LOSS=0.05      # 5% max daily loss
```

## 🧪 Testing

```bash
# Run all tests
pnpm run test

# Run tests for specific package
pnpm --filter @crypto-trading/core run test

# Watch mode
pnpm run test:watch
```

## 📝 Adding New Strategies

1. Create a new strategy class extending `BaseStrategy`:

```typescript
import { BaseStrategy, StrategyResult } from '@crypto-trading/core';

export class MyStrategy extends BaseStrategy {
  async analyze(marketData: any): Promise<StrategyResult> {
    // Your strategy logic here
    return {
      action: 'buy',
      quantity: new Decimal(100),
      confidence: 0.8,
      reason: 'My custom signal'
    };
  }
}
```

2. Add it to the strategies package exports
3. Register it in the CLI commands

## 🔒 Risk Management

The system includes built-in risk management:

- Position size limits
- Daily loss limits  
- Maximum drawdown protection
- Emergency stop functionality

## 📊 Backtesting Features

- Historical data simulation
- Commission and slippage modeling
- Comprehensive performance metrics
- Equity curve analysis
- Trade-by-trade breakdown

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## ⚠️ Disclaimer

This software is for educational and research purposes only. Cryptocurrency trading involves substantial risk of loss. Past performance does not guarantee future results. Always do your own research and never invest more than you can afford to lose.
