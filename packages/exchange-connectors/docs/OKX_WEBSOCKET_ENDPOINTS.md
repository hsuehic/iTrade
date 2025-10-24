# OKX WebSocket Endpoints

## Overview

OKX provides **three separate WebSocket endpoints** for different types of data streams:

1. **Public** - Market data (tickers, trades, most orderbooks, klines)
2. **Private** - User data (orders, balances, positions) - requires authentication
3. **Business** - High-frequency tick-by-tick orderbook data

This document explains when to use each endpoint and how the implementation routes subscriptions.

---

## Endpoint URLs

### Mainnet (Production)

| Type | URL |
|------|-----|
| **Public** | `wss://ws.okx.com/ws/v5/public` |
| **Private** | `wss://ws.okx.com/ws/v5/private` |
| **Business** | `wss://ws.okx.com/ws/v5/business` |

### Testnet (Demo Trading)

| Type | URL |
|------|-----|
| **Public** | `wss://wspap.okx.com/ws/v5/public` |
| **Private** | `wss://wspap.okx.com/ws/v5/private` |
| **Business** | `wss://wspap.okx.com/ws/v5/business` |

---

## Channel Routing Logic

The `OKXExchange` implementation automatically routes subscriptions to the correct endpoint based on the channel type:

### Public Endpoint

**Used for**:

- **Tickers** (`tickers` channel)
- **Trades** (`trades` channel)
- **Klines** (`candle1m`, `candle5m`, etc.)
- **Standard Orderbook** (`books`, `books5`)

**Example Subscriptions**:

```json
// Ticker
{ "op": "subscribe", "args": [{ "channel": "tickers", "instId": "BTC-USDT" }] }

// Trades
{ "op": "subscribe", "args": [{ "channel": "trades", "instId": "BTC-USDT" }] }

// Klines
{ "op": "subscribe", "args": [{ "channel": "candle1m", "instId": "BTC-USDT" }] }

// Standard Orderbook (aggregated)
{ "op": "subscribe", "args": [{ "channel": "books", "instId": "BTC-USDT" }] }
{ "op": "subscribe", "args": [{ "channel": "books5", "instId": "BTC-USDT" }] }
```

---

### Private Endpoint

**Used for**:

- **Orders** (`orders` channel)
- **Balance and Position** (`balance_and_position` channel)
- **Account** (`account` channel)

**Authentication Required**: Yes (login with API key, secret, passphrase)

**Example Subscriptions**:

```json
// Login (required first)
{
  "op": "login",
  "args": [{
    "apiKey": "your-api-key",
    "passphrase": "your-passphrase",
    "timestamp": "1635991234",
    "sign": "generated-signature"
  }]
}

// After successful login
{ "op": "subscribe", "args": [{ "channel": "orders", "instType": "SPOT" }] }
{ "op": "subscribe", "args": [{ "channel": "balance_and_position" }] }
```

**Login Response**:

```json
{ "event": "login", "code": "0", "msg": "" }  // Success
{ "event": "error", "code": "60009", "msg": "Login failed" }  // Failure
```

---

### Business Endpoint

**Used for**:

- **Tick-by-Tick Orderbook** (`books-l2-tbt` channel)

**Use Case**: High-frequency trading requiring full L2 tick-by-tick data.

**Example Subscription**:

```json
{ "op": "subscribe", "args": [{ "channel": "books-l2-tbt", "instId": "BTC-USDT" }] }
```

**Note**: Most applications should use the standard `books` or `books5` channels on the **public** endpoint instead, as they are more efficient for typical trading strategies.

---

## Implementation Details

### Channel Resolution

**File**: `packages/exchange-connectors/src/okx/OKXExchange.ts`

**Method**: `resolveWsTypeForChannel(channel: string): OkxWsType`

```typescript
private resolveWsTypeForChannel(channel: string): OkxWsType {
  // Only full L2 TBT requires business endpoint
  if (channel === 'books-l2-tbt') return 'business';
  
  // Default market data → public
  return 'public';
}
```

**Key Point**: All channels **except** `books-l2-tbt` route to the **public** endpoint.

---

### Per-Endpoint Connection Management

Each endpoint has its own:

- **WebSocket connection** (`wsConnections.get('public')`, `wsConnections.get('private')`, etc.)
- **Reconnection attempts** (`okxReconnectAttemptsMap`)
- **Heartbeat timer** (`okxHeartbeatTimers`)
- **Subscription tracking** (`okxSubscriptions`)

**Benefits**:

- Independent reconnection for each endpoint
- Private WS can reconnect without affecting public market data
- Business endpoint used only when needed

---

## Subscription Examples

### Market Data (Public)

```typescript
// Ticker
await exchange.subscribeToTicker('BTC-USDT');
// → Uses public endpoint

// Trades
await exchange.subscribeToTrades('BTC-USDT');
// → Uses public endpoint

// Klines
await exchange.subscribeToKlines('BTC-USDT', '1m');
// → Uses public endpoint

// Orderbook (standard)
await exchange.subscribeToOrderBook('BTC-USDT');
// → Uses public endpoint (books5 channel)
```

---

### User Data (Private)

```typescript
// Must connect with credentials first
await exchange.connect({
  apiKey: 'your-api-key',
  apiSecret: 'your-api-secret',
  passphrase: 'your-passphrase',
});

// Subscribe to user data
await exchange.subscribeToUserData();
// → Opens private endpoint, authenticates, subscribes to orders and balance_and_position
```

---

### High-Frequency Tick Data (Business)

**Note**: Currently not implemented in the public API, but the routing logic is in place.

```typescript
// To implement in the future:
// await exchange.subscribeToTickByTickOrderBook('BTC-USDT');
// → Would use business endpoint
```

