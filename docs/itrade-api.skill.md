---
name: itrade-api
description: Guide for AI agents on how to authenticate and call the iTrade REST API using API tokens. Covers bearer token auth, all available endpoints grouped by permission scope (read, write, settings), request/response shapes, and practical curl examples.
---

# iTrade API — Agent Guide

## Overview

iTrade exposes a REST API that can be called programmatically using **API tokens** (bearer tokens). This guide tells you everything you need to call the API as an AI agent.

---

## Base URLs

| Environment            | URL                         |
| ---------------------- | --------------------------- |
| Production (primary)   | `https://xtrde.com`         |
| Production (alternate) | `https://itrade.ihsueh.com` |

All endpoints are relative to the base URL, e.g. `https://xtrde.com/api/orders`.

---

## Authentication

All API calls require a bearer token in the `Authorization` header:

```
Authorization: Bearer itrade_<your-token>
```

Tokens are prefixed with `itrade_`. A user creates tokens in **Settings → API Tokens**.

### Example (curl)

```bash
curl -s https://xtrde.com/api/orders \
  -H "Authorization: Bearer itrade_HIibedLv..."
```

### Error responses

| Status                  | Meaning                                   |
| ----------------------- | ----------------------------------------- |
| `401 Unauthorized`      | Token missing, invalid, or revoked        |
| `403 Forbidden`         | Token valid but lacks required permission |
| `429 Too Many Requests` | Rate limit exceeded                       |

---

## Permission Scopes

Each token carries a permissions map. The three scopes are:

| Scope      | Resources                                                                | What it unlocks                        |
| ---------- | ------------------------------------------------------------------------ | -------------------------------------- |
| `read`     | `portfolio`, `orders`, `strategies`, `backtests`, `tickers`, `analytics` | All GET endpoints for that resource    |
| `write`    | `orders`, `strategies`, `backtests`                                      | POST / PUT / DELETE mutation endpoints |
| `settings` | `profile`, `preferences`                                                 | GET and PUT on user settings           |

A token may have a subset of resources within each scope, e.g. `read: ["portfolio", "orders"]` only.

---

## Endpoints

### Read endpoints

These require a token with the matching `read` resource.

#### Portfolio

```
GET /api/portfolio/assets
```

Returns a list of portfolio assets (symbol, quantity, average cost, current value).

```
GET /api/portfolio/positions
```

Returns open positions with unrealised P&L.

#### Orders

```
GET /api/orders
```

Query params: `status` (open|filled|cancelled), `symbol`, `limit`, `offset`.

```
GET /api/orders/:id
```

Returns a single order by ID.

#### Strategies

```
GET /api/strategies
```

Returns all saved strategies.

```
GET /api/strategies/:id
```

Returns a single strategy.

```
GET /api/strategies/config
```

Returns the strategy engine configuration (available indicators, parameters).

#### Backtests

```
GET /api/backtest
```

Returns all backtest runs for the authenticated user.

```
GET /api/backtest/:id
```

Returns details for a single backtest run.

```
GET /api/backtest/results
```

Returns aggregated result metrics across backtest runs.

#### Market data

```
GET /api/tickers
```

Returns real-time ticker data (price, volume, funding rate for perps).

```
GET /api/trading-pairs
```

Returns available trading pairs per exchange.

#### Analytics

```
GET /api/analytics
```

Returns portfolio analytics: Sharpe ratio, drawdown, win rate, etc.

#### Exchange accounts

```
GET /api/accounts
```

Returns connected exchange accounts (exchange name, status, balances).

---

### Write endpoints

These require a token with the matching `write` resource.

#### Orders

```
POST /api/orders
Content-Type: application/json

{
  "symbol": "BTC/USDT",
  "side": "buy",
  "type": "limit",
  "quantity": 0.01,
  "price": 60000,
  "exchangeAccountId": "<id>"
}
```

Creates a new order. Returns the created order object with `id`.

```
DELETE /api/orders/:id
```

Cancels an open order. Returns `204 No Content` on success.

#### Strategies

```
POST /api/strategies
Content-Type: application/json

{
  "name": "My Strategy",
  "type": "MovingAverage",
  "config": { ... }
}
```

Creates a new strategy.

```
PUT /api/strategies/:id
Content-Type: application/json

{ "name": "Updated name", "config": { ... } }
```

Updates an existing strategy.

```
DELETE /api/strategies/:id
```

Deletes a strategy.

#### Backtests

```
POST /api/backtest
Content-Type: application/json

{
  "strategyId": "<id>",
  "symbol": "BTC/USDT",
  "startDate": "2024-01-01",
  "endDate": "2024-06-01",
  "initialCapital": 10000
}
```

Starts a new backtest run. Returns a run object with `id` and `status`.

```
DELETE /api/backtest/:id
```

Deletes a backtest run and its results.

#### Dry-run

```
POST /api/dry-run
Content-Type: application/json

{
  "strategyId": "<id>",
  "symbol": "BTC/USDT",
  "exchangeAccountId": "<id>"
}
```

Executes a strategy in simulation mode without placing real orders.

---

### Settings endpoints

These require a token with the matching `settings` resource.

#### Profile

```
GET /api/settings/profile
```

Returns the user's profile (name, email, avatar).

```
PUT /api/settings/profile
Content-Type: application/json

{ "name": "Alice", "image": "https://..." }
```

Updates the user's display name and avatar URL.

#### Preferences

```
GET /api/settings/email-preferences
```

Returns email notification preferences.

```
PUT /api/settings/email-preferences
Content-Type: application/json

{
  "tradingAlerts": true,
  "priceAlerts": false,
  "orderUpdates": true
}
```

Updates email notification preferences.

#### Other

```
POST /api/settings/change-password
Content-Type: application/json

{ "currentPassword": "...", "newPassword": "..." }
```

Changes the user's password.

```
GET /api/config
```

Returns app-level configuration (supported exchanges, feature flags).

---

## Practical examples

### List open orders

```bash
curl -s "https://xtrde.com/api/orders?status=open" \
  -H "Authorization: Bearer itrade_<token>"
```

### Get portfolio summary then place an order

```bash
# 1. Check current portfolio
curl -s https://xtrde.com/api/portfolio/assets \
  -H "Authorization: Bearer itrade_<token>"

# 2. Place a limit buy
curl -s -X POST https://xtrde.com/api/orders \
  -H "Authorization: Bearer itrade_<token>" \
  -H "Content-Type: application/json" \
  -d '{"symbol":"ETH/USDT","side":"buy","type":"limit","quantity":0.1,"price":3000,"exchangeAccountId":"<id>"}'
```

### Start a backtest

```bash
curl -s -X POST https://xtrde.com/api/backtest \
  -H "Authorization: Bearer itrade_<token>" \
  -H "Content-Type: application/json" \
  -d '{
    "strategyId": "<id>",
    "symbol": "BTC/USDT",
    "startDate": "2024-01-01",
    "endDate": "2024-12-31",
    "initialCapital": 10000
  }'
```

---

## IP whitelisting

A token may have an IP whitelist. If the token has `allowedIps` configured, requests from IPs not in the list return `401 Unauthorized`. Ensure the agent's outbound IP is whitelisted when creating the token.

---

## Notes for agents

- Always check the HTTP status code before parsing the response body.
- Token secrets are shown **only once** at creation time. If lost, revoke and create a new token.
- Pagination uses `limit` and `offset` query params on list endpoints.
- Date fields are ISO 8601 strings in UTC (e.g. `"2024-06-01T00:00:00.000Z"`).
- All amounts are strings to preserve precision (e.g. `"0.01"` not `0.01`).
