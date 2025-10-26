# iTrade Console Application Guide

## Overview

The iTrade Console Application is a complete trading system that integrates all components of the iTrade platform:

- **TradingEngine**: Core trading orchestration
- **Exchange Connectors**: Connect to Binance, OKX, and Coinbase
- **Strategy Manager**: Auto-load and manage strategies from database
- **Order Tracker**: Monitor and persist all order events with debounce mechanism
- **Balance Tracker**: Monitor and persist account balance updates with debounce mechanism  
- **Position Tracker**: Monitor and persist position updates with debounce mechanism

## Features

✅ **Multi-Exchange Support**: Binance, OKX, Coinbase  
✅ **Database-Driven Strategy Management**: Strategies loaded from PostgreSQL  
✅ **Multi-User Support**: Filter strategies by userId  
✅ **Real-time Event Tracking**: Orders, balances, positions persisted to database  
✅ **Debounce Mechanisms**: Efficient handling of high-frequency updates  
✅ **State Recovery**: Strategy state persistence and recovery  
✅ **Graceful Shutdown**: Clean resource cleanup on exit

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                   iTrade Console Application                  │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────┐     ┌──────────────────┐                   │
│  │  TradingEngine│────▶│ Exchange Manager │                   │
│  └──────────────┘     └──────────────────┘                   │
│         │                    │                                │
│         │              ┌─────┴─────┐                          │
│         │              │           │                          │
│         ▼         ┌────▼───┐ ┌────▼───┐ ┌────────┐           │
│  ┌─────────────┐  │Binance │ │  OKX   │ │Coinbase│           │
│  │   Strategy  │  └────────┘ └────────┘ └────────┘           │
│  │   Manager   │                                              │
│  └─────────────┘                                              │
│         │                                                      │
│    ┌────┴────┐                                                │
│    ▼         ▼                                                │
│  [Strategy] [Strategy] ...                                    │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                Event Bus (Central Hub)                │    │
│  └──────────────────────────────────────────────────────┘    │
│         │         │           │           │                   │
│    ┌────▼───┐ ┌──▼──────┐ ┌──▼──────┐ ┌──▼──────┐           │
│    │ Order  │ │ Balance │ │Position │ │ ...     │           │
│    │Tracker │ │ Tracker │ │ Tracker │ │         │           │
│    └────┬───┘ └───┬─────┘ └───┬─────┘ └─────────┘           │
│         │         │           │                               │
│         └─────────┴───────────┴───────────▶                   │
│                                            │                   │
│                                  ┌─────────▼────────┐          │
│                                  │   PostgreSQL DB  │          │
│                                  │  - Orders        │          │
│                                  │  - Balances      │          │
│                                  │  - Positions     │          │
│                                  │  - Strategies    │          │
│                                  └──────────────────┘          │
└──────────────────────────────────────────────────────────────┘
```

## Prerequisites

1. **Node.js** >= 18.x
2. **PostgreSQL** >= 14.x
3. **pnpm** >= 8.x
4. **Exchange API Credentials** (at least one):
   - Binance API Key + Secret
   - OKX API Key + Secret + Passphrase
   - Coinbase API Key + Secret

## Installation

```bash
# From iTrade project root
cd apps/console

# Install dependencies (if not already done)
pnpm install
```

## Configuration

### Environment Variables

Create a `.env` file in `apps/console/`:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=itrade
DB_LOGGING=false

# User ID (for multi-user support)
USER_ID=your-user-id-here

# Binance Exchange (Optional)
BINANCE_API_KEY=your_binance_api_key
BINANCE_SECRET_KEY=your_binance_secret_key

# OKX Exchange (Optional)
OKX_API_KEY=your_okx_api_key
OKX_SECRET_KEY=your_okx_secret_key
OKX_PASSPHRASE=your_okx_passphrase

# Coinbase Exchange (Optional)
COINBASE_API_KEY=your_coinbase_api_key
COINBASE_SECRET_KEY=your_coinbase_secret_key
```

### Multi-User Support

The console application supports multi-user systems:

- **With USER_ID**: Only loads strategies for that specific user
- **Without USER_ID**: Loads ALL strategies from database (single-user mode)

**For production multi-user deployments:**

```bash
# Run separate instances for each user
USER_ID=user1 pnpm start  # User 1's instance
USER_ID=user2 pnpm start  # User 2's instance
```

## Running the Application

### Start the Console Application

```bash
cd apps/console
pnpm start
```

### Expected Startup Sequence

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 iTrade Console Application Starting...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 User ID: cm3nfjhc00000igq8uqlwm987

📦 Step 1: Initializing database connection...
✅ Database connected

📦 Step 2: Initializing trading components...
✅ TradingEngine initialized

