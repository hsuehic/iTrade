# @crypto-trading/logger

Enterprise-grade structured logging system designed specifically for cryptocurrency trading applications.

## Overview

This package provides comprehensive logging capabilities tailored for trading systems:

- **Trading-Specific Logging** - Specialized methods for trades, orders, strategies, and risk events
- **Multiple Transports** - Console, file, and daily rotation support
- **Structured Output** - JSON and human-readable formats
- **Performance Optimized** - Async logging with buffering and batching
- **Winston Integration** - Built on the industry-standard Winston logger

## Features

### 📝 Trading-Specific Log Types
- **Trade Logging** - Order executions, fills, and P&L tracking
- **Strategy Logging** - Signal generation, entry/exit decisions
- **Risk Logging** - Risk alerts, limit breaches, portfolio metrics
- **Exchange Logging** - API calls, rate limiting, connection events
- **Performance Logging** - Execution timing, latency tracking

### 🎯 Multiple Logger Types
- **TradingLogger** - Full-featured Winston-based logger
- **ConsoleLogger** - Simple development logging
- **FileLogger** - Custom file-based logging with rotation

### 🚀 Advanced Features
- **Daily Log Rotation** - Automatic file rotation with retention policies
- **Child Loggers** - Contextual logging with persistent metadata
- **Log Levels** - Debug, Info, Warn, Error with filtering
- **Async Performance** - Non-blocking logging operations

## Installation

```bash
pnpm add @crypto-trading/logger @crypto-trading/core
```

## Quick Start

### Basic Usage
```typescript
import { TradingLogger } from '@crypto-trading/logger';

const logger = new TradingLogger({
  level: 'info',
  logDir: './logs',
  enableConsole: true,
  enableFile: true
});

// Trading-specific logging
logger.logTrade('Order executed', {
  orderId: 'ORDER_123',
  symbol: 'BTCUSDT',
  side: 'BUY',
  quantity: '0.1',
  price: '45000',
  pnl: '+150.00'
});

logger.logStrategy('Signal generated', {
  strategy: 'MovingAverage',
  symbol: 'BTCUSDT',
  action: 'BUY',
  confidence: 0.85,
  indicators: { sma20: 45000, sma50: 44500 }
});
```

### Console Logger (Development)
```typescript
import { ConsoleLogger } from '@crypto-trading/logger';

const logger = new ConsoleLogger('debug');

logger.info('Application started');
logger.logTrade('Mock trade executed', { symbol: 'BTCUSDT' });
```

### File Logger (Custom Implementation)
```typescript
import { FileLogger } from '@crypto-trading/logger';

const logger = new FileLogger({
  logFile: './logs/custom.log',
  level: 'info',
  maxFileSize: 50, // MB
  maxFiles: 5
});

await logger.flush(); // Ensure all logs are written
```

## Configuration

### TradingLogger Options
```typescript
interface TradingLoggerOptions {
  level?: 'debug' | 'info' | 'warn' | 'error';
  logDir?: string;              // Default: './logs'
  enableConsole?: boolean;      // Default: true
  enableFile?: boolean;         // Default: true
  maxFiles?: string;            // Default: '14d' (14 days)
  maxSize?: string;             // Default: '20m' (20 MB)
  format?: 'json' | 'simple';   // Default: 'json'
}
```

### Advanced Configuration
```typescript
const logger = new TradingLogger({
  level: 'info',
  logDir: '/var/log/trading',
  enableConsole: process.env.NODE_ENV === 'development',
  enableFile: true,
  maxFiles: '30d',
  maxSize: '100m',
  format: 'json'
});
```

## Trading-Specific Methods

### Trade Logging
```typescript
// Order execution logging
logger.logTrade('Market order filled', {
  orderId: 'ORD_456789',
  symbol: 'ETHUSDT',
  side: 'SELL',
  type: 'MARKET',
  quantity: '2.5',
  executedPrice: '3200.50',
  totalValue: '8001.25',
  commission: '8.00',
  timestamp: new Date().toISOString()
});

// P&L tracking
logger.logTrade('Position closed', {
  symbol: 'BTCUSDT',
  entryPrice: '44000',
  exitPrice: '45000',
  quantity: '0.1',
  pnl: '+100.00',
  pnlPercent: '+2.27%',
  holdingPeriod: '2h 15m'
});
```

