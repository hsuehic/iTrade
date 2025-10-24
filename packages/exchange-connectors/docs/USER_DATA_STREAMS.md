# User Data Streams Implementation

## Overview

This document describes the implementation of real-time user data streams for exchange connectors, including order updates, account balance changes, and position updates.

## Supported Exchanges

### 1. Binance

**Implementation**: Uses dedicated user data streams via `BinanceWebsocket` helper class.

**Endpoints**:

- **Spot**: `wss://stream.binance.com:9443/stream` with listenKey
- **Futures**: `wss://fstream.binance.com/stream` with listenKey

**Subscription Process**:

```typescript
// Start user data streams
await exchange.subscribeToUserData();
```

**Supported Data Types**:

- **Order Updates**: Real-time order status changes (NEW, PARTIALLY_FILLED, FILLED, CANCELED, etc.)
- **Account Updates**: Balance changes for all assets
- **Position Updates** (Futures only): Position size, unrealized PnL, margin changes

**Event Emission**:

```typescript
// Listen to normalized events
exchange.on('orderUpdate', (order: Order) => {
  console.log('Order update:', order);
});

exchange.on('accountUpdate', (balances: Balance[]) => {
  console.log('Account balances:', balances);
});

exchange.on('positionUpdate', (positions: Position[]) => {
  console.log('Positions:', positions);
});
```

**Data Normalization**: Raw Binance data is transformed into standard `Order`, `Balance`, and `Position` objects.

---

### 2. OKX

**Implementation**: Uses OKX private WebSocket with login authentication.

**Endpoints**:

- **Private WS (Mainnet)**: `wss://ws.okx.com/ws/v5/private`
- **Private WS (Testnet)**: `wss://wspap.okx.com/ws/v5/private`

**Authentication**:

- Automatic login on private WebSocket connection open
- Uses API key, secret, and passphrase with HMAC-SHA256 signature

**Subscription Process**:

```typescript
// Start private WebSocket and authenticate
await exchange.subscribeToUserData();
```

**Supported Channels**:

- **`orders`**: Order updates across all instruments
- **`balance_and_position`**: Account balance and position changes

**Event Emission**: Same as Binance (normalized events).

**Automatic Reconnection**:

- Exponential backoff with per-connection retry
- Re-authenticates and resubscribes on reconnection

---

## Data Normalization

All exchanges normalize incoming user data into standard formats:

### Order Object

```typescript
interface Order {
  id: string;                    // Exchange-specific order ID
  clientOrderId?: string;        // Client-provided order ID
  symbol: string;                // Trading pair (e.g., "BTC-USDT")
  type: OrderType;              // MARKET, LIMIT, STOP_LOSS, etc.
  side: OrderSide;              // BUY or SELL
  status: OrderStatus;          // NEW, FILLED, CANCELED, etc.
  price: Decimal;               // Order price
  quantity: Decimal;            // Order quantity
  executedQuantity: Decimal;    // Filled quantity
  timestamp: Date;              // Order creation time
  updateTime?: Date;            // Last update time
  timeInForce?: TimeInForce;    // GTC, IOC, FOK
}
```

### Balance Object

```typescript
interface Balance {
  asset: string;                // Asset symbol (e.g., "BTC", "USDT")
  free: Decimal;               // Available balance
  locked: Decimal;             // Locked balance
  total: Decimal;              // Total balance
  timestamp: Date;             // Update timestamp
}
```

### Position Object

```typescript
interface Position {
  symbol: string;               // Trading pair
  side: 'LONG' | 'SHORT';      // Position side
  size: Decimal;               // Position size
  entryPrice: Decimal;         // Average entry price
  markPrice?: Decimal;         // Current mark price
  liquidationPrice?: Decimal;  // Liquidation price
  unrealizedPnL?: Decimal;     // Unrealized profit/loss
  leverage?: number;           // Position leverage
  margin?: Decimal;            // Position margin
  timestamp: Date;             // Update timestamp
}
```

---

## Usage in Trading Engine

The `TradingEngine` automatically subscribes to user data when a strategy is started:

```typescript
// In TradingEngine
private setupEventListeners(): void {
  this._eventBus.onOrderUpdate((data) => {
    // Process order updates
    this.handleOrderUpdate(data.order);
  });

  this._eventBus.onAccountUpdate((data) => {
    // Process account balance updates
    this.handleAccountUpdate(data.balances);
  });

  this._eventBus.onPositionUpdate((data) => {
    // Process position updates
    this.handlePositionUpdate(data.positions);
  });
}
```

