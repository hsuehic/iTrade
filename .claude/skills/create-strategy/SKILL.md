---
name: create-strategy
description: >
  Create a new trading strategy in the iTrade monorepo (packages/strategies).
  Use this skill whenever the user wants to add, implement, or scaffold a new
  strategy class, extend an existing strategy into a new variant, or asks how
  to register a strategy. Triggers on phrases like "create a new strategy",
  "add a strategy", "implement XxxStrategy", "new grid/market-maker/momentum
  strategy", or any mention of strategy + create/implement/register. Covers
  the full checklist: strategy class, registry registration, parameter
  definitions, order lifecycle edge cases, restart recovery, tests, and
  mandatory verification.
---

# Create a New iTrade Strategy

Strategies are event-driven state machines: they receive market/account data
via `analyze(dataUpdate)` and return **signals** (place/cancel order requests).
They never call exchanges directly. The engine executes signals and feeds
order updates back into `analyze`. Reference implementations, from simplest to
most complete: `SpreadGridStrategy`, `MarketMakerGridStrategy` (best example of
restart recovery + partial-fill handling), `HammerChannelStrategy` (kline based).

## Files to touch (checklist)

```
- [ ] packages/strategies/src/strategies/{Name}Strategy.ts
      (Parameters interface + RegistryConfig + class)
- [ ] packages/strategies/src/registry/strategy-factory.ts
      (import, add to StrategyTypeKey union, registry.register(...))
- [ ] packages/strategies/src/index.ts (export class + parameters type)
- [ ] packages/strategies/src/__tests__/{Name}Strategy.test.ts
- [ ] apps/web/components/chatbot/strategy-proposal-card.tsx
      (add entry to STRATEGY_LABELS - display name only)
```

No database change is needed: strategy types are strings, not a DB enum.

## Class anatomy

Extend `BaseStrategy<TParams>` from `@itrade/core`:

```ts
export class MyStrategy extends BaseStrategy<MyParameters> {
  constructor(config: StrategyConfig<MyParameters>) {
    super({ ...config, logger: silentLogger }); // always silentLogger
    // parse/validate parameters; throw Error on invalid config (fail fast)
  }
  public override async processInitialData(d: InitialDataResult) {...}
  public override async analyze(d: DataUpdate) {...}   // the core loop
  public override async onOrderCreated(order: Order) {...}
  protected async onCleanup() {...}                    // reset ALL state
  public getStrategyState() {...}                      // monitoring snapshot
  public override getSubscriptionConfig() {...}        // realtime subs
  public override getInitialDataConfig() {...}         // startup fetches
}
```

Key facts:

- All numeric values are `Decimal` (decimal.js). Never use JS floats for
  prices/quantities. Use `.eq/.gt/.lte`, `Decimal.min/max`.
- `analyze` returns one result or an array: `{action:'buy'|'sell'|'cancel'|'hold', ...}`.
  Return `{ action: 'hold' }` when there is nothing to do.
- UI parameters support only scalars (`number`/`string`/`boolean`). Encode
  arrays as comma-separated strings (e.g. `levelGapsPercent: '1,5,25'`) and
  parse in the constructor.
- `clientOrderId` format is fixed: `E{strategyId}D{seq}D{ts}` (entry),
  `T...` (take-profit), `S...` (stop). Generate with
  `this.generateClientOrderId(SignalType.X)`. Ownership recovery matcher:
  `/^(E|T|S)(\d+)D/` where group 2 === strategyId.

## Registry config

Define a `{Name}StrategyRegistryConfig: StrategyRegistryConfig<TParams>` next
to the class: `type`, `name`, `description`, `category`
('trend'|'momentum'|'volatility'|'custom'), `defaultParameters`,
`parameterDefinitions` (with `group`/`order`/`min`/`max`/`unit` for the UI),
`subscriptionRequirements`, `initialDataRequirements`, `documentation`.
Then register it in `strategy-factory.ts`. The web UI, API
(`/api/strategies/config`), and backtester pick it up automatically.

## Order lifecycle edge cases (MANDATORY - most bugs live here)

Track per-order state in maps keyed by clientOrderId:
`orders` (last Order), `orderMetadataMap` (signal intent),
`pendingClientOrderIds` (in-flight, not yet exchange-confirmed),
`processedQuantityMap` (executed qty already booked),
`processedFillIds` (FILLED events already handled).

1. **Fills-only position tracking.** Position/inventory changes ONLY on
   fills, never when orders are placed. Bootstrap from
   `initialData.strategyNetPosition` (SQL, fills-only).

2. **Incremental fill booking.** Book `executedQuantity - processedQuantityMap
.get(id)` and update the map. This makes duplicate/replayed updates
   idempotent and handles PARTIALLY_FILLED sequences (300 -> 700 -> 1000).

3. **Partial fills accumulate; act on completion.** Sum partials into
   inventory with a volume-weighted average entry price. Place the TP once,
   for the total, when the entry reaches FILLED - not per partial fill.

