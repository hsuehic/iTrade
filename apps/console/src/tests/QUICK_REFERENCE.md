# Test Suite Quick Reference

Fast command lookup for running exchange tests.

## 🚀 Quick Start

```bash
# From project root
cd apps/console

# WebSocket Tests
npm run test:binance
npm run test:okx
npm run test:coinbase

# REST API Tests
npm run test:binance-rest
npm run test:okx-rest
npm run test:coinbase-rest
```

## 📋 All Commands

### Individual WebSocket Tests

```bash
npm run test:binance        # Binance WS (spot + futures + user data)
npm run test:okx            # OKX WS (spot + perpetual + user data)
npm run test:coinbase       # Coinbase WS (spot + perpetual + user data)
```

### Individual REST API Tests

```bash
npm run test:binance-rest   # Binance REST (market + account data)
npm run test:okx-rest       # OKX REST (market + account data)
npm run test:coinbase-rest  # Coinbase REST (market + account data)
```

### Batch Tests

```bash
npm run test:all-ws         # All WebSocket tests
npm run test:all-rest       # All REST API tests
npm run test:all-exchanges  # Everything (WS + REST)
```

### Direct Execution

```bash
# Using tsx (from apps/console)
npx tsx src/tests/test-binance-ws.ts
npx tsx src/tests/test-binance-rest.ts
npx tsx src/tests/test-okx-ws.ts
npx tsx src/tests/test-okx-rest.ts
npx tsx src/tests/test-coinbase-ws.ts
npx tsx src/tests/test-coinbase-rest.ts
```

## 🔑 Credentials Setup

```bash
# Copy template
cp env.template .env

# Edit .env
nano .env  # or your editor

# Required variables:
BINANCE_API_KEY=...
BINANCE_SECRET_KEY=...
OKX_API_KEY=...
OKX_SECRET_KEY=...
OKX_PASSPHRASE=...
COINBASE_API_KEY=...
COINBASE_SECRET_KEY=...
```

## ✅ What Gets Tested

### WebSocket Tests

| Feature | Binance | OKX | Coinbase |
|---------|---------|-----|----------|
| **Spot Ticker** | ✅ | ✅ | ✅ |
| **Spot OrderBook** | ✅ | ✅ | ✅ |
| **Spot Trades** | ✅ | ✅ | ✅ |
| **Spot Klines** | ✅ | ✅ | ✅ |
| **Futures Ticker** | ✅ | ✅ | ✅ |
| **Futures OrderBook** | ✅ | ✅ | ✅ |
| **Futures Trades** | ✅ | ✅ | ✅ |
| **Futures Klines** | ✅ | ✅ | ✅ |
| **User Orders** | ✅* | ✅* | ✅* |
| **User Balance** | ✅* | ✅* | ✅* |
| **User Positions** | ✅* | ✅* | ✅* |

*Requires credentials in `.env`

### REST API Tests

| Feature | Binance | OKX | Coinbase |
|---------|---------|-----|----------|
| **getTicker** | ✅ | ✅ | ⚠️** |
| **getOrderBook** | ✅ | ✅ | ⚠️** |
| **getTrades** | ✅ | ✅ | ⚠️** |
| **getKlines** | ✅ | ✅ | ⚠️** |
| **getAccountInfo** | ✅* | ✅* | ✅* |
| **getBalances** | ✅* | ✅* | ✅* |
| **getOpenOrders** | ✅* | ✅* | ✅* |
| **getOrderHistory** | ✅* | ✅* | ✅* |

*Requires credentials  
**Coinbase requires auth for all endpoints (known limitation)

## ⏱️ Test Duration

| Test Type | Duration | Behavior |
|-----------|----------|----------|
| **WebSocket** | 10-60s | Auto-exits when all data received |
| **REST API** | <2s | Runs once and exits |

## 🎯 Exit Codes

```
0 = All tests passed
1 = Some tests failed or error occurred
```

## 📊 Output Format

### Success

```
============================================================
📊 TEST RESULTS SUMMARY
============================================================
🟢 SPOT:       ✅ PASS (4/4)
🔵 FUTURES:    ✅ PASS (4/4)
👤 USER DATA:  ✅ PASS (3/3)
⏱️  Duration: 12.5s
📈 Overall: 11/11 tests passed
============================================================
🎉 ALL TESTS PASSED!
```

### Partial Success

```
============================================================
🟢 SPOT:       ✅ PASS (4/4)
🔵 FUTURES:    ✅ PASS (4/4)
👤 USER DATA:  ⏭️  SKIPPED (no credentials)
⏱️  Duration: 8.3s
📈 Overall: 8/8 tests passed
============================================================
```

## 🛠️ Troubleshooting

### Test Won't Start

```bash
# Check Node version (>=18)
node --version

# Reinstall dependencies
pnpm install

# Check .env file exists
ls -la .env
```

### Test Hangs

Press `Ctrl+C` to stop, then:

```bash
# Check WebSocket connectivity
curl -I https://stream.binance.com
curl -I https://ws.okx.com
curl -I https://ws-feed.exchange.coinbase.com

# Check credentials
cat .env | grep API_KEY
```

### Authentication Errors

```bash
# Verify credentials format
# Should not have quotes, spaces, or newlines
head .env

# Test REST connectivity
curl -H "X-MBX-APIKEY: YOUR_KEY" https://api.binance.com/api/v3/account
```

## 📚 More Information

- [Full Documentation](./README.md)
- [Test Suite Summary](./TEST_SUITE_SUMMARY.md)
- [Exchange Connectors](../../../../packages/exchange-connectors/README.md)

---

Author: xiaoweihsueh@gmail.com  
Date: October 24, 2025