📦 Step 3: Initializing exchanges...
✅ Binance WebSocket connected
✅ Binance exchange initialized
✅ OKX exchange initialized
✅ Coinbase exchange initialized
✅ 3 exchange(s) initialized: binance, okx, coinbase

📦 Step 4: Initializing trackers...
Starting Order Tracker...
✅ Order Tracker started (partial fill debounce: 1s per order)
Starting Balance Tracker...
✅ Balance Tracker started (debounce: 2s per exchange)
Starting Position Tracker...
✅ Position Tracker started (debounce: 2s per exchange-symbol)
✅ All trackers initialized

📦 Step 5: Initializing strategy manager...
Starting Strategy Manager...
👤 Loading strategies for user: cm3nfjhc00000igq8uqlwm987
📈 Available strategy implementations: 3
Loading 2 active strategies...
✅ Added strategy: MA_Test (ID: 1)
   Type: moving_average, Symbol: BTCUSDT, Exchange: binance
✅ Added strategy: RSI_Test (ID: 2)
   Type: rsi, Symbol: ETHUSDT, Exchange: binance
✅ Strategy manager initialized

📦 Step 6: Starting trading engine...
✅ Trading engine started

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 iTrade Trading System is LIVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 User: cm3nfjhc00000igq8uqlwm987
📡 Exchanges: 3 connected
📊 Strategies: Loaded from database (auto-managed for user)
💾 Order Tracking: Active (partial fill debounce: 1s)
💰 Balance Tracking: Active (debounce: 2s per exchange)
📈 Position Tracking: Active (debounce: 2s per symbol)
🔄 Strategy Sync: Every 10 minutes
📊 Performance Reports: Every 10 minutes
💾 State Backup: Every 1 minute
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Press Ctrl+C to stop the application
```

## Features Explained

### 1. Order Tracker

Monitors all order events and persists them to the database with intelligent debouncing:

- **Immediate Save**: Order creation, filled, cancelled, rejected
- **Debounced Save** (1s): Partial fills (can be very frequent)
- **Auto-Cancel**: Clears debounce timers when order reaches final state

**Benefits:**

- Reduces database writes by up to 90% for high-frequency partial fills
- Ensures all order state changes are captured
- Maintains data consistency

### 2. Balance Tracker

Monitors account balance updates with debouncing:

- **Debounce Period**: 2 seconds per exchange
- **Grouping**: By exchange name
- **Full Account Info**: Saves all balances together

**Benefits:**

- Handles rapid balance updates efficiently
- Reduces unnecessary database writes
- Captures latest state accurately

### 3. Position Tracker

Monitors position updates with debouncing:

- **Debounce Period**: 2 seconds per (exchange + symbol)
- **Grouping**: By exchange and symbol
- **Zero Position Handling**: Automatically deletes closed positions

**Benefits:**

- Handles OKX full-snapshot and Binance incremental updates
- Optimizes high-frequency position updates
- Keeps position data current

### 4. Strategy Manager

Auto-manages strategies from database:

- **Auto-Load**: Loads active strategies on startup
- **Auto-Sync**: Syncs every 10 minutes with database
- **Auto-Add**: Detects new active strategies
- **Auto-Remove**: Detects stopped/paused strategies
- **State Persistence**: Saves strategy state every minute
- **State Recovery**: Recovers strategy state on restart

**User Filtering:**

- Only loads strategies belonging to specified USER_ID
- Supports multi-user deployments
- Prevents strategy conflicts between users

## Graceful Shutdown

Press `Ctrl+C` to gracefully shut down:

```
🛑 Shutting down gracefully...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Stopping strategy manager...
   📊 Final metrics for strategy_1: 15 signals, 8 orders in 0.50h
   💾 Strategy state backup completed: 2 successful, 0 failed
   ✅ Strategy manager stopped

2. Stopping trackers...
   📊 Order Tracker Final Report
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      Total Orders Created: 8
      Orders Filled: 6
      Partial Fill Updates: 24 received, 8 saved
      Partial Fill Debounce Efficiency: 66.7% reduction
      Orders Cancelled: 2
      Orders Rejected: 0
      Running time: 0.50 hours
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   
   📊 Balance Tracker Final Report
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      Total Updates Received: 45
      Total Saved to Database: 12
      Debounce Efficiency: 73.3% reduction
      Running time: 0.50 hours
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   
   ✅ Trackers stopped

3. Stopping trading engine...
   ✅ Trading engine stopped

4. Disconnecting exchanges...
   ✅ binance disconnected
   ✅ okx disconnected
   ✅ coinbase disconnected
   ✅ All exchanges disconnected

5. Closing database connection...
   ✅ Database connection closed

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👋 Shutdown complete. Goodbye!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Monitoring & Metrics

