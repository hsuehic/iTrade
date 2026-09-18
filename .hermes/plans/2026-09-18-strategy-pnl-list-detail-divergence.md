# Fix: strategy list vs detail PnL divergence (partial-fill-then-canceled orders)

## Problem

On `/strategy` (list) and `/strategy/<id>` (detail) the same strategy shows two
different PnL values. Live example, strategy 592 (ZEC/USDC:USDC, binance perpetual):

| Captured | Detail page | List page | Diff  |
| -------- | ----------- | --------- | ----- |
| t0       | 1002.30     | 973.42    | 28.88 |
| t1       | 1011.01     | 977.15    | 33.86 |

## Root cause (confirmed by replaying production orders)

The two pages compute PnL through **two independent implementations** that
disagree on how to treat an order that **partially filled and was then canceled**
(status `CANCELED` with `executedQuantity > 0`).

Production evidence — strategy 592 has exactly two such orders:

```
2385558113  BUY  CANCELED  executedQuantity=2.3290  price=1465.39
2387247309  BUY  CANCELED  executedQuantity=1.9630  price=1479.80
```

The two implementations:

| Path   | Function                                     | Filter                                           | Net effect                     |
| ------ | -------------------------------------------- | ------------------------------------------------ | ------------------------------ |
| Detail | `PnLRepository.rebuildStrategyPerformance()` | **none** — books any order with `quantity.gt(0)` | counts the 2 canceled fills    |
| List   | `PnLRepository.calculatePnLFromOrders()`     | `if (order.status !== 'FILLED') continue;`       | **skips** the 2 canceled fills |

Replaying the real order set through both algorithms:

```
detail algo (status ignored) : realized=1011.01  position=5.000
list   algo (FILLED only)    : realized= 977.15  position=0.708
```

Both targets reproduced exactly. Note the list path is wrong on **two** figures:
realized PnL is understated AND the derived open position is understated
(0.708 vs 5.0), because the canceled-but-filled quantity is invisible to it.

The detail page is the correct one: those quantities genuinely hit the account
position (proven by the subsequent `SELL 2.329 @ 1469.79` which only exists
because the 2.329 was held).

## Fix

Align the list path to the detail path's semantics: key off **actual executed
quantity** rather than the terminal status. `calculatePnLFromOrders` already has
an `executedQty === 0` guard which alone is sufficient to exclude orders that
never traded.

### Change 1 — `packages/data-manager/src/repositories/PnLRepository.ts`

In `calculatePnLFromOrders()`, drop the status pre-filter.

```ts
// before
for (const order of sortedOrders) {
  if (order.status !== 'FILLED') continue;
  const executedQty = parseFloat(order.executedQuantity?.toString() || '0');

// after
for (const order of sortedOrders) {
  // NOTE: do NOT filter on status === 'FILLED'. An order can carry a non-zero
  // executedQuantity while in a non-FILLED terminal state (CANCELED after a
  // partial fill). Those quantities are real position changes and must be
  // booked. Matches rebuildStrategyPerformance(), which is the source of truth
  // for the strategy detail page. See plan
  // 2026-09-18-strategy-pnl-list-detail-divergence.md.
  const executedQty = parseFloat(order.executedQuantity?.toString() || '0');
```

The existing `if (executedQty === 0 || avgPrice === 0) continue;` stays and is
what excludes never-traded orders (NEW / zero-fill CANCELED).

### Change 2 — regression test

Add a case asserting that a CANCELED order with `executedQuantity > 0` is booked
into realized PnL and into the position, and that
`calculatePnLFromOrders` and `rebuildStrategyPerformance` agree on the same
order set.

## Out of scope (recommend separate ticket)

1. **Write-side normalization (root of the data shape).** The console's cancel
   path persists `executedQuantity` while leaving status `CANCELED`, so every
   downstream consumer must remember to special-case it. Normalizing on write
   (split the filled part into its own FILLED record, or use a terminal status
   that carries its fill) removes the whole bug class.
2. **`totalCost` residual on position flip.** In the same function the
   close-and-flip branches re-derive `totalCost` from the _pre-flip_ position
   size; on a flip the basis is not reset cleanly. Not triggered by 592's data
   but reachable for other strategies.

## Verification

- Replay strategy 592's production orders (124 rows) through both functions and
  assert identical realized PnL and identical open position.
- `pnpm --filter @itrade/data-manager exec vitest run` + typecheck + lint.
- Post-deploy: `/strategy` list and `/strategy/592` show the same value.