4. **Terminal statuses can carry fills.** A CANCELED/EXPIRED/REJECTED update
   may include a final `executedQuantity` you never saw as PARTIALLY_FILLED.
   Run incremental fill booking on terminal statuses too, and take-profit the
   executed portion of a canceled entry.

5. **Stale/out-of-order updates.** Ignore an update if its `updateTime` is
   older than the stored one AND it is not a progress update (higher status
   rank NEW < PARTIALLY_FILLED < FILLED < terminal, or larger executed qty).

6. **Duplicate order prevention.** One tracked slot per order role (e.g. one
   entry per level). Register orders as in-flight (with quantity + price in
   metadata) at signal-generation time, so risk checks count orders the
   exchange has not acknowledged yet. When refreshing, compare the desired
   price against the confirmed order OR the in-flight metadata price to avoid
   cancel/replace churn.

7. **Worst-case risk checks.** Before placing, assume ALL open + in-flight
   orders fill: `position + pendingRemaining + newQty <= max`. Never check
   position alone.

8. **Cancel by clientOrderId.** `StrategyCancelOrderResult.orderId` is
   optional - for in-flight orders without an exchange id, cancel with
   clientOrderId only.

9. **Orderbook staleness via wall clock.** Record `Date.now()` when an
   orderbook arrives and compare against that. Never use
   `orderbook.timestamp` for staleness - in backtests it is historical bar
   time and would always look stale.

10. **Klines: closed only, dedupe, match.** Process only `isClosed !== false`
    klines, verify `symbol` and `interval` match, and dedupe by `openTime`
    (a kline can be delivered more than once).

## Restart / crash recovery (processInitialData)

The console can die at any moment. On startup:

1. Bootstrap position from `strategyNetPosition` (fills survive downtime).
2. Filter `openOrders` to owned ones (strategyId match OR clientOrderId
   pattern match). For each: rebuild metadata
   (`ensureRecoveredMetadata`), seed `processedQuantityMap` with
   `executedQuantity` so pre-restart partials are not re-booked.
3. Decide adopt vs cancel: keep orders that are still valid regardless of
   market state (e.g. take-profits); cancel and re-place signal-dependent
   orders (e.g. entries) so they get fresh prices. Canceling avoids duplicate
   entries - never re-place without canceling first.
4. **Uncovered inventory**: if recovered position exceeds what open TP orders
   would sell, place a recovery TP for the excess - but treat exchange
   position data as authoritative: clamp the TP to the position's sellable
   quantity and DROP inventory not backed by a position (it was closed
   externally; selling it would open a short). Cost basis in order: position
   avgPrice -> latest recovered entry order price -> current ask (only when
   no position data was fetched).
5. **Budget accounting**: capital deployed in adopted orders must reduce the
   budget available for new orders, or a restart can double the exposure.
6. Add a self-heal pass in `analyze`: any inventory without a working TP (and
   no entry in progress) gets its TP re-placed on the next fresh orderbook.
7. If historical klines are fetched at startup, evaluate the last closed one
   immediately instead of waiting up to a full interval.

## Sizing and leverage

Project convention (MarketMakerGridStrategy): `maxInvestment` is capital;
buying power = `maxInvestment * leverage`; quantity = notional / limit price.
Pass `leverage` and `tradeMode` on every order signal. Inventory caps are in
base units and must include open + in-flight BUY remainders.

## Tests (write them WITH the implementation - they catch real bugs)

Use vitest, mirror `MarketMakerGridStrategy.test.ts` helpers
(`createOrder`, `createOrderBook`, `createKline`, `normalizeAnalyzeResult`).
Minimum scenarios:

```
- [ ] signal triggers -> expected orders (prices, quantities, metadata)
- [ ] signal absent -> no orders / cancels of stale orders
- [ ] entry fill -> exit order placed (price formula verified)
- [ ] partial fill -> accumulate; canceled-with-partial -> exit for executed part
- [ ] cancel ack carrying executedQuantity -> fill still booked
- [ ] risk cap enforced (clamped/skipped orders)
- [ ] restart: processInitialData with open orders + net position
- [ ] invalid parameters -> constructor throws
```

## Mandatory verification (per workspace rules)

```bash
cd packages/strategies
pnpm test          # FULL suite must pass, not just the new file
pnpm lint --fix && pnpm typecheck && pnpm build
cd ../../apps/web && pnpm typecheck && pnpm build
cd ../console && pnpm typecheck
# Runtime smoke test of the built registry:
node -e "const s=require('./packages/strategies/dist/index.js');
console.log(s.isValidStrategyType('MyStrategy'));
s.createStrategyInstance('MyStrategy',{symbol:'ETH/USDC:USDC',exchange:'binance'},1,'t');"
```

Do not commit; report results and wait for user review.

---

Author: xiaoweihsueh@gmail.com
Date: August 5, 2026