### Strategy Logging
```typescript
// Signal generation
logger.logStrategy('RSI oversold signal', {
  strategy: 'RSIStrategy',
  symbol: 'ADAUSDT',
  action: 'BUY',
  confidence: 0.92,
  indicators: {
    rsi: 25.5,
    price: '0.38',
    volume: '1250000'
  },
  decision: 'Strong buy signal'
});

// Strategy performance
logger.logStrategy('Strategy performance update', {
  strategy: 'MovingAveragesCross',
  winRate: '68.5%',
  totalTrades: 147,
  avgReturn: '+2.3%',
  sharpeRatio: 1.85
});
```

### Risk Management Logging
```typescript
// Risk alerts
logger.logRisk('Position size limit exceeded', {
  symbol: 'BTCUSDT',
  requestedSize: '5.0',
  maxAllowed: '2.5',
  portfolioValue: '100000',
  action: 'ORDER_REJECTED'
});

// Portfolio risk metrics
logger.logRisk('Daily VaR update', {
  portfolioVaR: '2.5%',
  maxDrawdown: '1.8%',
  leverage: '1.2x',
  concentration: {
    BTC: '35%',
    ETH: '25%',
    others: '40%'
  }
});
```

### Exchange API Logging
```typescript
// API call logging
logger.logExchange('Order placement API call', {
  exchange: 'Binance',
  endpoint: '/api/v3/order',
  method: 'POST',
  responseTime: '145ms',
  rateLimit: '1150/1200',
  success: true
});

// Connection events
logger.logExchange('WebSocket reconnection', {
  exchange: 'Binance',
  stream: 'btcusdt@kline_1m',
  reconnectAttempt: 3,
  reason: 'Connection timeout',
  status: 'RECONNECTED'
});
```

### Performance Logging
```typescript
// Execution timing
logger.logPerformance('Strategy execution completed', {
  strategy: 'GridTrading',
  executionTime: '23ms',
  symbolsProcessed: 15,
  signalsGenerated: 3,
  ordersPlaced: 1,
  memoryUsage: '45.2MB'
});

// System performance
logger.logPerformance('System metrics', {
  cpuUsage: '15.3%',
  memoryUsage: '67.8%',
  activeConnections: 8,
  queuedJobs: 2,
  uptime: '5d 3h 22m'
});
```

## Child Loggers

Create contextual loggers with persistent metadata:

```typescript
// Create child logger for specific strategy
const strategyLogger = logger.createChildLogger({
  strategy: 'MovingAveragesCross',
  version: '2.1.0',
  symbols: ['BTCUSDT', 'ETHUSDT']
});

// All logs from this logger will include the metadata
strategyLogger.info('Strategy initialized');
strategyLogger.logTrade('Order placed', { orderId: 'ABC123' });
// Output includes: strategy="MovingAveragesCross", version="2.1.0", symbols=[...]
```

## Log Output Examples

### JSON Format (Production)
```json
{
  "timestamp": "2024-01-15T10:30:15.123Z",
  "level": "info",
  "message": "Market order filled",
  "type": "TRADE",
  "orderId": "ORD_456789",
  "symbol": "ETHUSDT",
  "side": "SELL",
  "quantity": "2.5",
  "executedPrice": "3200.50",
  "pnl": "+45.75"
}
```

### Simple Format (Development)
```
2024-01-15 10:30:15 [INFO]: [TRADE] Market order filled {"orderId":"ORD_456789","symbol":"ETHUSDT","side":"SELL"}
2024-01-15 10:30:16 [WARN]: [RISK] Position size approaching limit {"symbol":"BTCUSDT","currentSize":"1.8","limit":"2.0"}
```

### Console Output (Colored)
```
10:30:15 info: [TRADE] Market order filled {"orderId":"ORD_456789"}
10:30:16 warn: [RISK] Position size approaching limit {"currentSize":"1.8"}
```

## File Organization

The logger automatically organizes log files:

```
logs/
├── app-2024-01-15.log          # General application logs
├── trading-2024-01-15.log      # Trading-specific logs
├── error-2024-01-15.log        # Error logs only
├── app-2024-01-14.log          # Previous day (auto-rotated)
└── ...
```

## Best Practices