### Strategy Performance Reports

Every 10 minutes, the application logs strategy performance:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Strategy Performance Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 strategy_1:
   Running for: 0.50h (30m)
   Signals generated: 15
   Orders executed: 8
   Last signal: 45s ago
   Last order: 120s ago
   💰 Total PnL: 125.50
   💵 Realized PnL: 100.25
   📊 Total Orders: 8 (6 filled)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Tracker Efficiency Metrics

Debounce efficiency is reported on shutdown:

- **Order Tracker**: Partial fill reduction percentage
- **Balance Tracker**: Update reduction percentage
- **Position Tracker**: Update reduction percentage

## Troubleshooting

### No Strategies Loaded

**Problem**: `Loading 0 active strategies...`

**Solutions**:

1. Check if USER_ID in .env matches strategies in database
2. Verify strategies have status = 'ACTIVE' in database
3. Run without USER_ID to load all strategies (development only)

### Exchange Connection Failed

**Problem**: `❌ Failed to initialize Binance exchange`

**Solutions**:

1. Check API credentials in .env file
2. Verify API key permissions on exchange
3. Check IP whitelist if enabled on exchange
4. Verify network connectivity

### Database Connection Failed

**Problem**: `❌ Database connection failed`

**Solutions**:

1. Verify PostgreSQL is running
2. Check DB_* credentials in .env file
3. Ensure database 'itrade' exists
4. Run schema sync: `cd packages/data-manager && pnpm run sync-schema`

### High CPU/Memory Usage

**Problem**: Application using too much resources

**Solutions**:

1. Increase debounce intervals (edit main.ts):
   - `DEBOUNCE_MS` in OrderTracker
   - `DEBOUNCE_MS` in BalanceTracker  
   - `DEBOUNCE_MS` in PositionTracker
2. Reduce strategy sync interval
3. Disable detailed logging (set LogLevel.WARN)

## Development

### Running in Debug Mode

Use VS Code debugger with the following launch configuration:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Console App",
  "runtimeArgs": [
    "-r", "ts-node/register",
    "-r", "tsconfig-paths/register",
    "-r", "reflect-metadata"
  ],
  "args": ["${workspaceFolder}/apps/console/src/main.ts"],
  "env": {
    "TS_NODE_PROJECT": "${workspaceFolder}/apps/console/tsconfig.build.json",
    "NODE_OPTIONS": "--conditions=source"
  }
}
```

### Modifying Debounce Settings

Edit the constants in each tracker:

```typescript
// apps/console/src/integration/helpers/order-tracker.ts
private readonly DEBOUNCE_MS = 1000; // 1 second

// apps/console/src/integration/helpers/balance-tracker.ts
private readonly DEBOUNCE_MS = 2000; // 2 seconds

// apps/console/src/integration/helpers/position-tracker.ts
private readonly DEBOUNCE_MS = 2000; // 2 seconds
```

### Testing Individual Components

```bash
# Test strategy manager
pnpm test:strategy-execution

# Test exchange connections
pnpm test:binance
pnpm test:okx
pnpm test:coinbase

# Test database
pnpm test:db:order-association
```

## Production Deployment

### Multi-User Setup

Deploy separate instances for each user:

```bash
# Docker Compose example
services:
  itrade-user1:
    image: itrade-console:latest
    environment:
      - USER_ID=user1-uuid
      - DB_HOST=postgres
      # ... other env vars
  
  itrade-user2:
    image: itrade-console:latest
    environment:
      - USER_ID=user2-uuid
      - DB_HOST=postgres
      # ... other env vars
```

### Process Management

Use PM2 or similar:

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start pnpm --name itrade-console -- start

# Monitor
pm2 logs itrade-console
pm2 monit

# Restart
pm2 restart itrade-console

# Stop
pm2 stop itrade-console
```

### Monitoring & Alerts

- Monitor process health with PM2
- Set up database monitoring
- Configure exchange API rate limit alerts
- Monitor PnL and strategy performance
- Set up error logging to external service (e.g., Sentry)

## Security Best Practices

1. **Never commit .env files**: Add to .gitignore
2. **Use read-only API keys** for exchanges when possible
3. **Restrict database user permissions**: Only grant necessary access
4. **Enable IP whitelisting** on exchange APIs
5. **Use environment-specific credentials**: dev vs production
6. **Rotate API keys regularly**
7. **Monitor for suspicious activity**

## Support

For issues or questions:

- Check [Troubleshooting](#troubleshooting) section
- Review logs for detailed error messages
- Check exchange API documentation
- Contact: <xiaoweihsueh@gmail.com>

---

Author: <xiaoweihsueh@gmail.com>  
Date: October 26, 2025
