# iTrade Exchange Test Suite

Comprehensive testing suite for all exchange connectors (Binance, OKX, Coinbase) covering both WebSocket and REST API functionality.

## Architecture

### Base Classes

The test suite uses abstract base classes to eliminate code duplication:

#### **BaseExchangeTest** (WebSocket Tests)
- Handles environment variable loading
- Manages test metrics and results tracking
- Provides auto-exit mechanism and timeouts
- Implements summary display
- Enforces consistent test structure

#### **BaseRESTTest** (REST API Tests)
- Similar structure to BaseExchangeTest
- Focused on REST endpoint testing
- No auto-exit (tests run sequentially and complete)
- Simplified metrics for market and account data

### Benefits

✅ **Single source of truth** - Common logic in one place  
✅ **Consistent behavior** - All exchanges tested the same way  
✅ **Easy maintenance** - Bugs fixed once benefit all tests  
✅ **Type-safe** - Full TypeScript support with proper interfaces  
✅ **Clean code** - Exchange-specific tests are ~160 lines vs ~275 previously

## Test Files

### WebSocket Tests

| File | Exchange | Test Coverage |
|------|----------|---------------|
| `test-binance-ws.ts` | Binance | Spot + Futures + User Data |
| `test-okx-ws.ts` | OKX | Spot + Perpetual + User Data |
| `test-coinbase-ws.ts` | Coinbase | Spot + Perpetual + User Data |

**Features Tested:**
- ✅ Ticker (24hr price stats)
- ✅ OrderBook (bids/asks)
- ✅ Trades (recent trades)
- ✅ Klines (OHLCV candles)
- ✅ User Data (orders, balance, positions) - requires credentials

**Auto-Exit:** Tests automatically exit when all data types are received or after timeout.

### REST API Tests

| File | Exchange | Test Coverage |
|------|----------|---------------|
| `test-binance-rest.ts` | Binance | Market Data + Account Data |
| `test-okx-rest.ts` | OKX | Market Data + Account Data |
| `test-coinbase-rest.ts` | Coinbase | Market Data + Account Data |

**Features Tested:**
- ✅ getTicker
- ✅ getOrderBook
- ✅ getTrades
- ✅ getKlines
- ✅ getAccountInfo (requires credentials)
- ✅ getBalances (requires credentials)
- ✅ getOpenOrders (requires credentials)
- ✅ getOrderHistory (requires credentials)

**Known Limitations:**
- **Coinbase**: Requires authentication for all endpoints (including public market data)

### Base Classes

| File | Purpose |
|------|---------|
| `BaseExchangeTest.ts` | Abstract base class for WebSocket tests |
| `BaseRESTTest.ts` | Abstract base class for REST API tests |

## Running Tests

### Prerequisites

```bash
# Create .env file in apps/console with credentials
cp env.template .env

# Edit .env and add your API credentials
# BINANCE_API_KEY=...
# BINANCE_SECRET_KEY=...
# OKX_API_KEY=...
# OKX_SECRET_KEY=...
# OKX_PASSPHRASE=...
# COINBASE_API_KEY=...
# COINBASE_SECRET_KEY=...
```

### Individual Tests

```bash
# WebSocket Tests
npm run test:binance        # Test Binance WebSocket
npm run test:okx            # Test OKX WebSocket
npm run test:coinbase       # Test Coinbase WebSocket

# REST API Tests
npm run test:binance-rest   # Test Binance REST API
npm run test:okx-rest       # Test OKX REST API
npm run test:coinbase-rest  # Test Coinbase REST API
```

### Batch Tests

```bash
# All WebSocket Tests
npm run test:all-ws

# All REST API Tests
npm run test:all-rest

# All Tests (WS + REST)
npm run test:all-exchanges
```

### Direct Execution

```bash
# Using tsx (recommended)
npx tsx src/tests/test-binance-ws.ts
npx tsx src/tests/test-binance-rest.ts

# From apps/console directory
cd apps/console
npm run test:binance
```

## Test Output

### WebSocket Test Example