---

## Subscription Lifecycle

### Start User Data Streams

```typescript
// Called when TradingEngine starts
await exchange.subscribeToUserData();
```

### Receive Updates

```typescript
// Events are emitted automatically
exchange.on('orderUpdate', handleOrder);
exchange.on('accountUpdate', handleBalance);
exchange.on('positionUpdate', handlePosition);
```

### Stop User Data Streams

```typescript
// Called when TradingEngine stops
await exchange.disconnect();
```

---

## Error Handling

### Connection Errors

```typescript
exchange.on('error', (error) => {
  console.error('User data stream error:', error);
  // Auto-reconnection will be triggered
});
```

### Authentication Failures

```typescript
// OKX example
if (!okxPrivateAuthenticated) {
  this.emit('error', new Error('Private WebSocket authentication failed'));
}
```

---

## Implementation Details

### Binance

**File**: `packages/exchange-connectors/src/binance/BinanceExchange.ts`

**Key Methods**:

- `subscribeToUserData()`: Starts user data streams for spot and futures
- `transformBinanceOrderUpdate()`: Normalizes order data
- `transformBinanceAccountUpdate()`: Normalizes balance data
- `transformBinancePositionUpdate()`: Normalizes position data

**Helper Class**: `BinanceWebsocket` (in `packages/exchange-connectors/src/binance/BinanceWebsocket.ts`)

- Manages listenKey lifecycle
- Handles WebSocket connections for spot and futures
- Emits raw events: `spot:orderUpdate`, `futures:orderUpdate`, etc.

---

### OKX

**File**: `packages/exchange-connectors/src/okx/OKXExchange.ts`

**Key Methods**:

- `subscribeToUserData()`: Initiates private WebSocket connection
- `authenticatePrivateIfNeeded()`: Handles login authentication
- `signOkxWsLogin()`: Generates HMAC-SHA256 signature for login
- `transformOKXPrivateOrder()`: Normalizes order data
- `transformOKXBalanceAndPosition()`: Normalizes balance and position data
- `sendUserDataSubscription()`: Subscribes to `orders` and `balance_and_position` channels
- `sendUserDataUnsubscription()`: Unsubscribes from user data channels

**Authentication Flow**:

1. Open private WebSocket connection
2. Send login message with signature
3. Wait for login success (`{ event: 'login', code: '0' }`)
4. Subscribe to user data channels

---

## Testing

### Manual Testing

```typescript
// Connect exchange
await exchange.connect({
  apiKey: 'your-api-key',
  apiSecret: 'your-api-secret',
  passphrase: 'your-passphrase', // OKX only
});

// Subscribe to user data
await exchange.subscribeToUserData();

// Listen to events
exchange.on('orderUpdate', (order) => {
  console.log('Order:', order);
});

// Place a test order to trigger updates
await exchange.createOrder({
  symbol: 'BTC-USDT',
  type: 'LIMIT',
  side: 'BUY',
  price: new Decimal('30000'),
  quantity: new Decimal('0.001'),
});
```

---

## Security Considerations

1. **API Credentials**: Store API keys, secrets, and passphrases securely (environment variables, secrets manager)
2. **Signature Generation**: Always use HMAC-SHA256 for OKX authentication
3. **Listen Key Renewal**: Binance listen keys expire after 60 minutes and must be renewed
4. **WebSocket Security**: All connections use WSS (secure WebSocket over TLS)

---

## Future Enhancements

1. **Additional Exchanges**: Implement user data streams for Coinbase, Kraken, etc.
2. **Error Recovery**: Enhanced retry logic for authentication failures
3. **Subscription Filtering**: Allow filtering by symbol or order type
4. **Historical Snapshots**: Request initial snapshot of orders/positions on connection

---

## References

- [Binance User Data Streams](https://binance-docs.github.io/apidocs/spot/en/#user-data-streams)
- [Binance Futures User Data Streams](https://binance-docs.github.io/apidocs/futures/en/#user-data-streams)
- [OKX WebSocket Private Channel](https://www.okx.com/docs-v5/en/#websocket-api-private-channel)
- [OKX Login Authentication](https://www.okx.com/docs-v5/en/#websocket-api-login)

---

Author: <xiaoweihsueh@gmail.com>  
Date: October 24, 2025
