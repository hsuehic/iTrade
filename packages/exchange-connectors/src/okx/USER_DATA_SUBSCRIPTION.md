# OKX User Data Subscription

## Overview

The `subscribeToUserData()` method enables real-time WebSocket subscriptions to OKX private data streams, including:
- **Orders** - Real-time order updates (fills, cancellations, status changes)
- **Account Balance** - Spot account balance updates
- **Balance and Position** - Combined balance and position updates (for margin/futures trading)

## Prerequisites

1. **OKX Credentials Required**:
   - API Key
   - Secret Key
   - Passphrase (OKX specific)

2. **Connection**: You must call `connect()` with credentials before subscribing to user data

## Usage

```typescript
import { OKXExchange } from '@itrade/exchange-connectors';

// Initialize OKX exchange
const okx = new OKXExchange(false); // false = mainnet, true = demo trading

// Connect with credentials
await okx.connect({
  apiKey: 'your-api-key',
  secretKey: 'your-secret-key',
  passphrase: 'your-passphrase', // OKX specific
});

// Subscribe to user data streams
await okx.subscribeToUserData();

// Listen to events
okx.on('orderUpdate', (symbol, order) => {
  console.log(`Order update for ${symbol}:`, order);
});

okx.on('accountUpdate', (exchange, balances) => {
  console.log('Account balance update:', balances);
});

okx.on('positionUpdate', (exchange, positions) => {
  console.log('Position update:', positions);
});
```

## WebSocket Channels

The implementation subscribes to three OKX private WebSocket channels:

### 1. Orders Channel
- **Channel**: `orders`
- **InstType**: `ANY` (all instrument types: SPOT, SWAP, FUTURES, OPTION)
- **Events**: `orderUpdate`
- **Data**: Order objects with status, filled quantity, price, etc.

### 2. Balance and Position Channel
- **Channel**: `balance_and_position`
- **Events**: `accountUpdate` (balances), `positionUpdate` (positions)
- **Data**: 
  - Balances: Cash balance per currency
  - Positions: Open positions with PnL, leverage, mark price

### 3. Account Channel
- **Channel**: `account`
- **Events**: `accountUpdate`
- **Data**: Detailed spot account balance (available + frozen)

## Event Data Structures

### Order Update Event

```typescript
{
  symbol: string;           // e.g., "BTC-USDT"
  order: {
    id: string;             // Order ID
    clientOrderId?: string; // Client order ID
    symbol: string;         // Trading pair
    side: 'buy' | 'sell';
    type: 'limit' | 'market' | ...;
    quantity: Decimal;      // Order quantity
    price?: Decimal;        // Order price (undefined for market orders)
    status: OrderStatus;    // 'open', 'filled', 'canceled', etc.
    timestamp: Date;        // Order creation time
    updateTime?: Date;      // Last update time
    executedQuantity?: Decimal; // Filled quantity
  }
}
```

### Account Update Event

```typescript
{
  exchange: 'okx';
  balances: [{
    asset: string;       // e.g., "USDT", "BTC"
    free: Decimal;       // Available balance
    locked: Decimal;     // Locked balance (in orders)
    total: Decimal;      // Total = free + locked
  }, ...]
}
```

### Position Update Event

```typescript
{
  exchange: 'okx';
  positions: [{
    symbol: string;        // e.g., "BTC-USDT-SWAP"
    side: 'long' | 'short';
    quantity: Decimal;     // Position size
    avgPrice: Decimal;     // Average entry price
    markPrice: Decimal;    // Current mark price
    unrealizedPnl: Decimal; // Unrealized profit/loss
    leverage: Decimal;     // Position leverage
    timestamp: Date;
  }, ...]
}
```

## Authentication Flow

1. **Connection**: Creates private WebSocket connection to `wss://ws.okx.com/ws/v5/private`
2. **Login**: Sends authentication message with signed credentials
3. **Wait**: Waits for login confirmation (max 10 seconds)
4. **Subscribe**: Sends subscription requests to all three channels
5. **Ready**: Starts receiving real-time updates

## Error Handling

```typescript
okx.on('ws_error', (error) => {
  console.error('WebSocket error:', error);
});

try {
  await okx.subscribeToUserData();
} catch (error) {
  if (error.message.includes('credentials')) {
    console.error('Missing or invalid OKX credentials');
  } else if (error.message.includes('authentication timeout')) {
    console.error('Failed to authenticate with OKX');
  }
}
```

## Keep-Alive and Reconnection

- **Heartbeat**: Automatic ping/pong to keep connection alive
- **Auto-Reconnection**: Automatically reconnects on disconnect
- **Re-authentication**: Automatically re-authenticates on reconnection
- **Re-subscription**: Automatically re-subscribes to channels after reconnection

## Testing

### Demo Trading (Testnet)

```typescript
const okx = new OKXExchange(true); // true = demo trading mode

await okx.connect({
  apiKey: 'demo-api-key',
  secretKey: 'demo-secret-key',
  passphrase: 'demo-passphrase',
});

await okx.subscribeToUserData();
```

Demo trading uses:
- Base URL: `https://www.okx.com`
- WebSocket: `wss://wspap.okx.com/ws/v5/private`
- Header: `x-simulated-trading: 1`

## Notes

1. **Permissions**: Ensure your API key has trading permissions for user data subscriptions
2. **Rate Limits**: OKX has connection and subscription rate limits
3. **IP Whitelist**: Some accounts require IP whitelisting for API access
4. **Data Format**: All prices and quantities use `Decimal` type for precision
5. **Symbol Format**: OKX uses `-` separator (e.g., `BTC-USDT`), automatically normalized from `/` format

## References

- [OKX WebSocket API Documentation](https://www.okx.com/docs-v5/en/#websocket-api)
- [OKX Private WebSocket Channels](https://www.okx.com/docs-v5/en/#websocket-api-private-channel)
- [OKX Authentication](https://www.okx.com/docs-v5/en/#websocket-api-login)

---

Author: xiaoweihsueh@gmail.com  
Date: October 24, 2025

