# Automatic User Data Subscription

## Overview

The TradingEngine now automatically subscribes to user data streams (orders, balances, positions) when an exchange with valid credentials is added. This eliminates the need for manual subscription calls.

## How It Works

### 1. Auto-Subscription on Exchange Registration

When `addExchange()` is called with a connected exchange (one that has valid credentials), the TradingEngine automatically:

1. Checks if the exchange is connected (`exchange.isConnected`)
2. Calls `exchange.subscribeToUserData()`
3. Sets up event listeners for user data updates

```typescript
public async addExchange(name: string, exchange: IExchange): Promise<void> {
  this._exchanges.set(name, exchange);
  this.setupExchangeListeners(exchange);
  
  // Auto-subscribe to user data if exchange has credentials
  if (exchange.isConnected) {
    try {
      await exchange.subscribeToUserData();
      this.logger.info(`✅ Subscribed to user data for exchange: ${name}`);
    } catch (error) {
      this.logger.warn(`Failed to subscribe to user data for ${name}`);
    }
  }
  
  this.logger.info(`Added exchange: ${name}`);
}
```

### 2. User Data Event Handling

The `setupExchangeListeners()` method now includes listeners for user data events:

- **`orderUpdate`**: Receives real-time order updates (fills, cancellations, etc.)
- **`accountUpdate`**: Receives balance updates
- **`positionUpdate`**: Receives position updates (for margin/futures trading)

```typescript
private setupExchangeListeners(exchange: IExchange): void {
  const exchangeName = exchange.name;

  // ... market data listeners ...

  // Listen for user data updates
  exchange.on('orderUpdate', (symbol: string, order: Order) => {
    this.logger.info(`📦 Order Update from ${exchangeName}: ${symbol} - ${order.status}`);
    // Emit to EventBus based on order status
    switch (order.status) {
      case 'FILLED':
        this._eventBus.emitOrderFilled({ order, timestamp: new Date() });
        break;
      case 'PARTIALLY_FILLED':
        this._eventBus.emitOrderPartiallyFilled({ order, timestamp: new Date() });
        break;
      // ... other statuses
    }
  });

  exchange.on('accountUpdate', (exchangeId: string, balances: any[]) => {
    this.logger.info(`💰 Account Update from ${exchangeName}: ${balances.length} balances`);
    this._eventBus.emitBalanceUpdate({ balances, timestamp: new Date() });
  });

  exchange.on('positionUpdate', (exchangeId: string, positions: Position[]) => {
    this.logger.info(`📊 Position Update from ${exchangeName}: ${positions.length} positions`);
    this._eventBus.emitPositionUpdate({ positions, timestamp: new Date() });
  });
}
```

## Usage

### Console Application

In `apps/console/src/main.ts`, simply connect and add exchanges:

```typescript
// Connect to OKX with credentials
const okx = new OKXExchange(!USE_MAINNET_FOR_DATA);
await okx.connect({
  apiKey: process.env.OKX_API_KEY,
  secretKey: process.env.OKX_SECRET_KEY,
  passphrase: process.env.OKX_PASSPHRASE,
});

// Add to engine - user data subscription happens automatically!
await engine.addExchange('okx', okx);

// Listen for user data updates via EventBus
eventBus.on('balance_update', (data) => {
  console.log('Balance Update:', data.balances);
});

eventBus.on('position_update', (data) => {
  console.log('Position Update:', data.positions);
});

eventBus.on('order_filled', (data) => {
  console.log('Order Filled:', data.order);
});
```

### Event Flow

```
Exchange WebSocket
    ↓
    ↓ (emits 'orderUpdate', 'accountUpdate', 'positionUpdate')
    ↓
TradingEngine.setupExchangeListeners()
    ↓
    ↓ (logs and transforms)
    ↓
EventBus
    ↓
    ↓ (emitOrderFilled, emitBalanceUpdate, emitPositionUpdate)
    ↓
Application Listeners
```

## Supported Exchanges

### OKX

- ✅ Automatic subscription to:
  - `orders` channel (all instrument types)
  - `balance_and_position` channel
  - `account` channel
- Authenticates private WebSocket automatically
- Normalizes data to standard iTrade format

### Binance

- ✅ Automatic subscription to user data stream
- Uses Binance User Data Stream API
- Normalizes data to standard iTrade format

### Coinbase

- Implementation pending for user data streams

## Benefits

1. **No Manual Subscription**: Developers don't need to remember to call `subscribeToUserData()`
2. **Consistent Behavior**: All exchanges follow the same pattern
3. **Error Handling**: Gracefully handles subscription failures without crashing
4. **Logging**: Clear logs for debugging subscription issues
5. **EventBus Integration**: All user data updates are available via the global EventBus

## Debugging

### Enable Debug Logs

User data subscriptions are logged with emojis for easy filtering:

```bash
# Look for subscription logs
grep "Subscribed to user data" console.log

# Look for user data updates
grep -E "(📦|💰|📊)" console.log
# 📦 = Order Update
# 💰 = Account Update
# 📊 = Position Update
```

### Common Issues

1. **Invalid Credentials**:
   - Error: `401 Unauthorized` or `Invalid timestamp`
   - Fix: Verify API key, secret, and passphrase
   - Fix: Check system clock synchronization (OKX requires accurate time)

2. **No User Data Updates**:
   - Check if exchange is connected: `exchange.isConnected`
   - Check logs for subscription errors
   - Verify WebSocket connection is established

3. **Subscription Failed but Engine Continues**:
   - This is expected behavior - the engine gracefully handles subscription failures
   - Market data will still work, only user data will be unavailable

## API Changes

### ITradingEngine Interface

Added `addExchange` method signature:

```typescript
interface ITradingEngine {
  // ...
  addExchange(name: string, exchange: IExchange): Promise<void>;
  removeExchange(name: string): void;
  // ...
}
```

### IExchange Interface

Added required method:

```typescript
interface IExchange {
  // ...
  subscribeToUserData(): Promise<void>;
  // ...
}
```

## Migration Guide

### Before (Manual Subscription)

```typescript
// Old way - manual subscription
await engine.addExchange('okx', okx);
await okx.subscribeToUserData(); // Manual call
```

### After (Automatic Subscription)

```typescript
// New way - automatic subscription
await engine.addExchange('okx', okx); // Subscription happens automatically
```

### Updating main.ts

Change all `engine.addExchange()` calls to `await engine.addExchange()`:

```typescript
// Before
engine.addExchange('okx', okx);

// After
await engine.addExchange('okx', okx);
```

## Implementation Details

### Exchange Requirements

Each exchange implementing `IExchange` must provide:

1. `subscribeToUserData()` method
2. Emit events: `orderUpdate`, `accountUpdate`, `positionUpdate`
3. Normalize data to iTrade standard format
4. Handle authentication for private WebSocket channels

### Data Normalization

All exchanges must normalize their raw data to iTrade standard types:

- **Order**: Standard `Order` type with consistent fields
- **Balance**: Standard `Balance` type (asset, free, locked, total)
- **Position**: Standard `Position` type (symbol, side, quantity, avgPrice, etc.)

## Future Enhancements

1. **Reconnection**: Auto-resubscribe on WebSocket reconnection
2. **Multiple Accounts**: Support multiple API keys for the same exchange
3. **Selective Subscription**: Allow disabling specific channels (orders only, balances only, etc.)
4. **Rate Limiting**: Handle exchange rate limits gracefully
5. **Historical Orders**: Automatically fetch recent order history on subscription

---

Author: xiaoweihsueh@gmail.com  
Date: October 24, 2025