### 1. Structured Logging
```typescript
// Good: Structured data
logger.logTrade('Order executed', {
  orderId: 'ABC123',
  symbol: 'BTCUSDT',
  price: '45000',
  quantity: '0.1'
});

// Avoid: Unstructured strings
logger.info('Order ABC123 executed for BTCUSDT at 45000 with qty 0.1');
```

### 2. Appropriate Log Levels
```typescript
logger.debug('Order validation passed'); // Development info
logger.info('Order placed successfully'); // Normal operations
logger.warn('Rate limit approaching');    // Warnings
logger.error('Order placement failed');   // Errors requiring attention
```

### 3. Context with Child Loggers
```typescript
// Create context-specific loggers
const exchangeLogger = logger.createChildLogger({ exchange: 'Binance' });
const strategyLogger = logger.createChildLogger({ strategy: 'GridBot' });
```

### 4. Performance Considerations
```typescript
// Use appropriate log levels in production
const logger = new TradingLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
});

// Flush logs before shutdown
process.on('SIGTERM', async () => {
  await logger.flush();
});
```

## Error Handling

```typescript
try {
  await placeOrder(orderData);
  logger.logTrade('Order placed', orderData);
} catch (error) {
  logger.error('Order placement failed', {
    error: error.message,
    orderData,
    stack: error.stack
  });
  
  // Log to risk system if it's a critical error
  if (error.code === 'INSUFFICIENT_BALANCE') {
    logger.logRisk('Insufficient balance detected', {
      requestedAmount: orderData.quantity,
      availableBalance: error.availableBalance
    });
  }
}
```

## Integration Examples

### With Express.js Middleware
```typescript
import express from 'express';

const app = express();

app.use((req, res, next) => {
  const requestLogger = logger.createChildLogger({
    requestId: generateId(),
    ip: req.ip
  });
  
  req.logger = requestLogger;
  requestLogger.info('API request', {
    method: req.method,
    url: req.url
  });
  
  next();
});
```

### With Strategy Framework
```typescript
class TradingStrategy {
  private logger: ILogger;

  constructor(private config: StrategyConfig) {
    this.logger = logger.createChildLogger({
      strategy: config.name,
      version: config.version
    });
  }

  async analyze(data: MarketData): Promise<Signal> {
    this.logger.debug('Analyzing market data', {
      symbol: data.symbol,
      price: data.price
    });

    const signal = this.generateSignal(data);
    
    this.logger.logStrategy('Signal generated', {
      action: signal.action,
      confidence: signal.confidence
    });

    return signal;
  }
}
```

## Monitoring Integration

### Log Analysis with ELK Stack
```typescript
// Structured logs are perfect for Elasticsearch
logger.logTrade('Trade completed', {
  '@timestamp': new Date().toISOString(),
  event_type: 'trade_execution',
  symbol: 'BTCUSDT',
  pnl: 150.75,
  strategy: 'momentum',
  duration_ms: 1250
});
```

### Metrics Collection
```typescript
// Log metrics for external monitoring
logger.logPerformance('Strategy metrics', {
  strategy: 'GridBot',
  trades_per_hour: 12.5,
  avg_execution_time_ms: 85,
  success_rate: 0.94,
  active_positions: 6
});
```

## API Reference

### TradingLogger
- `debug(message, meta?)` - Debug level logging
- `info(message, meta?)` - Info level logging
- `warn(message, meta?)` - Warning level logging  
- `error(message, error?)` - Error level logging
- `logTrade(message, data)` - Trade-specific logging
- `logOrder(message, data)` - Order-specific logging
- `logStrategy(message, data)` - Strategy logging
- `logRisk(message, data)` - Risk management logging
- `logPerformance(message, data)` - Performance logging
- `logExchange(message, data)` - Exchange API logging
- `createChildLogger(meta)` - Create contextual logger
- `setLevel(level)` - Change log level dynamically
- `flush()` - Ensure all logs are written

### ConsoleLogger
- Same methods as TradingLogger but outputs to console only
- Colored output for better development experience
- Simpler configuration

### FileLogger  
- Custom file-based implementation
- Manual file rotation and management
- Batch writing for performance
- `flush()` method to ensure data persistence

## Dependencies

- **winston** - Core logging framework
- **winston-daily-rotate-file** - Automatic log rotation
- **@crypto-trading/core** - Core types and interfaces