---

## Reconnection and Heartbeat

### Per-Endpoint Reconnection

Each endpoint has independent reconnection logic:

```typescript
private async scheduleOkxReconnect(key: OkxWsType): Promise<void> {
  const attempts = this.okxReconnectAttemptsMap[key];
  const delay = Math.min(1000 * Math.pow(2, attempts), 30000); // Exponential backoff
  
  // Reconnect after delay
  setTimeout(() => this.createWsConnect(key), delay);
}
```

**Max Delay**: 30 seconds

---

### Per-Endpoint Heartbeat

Each endpoint sends periodic `ping` messages to keep the connection alive:

```typescript
private startOkxHeartbeat(key: OkxWsType): void {
  this.okxHeartbeatTimers[key] = setInterval(() => {
    const ws = this.wsConnections.get(key);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send('ping');
    }
  }, 20000); // Every 20 seconds
}
```

**Expected Response**: OKX server responds with `pong`.

---

## Unsubscription

### WebSocket Unsubscribe Message

When a strategy is removed, the system now sends an **explicit unsubscribe message**:

```typescript
public async unsubscribe(
  symbol: string,
  type: 'ticker' | 'orderbook' | 'trades' | 'klines'
): Promise<void> {
  const channel = this.getOKXChannel(type, symbol);
  const targetKey = this.resolveWsTypeForChannel(channel.channel);
  
  const ws = this.wsConnections.get(targetKey);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ op: 'unsubscribe', args: [channel] }));
  }
  
  // Remove from local tracking
  this.okxSubscriptions.get(type)?.delete(symbol);
}
```

**Important**: The WebSocket connection **remains open** even after all subscriptions are removed, to avoid frequent reconnections.

---

## Debugging Tips

### Check Active Subscriptions

```typescript
// Internal tracking map
console.log(exchange.okxSubscriptions);

// Example output:
// Map {
//   'ticker' => Set { 'BTC-USDT', 'ETH-USDT' },
//   'trades' => Set { 'BTC-USDT' },
//   'klines' => Set { 'BTC-USDT@1m', 'ETH-USDT@5m' }
// }
```

### Monitor WebSocket State

```typescript
// Check if public endpoint is connected
const publicWs = exchange.wsConnections.get('public');
console.log('Public WS state:', publicWs?.readyState); // 1 = OPEN

// Check if private endpoint is authenticated
console.log('Private authenticated:', exchange.okxPrivateAuthenticated);
```

### Enable Debug Logging

Set logger level to `debug` to see WebSocket messages:

```typescript
// In logger configuration
logger.setLevel('debug');

// You'll see:
// [DEBUG] OKX public WS opened
// [DEBUG] Subscribed to tickers BTC-USDT
// [DEBUG] Unsubscribed from trades BTC-USDT
```

---

## Common Issues and Solutions

### Issue: "Login failed" on Private Endpoint

**Cause**: Invalid signature or expired timestamp

**Solution**:

1. Verify API key, secret, and passphrase
2. Ensure system clock is synchronized (NTP)
3. Check signature generation logic

```typescript
// Signature calculation
const timestamp = Date.now() / 1000;
const message = timestamp + 'GET' + '/users/self/verify';
const signature = crypto
  .createHmac('sha256', apiSecret)
  .update(message)
  .digest('base64');
```

---

### Issue: Data stops arriving after unsubscribing

**Cause**: Unsubscribe message was not sent (now fixed in latest version)

**Solution**: Ensure `SubscriptionCoordinator.cancelSubscription()` calls `exchange.unsubscribe()`

---

### Issue: "Subscription not found" when unsubscribing

**Cause**: Symbol format mismatch (e.g., `BTC-USDT` vs `BTC-USDT@1m`)

**Solution**: For klines, include interval in symbol: `${symbol}@${interval}`

---

## Performance Considerations

### Connection Overhead

- **Public**: Typically 1 connection for all market data
- **Private**: 1 connection for all user data
- **Business**: 1 connection (only if needed)

**Total**: 2-3 WebSocket connections per exchange instance

---

### Message Rate Limits

| Endpoint | Limit |
|----------|-------|
| Public | 240 requests per hour |
| Private | 240 requests per hour |
| Business | 240 requests per hour |

**Note**: These limits apply to subscription requests, not data messages.

---

### Data Throughput

| Channel | Typical Rate |
|---------|-------------|
| Tickers | ~1 msg/sec per symbol |
| Trades | Variable (1-100/sec) |
| Orderbook (books5) | ~10 msgs/sec |
| Orderbook (books-l2-tbt) | ~100+ msgs/sec |
| Orders | Event-driven |

---

## Best Practices

1. **Use Public Endpoint for Market Data**: Don't use business endpoint unless you need tick-by-tick data
2. **Authenticate Once**: Open private connection only once and keep it alive
3. **Batch Subscriptions**: Send multiple channels in one request when possible
4. **Handle Reconnection**: Always implement reconnection logic with exponential backoff
5. **Send Unsubscribe**: Always send unsubscribe messages to stop data flow
6. **Keep Connections Alive**: Send heartbeats every 20-30 seconds

---

## References

- [OKX WebSocket API Documentation](https://www.okx.com/docs-v5/en/#websocket-api)
- [OKX Public Channel](https://www.okx.com/docs-v5/en/#websocket-api-public-channel)
- [OKX Private Channel](https://www.okx.com/docs-v5/en/#websocket-api-private-channel)
- [OKX Business WebSocket](https://www.okx.com/docs-v5/en/#websocket-api-business-websocket)

---

Author: <xiaoweihsueh@gmail.com>  
Date: October 24, 2025