```
🧪 Starting Binance WebSocket Test

Testing: Spot + Futures + User Data
Symbols: BTC/USDT (spot), BTC/USDT:USDT (futures)

✅ Connected to Binance (with credentials)

🟢 ===== SUBSCRIBING TO SPOT MARKET DATA =====
🔵 ===== SUBSCRIBING TO FUTURES MARKET DATA =====
📡 Subscribed to all market data channels

👤 ===== SUBSCRIBING TO USER DATA =====
📡 Subscribed to user data (orders, balance, positions)

📊 [TICKER] BTC/USDT: $95234.56
📚 [ORDERBOOK] BTC/USDT: Bid $95234.50, Ask $95234.60
💱 [TRADE] BTC/USDT: BUY $95234.55
📈 [KLINE] BTC/USDT: O:$95200.00 C:$95234.56

... (more data) ...

============================================================
📊 TEST RESULTS SUMMARY
============================================================

🟢 SPOT:
  Ticker:    ✅ PASS
  OrderBook: ✅ PASS
  Trades:    ✅ PASS
  Klines:    ✅ PASS

🔵 FUTURES/PERPETUAL:
  Ticker:    ✅ PASS
  OrderBook: ✅ PASS
  Trades:    ✅ PASS
  Klines:    ✅ PASS

👤 USER DATA:
  Orders:    ✅ PASS
  Balance:   ✅ PASS
  Positions: ✅ PASS

============================================================
⏱️  Duration: 12.5s
📈 Overall: 11/11 tests passed
============================================================

🎉 ALL TESTS PASSED! Binance WebSocket working perfectly!
```

### REST API Test Example

```
🧪 Starting Binance REST API Test

Testing: Market Data + Account Data

✅ Connected to Binance (with credentials)

═══════════════════════════════════════════
📈 TESTING MARKET DATA ENDPOINTS
═══════════════════════════════════════════

📊 Testing getTicker for BTC/USDT...
  ✅ Price: $95234.56

📚 Testing getOrderBook for BTC/USDT...
  ✅ Bids: 100, Asks: 100

💱 Testing getTrades for BTC/USDT...
  ✅ Received 500 trades

📈 Testing getKlines for BTC/USDT...
  ✅ Received 100 klines

═══════════════════════════════════════════
👤 TESTING ACCOUNT DATA ENDPOINTS
═══════════════════════════════════════════

👤 Testing getAccountInfo...
  ✅ Account info retrieved

💰 Testing getBalances...
  ✅ Received 15 balances

📋 Testing getOpenOrders...
  ✅ Received 3 open orders

📜 Testing getOrderHistory for BTC/USDT...
  ✅ Received 25 orders in history

============================================================
📊 REST API TEST RESULTS
============================================================

📈 MARKET DATA:
  Ticker:    ✅ PASS
  OrderBook: ✅ PASS
  Trades:    ✅ PASS
  Klines:    ✅ PASS

👤 ACCOUNT DATA:
  Account:   ✅ PASS
  Balances:  ✅ PASS
  Open Orders: ✅ PASS
  Order History: ✅ PASS

============================================================
⏱️  Duration: 1.2s
📈 Overall: 8/8 tests passed
============================================================

🎉 ALL TESTS PASSED! Binance REST API working perfectly!
```

## Test Behavior

### Auto-Exit (WebSocket Tests)

WebSocket tests automatically exit when:
1. ✅ **All tests pass** - All data types received for spot, futures, and user data
2. ⏰ **Timeout reached** - Maximum wait time exceeded (60s for Binance/OKX, 30s for Coinbase)

### Manual Exit

Press `Ctrl+C` to stop any test manually.

## Credentials

### Required Permissions

**Binance:**
- ✅ Enable Reading
- ✅ Enable Spot & Margin Trading
- ✅ IP Whitelist (if configured)

**OKX:**
- ✅ Read permission
- ✅ Trade permission (for user data)
- ✅ IP Whitelist (if configured)
- ✅ Passphrase configured

**Coinbase:**
- ✅ View permission
- ✅ Trade permission (for user data)
- ✅ API Key and Secret configured

### Without Credentials

Tests will still run and test public market data:
- ✅ Ticker, OrderBook, Trades, Klines work without credentials
- ⏭️ User data tests skipped
- ✅ Summary shows which tests were skipped

## Troubleshooting

### WebSocket Connection Issues

```
Error: WebSocket connection failed
```

**Solutions:**
1. Check internet connection
2. Verify firewall/proxy settings
3. Check exchange status page
4. Try different network

### Authentication Errors

```
401 Unauthorized
Invalid API-key, IP, or permissions
```

**Solutions:**
1. Verify API key and secret in `.env`
2. Check IP whitelist on exchange
3. Verify API key permissions
4. Check if API key is enabled

### No User Data Received

```
USER DATA:
  Orders:    ❌ FAIL
  Balance:   ❌ FAIL
  Positions: ❌ FAIL
```

**Possible Reasons:**
1. No account activity during test window
2. API key missing user data permissions
3. User data stream not properly initialized
4. IP not whitelisted for private endpoints

**Solutions:**
1. Verify API key has correct permissions
2. Check IP whitelist
3. Run test for longer duration
4. Place a test order to trigger user data events

### Test Hangs

```
Test runs but never exits
```

**Solutions:**
1. Press `Ctrl+C` to stop
2. Check if WebSocket connection is established
3. Verify exchange is sending data
4. Check for network issues

## Extending Tests

### Adding a New Exchange

1. **Create WebSocket test:**
```typescript
// test-newexchange-ws.ts
import { NewExchange } from '@itrade/exchange-connectors';
import { BaseExchangeTest, type ExchangeCredentials } from './BaseExchangeTest';

class NewExchangeWebSocketTest extends BaseExchangeTest {
  constructor() {
    super('NewExchange', 60);
  }

  protected getCredentials(): ExchangeCredentials | null {
    // Load from env
  }

  protected setupEventListeners(exchange: IExchange): void {
    // Setup event handlers
  }

  protected async subscribeToMarketData(...): Promise<void> {
    // Subscribe to channels
  }

  async run(): Promise<void> {
    // Orchestrate test
  }
}

const test = new NewExchangeWebSocketTest();
test.run();
```

2. **Create REST test:**
```typescript
// test-newexchange-rest.ts
import { NewExchange } from '@itrade/exchange-connectors';
import { BaseRESTTest, type ExchangeCredentials } from './BaseRESTTest';

class NewExchangeRESTTest extends BaseRESTTest {
  constructor() {
    super('NewExchange');
  }

  protected getCredentials(): ExchangeCredentials | null {
    // Load from env
  }

  protected async testMarketData(...): Promise<void> {
    // Test market endpoints
  }

  protected async testAccountData(exchange: IExchange): Promise<void> {
    // Test account endpoints
  }

  async run(): Promise<void> {
    // Orchestrate test
  }
}

const test = new NewExchangeRESTTest();
test.run();
```

3. **Add npm scripts to `package.json`:**
```json
{
  "scripts": {
    "test:newexchange": "tsx src/tests/test-newexchange-ws.ts",
    "test:newexchange-rest": "tsx src/tests/test-newexchange-rest.ts"
  }
}
```

## Implementation Details

### BaseExchangeTest Structure

```typescript
abstract class BaseExchangeTest {
  // Properties
  protected logger: ConsoleLogger;
  protected results: TestMetrics;
  protected startTime: number;
  protected maxTimeout: number;
  
  // Abstract methods (must implement)
  protected abstract getCredentials(): ExchangeCredentials | null;
  protected abstract setupEventListeners(exchange: IExchange): void;
  protected abstract subscribeToMarketData(...): Promise<void>;
  abstract run(): Promise<void>;
  
  // Concrete methods (provided)
  protected initializeResults(): TestMetrics;
  protected hasCredentials(): boolean;
  protected checkAllTestsPassed(): boolean;
  protected startCheckInterval(): void;
  protected startMaxTimeout(): void;
  protected printSummaryAndExit(): void;
  protected cleanup(exchange: IExchange, exitCode: number): void;
}
```

### Test Metrics Structure

```typescript
interface TestMetrics {
  spot: {
    ticker: boolean;
    orderbook: boolean;
    trades: boolean;
    klines: boolean;
  };
  futures: {
    ticker: boolean;
    orderbook: boolean;
    trades: boolean;
    klines: boolean;
  };
  userData: {
    orders: boolean;
    balance: boolean;
    positions: boolean;
  };
}
```

## Files Reference

```
apps/console/src/tests/
├── BaseExchangeTest.ts          # Base class for WebSocket tests
├── BaseRESTTest.ts              # Base class for REST API tests
├── test-binance-ws.ts           # Binance WebSocket test
├── test-binance-rest.ts         # Binance REST API test
├── test-okx-ws.ts               # OKX WebSocket test
├── test-okx-rest.ts             # OKX REST API test
├── test-coinbase-ws.ts          # Coinbase WebSocket test
├── test-coinbase-rest.ts        # Coinbase REST API test
├── README.md                    # This file
├── QUICK_REFERENCE.md           # Quick command reference
└── TEST_SUITE_SUMMARY.md        # Detailed test suite documentation
```

## Related Documentation

- [Quick Reference](./QUICK_REFERENCE.md) - Fast command lookup
- [Test Suite Summary](./TEST_SUITE_SUMMARY.md) - Comprehensive documentation
- [Exchange Connectors](../../../../packages/exchange-connectors/README.md) - Connector documentation

---

Author: xiaoweihsueh@gmail.com  
Date: October 24, 2025
