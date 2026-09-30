import { describe, it, expect, vi, afterEach } from 'vitest';
import Decimal from 'decimal.js';
import {
  LadderEntrySingleTPStrategy,
  LadderEntrySingleTPParameters,
} from '../strategies/ladder-entry-single-tp';
import {
  StrategyConfig,
  Order,
  OrderSide,
  OrderStatus,
  OrderType,
  TimeInForce,
  OrderBook,
  DataUpdate,
  InitialDataResult,
  StrategyAnalyzeResult,
  StrategyResult,
  StrategyOrderResult,
  SignalType,
  createEmptyPerformance,
} from '@itrade/core';

/**
 * Regression tests for the Strategy 631 restart duplicate-entry defect
 * (2026-10-01, `LadderEntrySingleTPStrategy`, ZEC/USDC:USDC @ Binance,
 * `https://xtrde.com/strategy/631`).
 *
 * Production shape: E631D3 @1414.81 (placed 18:15) could not be re-claimed
 * after the ladder was rebuilt from a new bid0, so it stayed LIVE on the
 * exchange, `hasActiveEntryAfterCleanup` was false, and a second entry E631D2
 * @1397.12 was placed at 18:31 → 12 ZEC of live exposure instead of 6.
 *
 * Scope note: everything here is driven purely by the strategy's OWN state
 * (ladder steps, own order book, own fills). Account/venue position snapshots
 * are deliberately NOT consulted — per the 2026-10-01 decision the strategy is
 * judged only against its own net position.
 */

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function createStrategyConfig(
  params: Partial<LadderEntrySingleTPParameters> = {},
  strategyId = 1,
): StrategyConfig<LadderEntrySingleTPParameters> {
  return {
    type: 'LadderEntrySingleTPStrategy',
    parameters: {
      basePrice: 100,
      ladderSteps: 3,
      stepType: 'arithmetic',
      stepValue: 1,
      qtyType: 'arithmetic',
      qtyPerStep: 0.1,
      qtyStepAdd: 0,
      qtyStepRatio: 1,
      tpType: 'percent',
      tpAbsoluteProfit: 100,
      tpPercent: 2,
      maxInvestment: 100000,
      maxPosition: 100,
      leverage: 10,
      ...params,
    },
    symbol: 'BTC/USDT',
    exchange: 'okx',
    strategyId,
    strategyName: `Strategy ${strategyId} regression`,
    performance: createEmptyPerformance(
      'BTC/USDT',
      'okx',
      strategyId,
      `Strategy ${strategyId} regression`,
    ),
  };
}

function createOrder(
  clientOrderId: string,
  side: OrderSide,
  status: OrderStatus,
  price: number,
  quantity: number,
  executedQty?: number,
  avgPrice?: number,
): Order {
  return {
    id: `order-${clientOrderId}`,
    clientOrderId,
    symbol: 'BTC/USDT',
    exchange: 'okx',
    side,
    type: OrderType.LIMIT,
    status,
    price: new Decimal(price),
    quantity: new Decimal(quantity),
    executedQuantity: new Decimal(
      executedQty ?? (status === OrderStatus.FILLED ? quantity : 0),
    ),
    averagePrice: avgPrice
      ? new Decimal(avgPrice)
      : status === OrderStatus.FILLED
        ? new Decimal(price)
        : undefined,
    timeInForce: TimeInForce.GTC,
    timestamp: new Date(),
    updateTime: new Date(Date.now() + 1),
  };
}

function createOrderBook(mid = 100): OrderBook {
  const midPrice = new Decimal(mid);
  const step = new Decimal(1);
  const tick = new Decimal(0.01);
  const bids: Array<[Decimal, Decimal]> = [];
  const asks: Array<[Decimal, Decimal]> = [];
  for (let i = 0; i < 5; i += 1) {
    bids.push([midPrice.minus(step.mul(i)), new Decimal(1)]);
    asks.push([midPrice.plus(tick).plus(step.mul(i)), new Decimal(1)]);
  }
  return { symbol: 'BTC/USDT', timestamp: new Date(), bids, asks, exchange: 'okx' };
}

function createInitialData(
  overrides: Partial<InitialDataResult> = {},
): InitialDataResult {
  return {
    symbol: 'BTC/USDT',
    exchange: 'okx',
    timestamp: new Date(),
    orderBook: createOrderBook(),
    ...overrides,
  };
}

function createDataUpdate(orders: Order[] = []): DataUpdate {
  return { exchangeName: 'okx', symbol: 'BTC/USDT', orders };
}

function toSignals(result: StrategyAnalyzeResult): StrategyResult[] {
  return Array.isArray(result) ? result : [result];
}

function findEntrySignals(result: StrategyAnalyzeResult): StrategyOrderResult[] {
  return toSignals(result).filter(
    (s): s is StrategyOrderResult =>
      (s.action === 'buy' || s.action === 'sell') &&
      s.metadata?.signalType === SignalType.Entry,
  );
}

function findTpSignals(result: StrategyAnalyzeResult): StrategyOrderResult[] {
  return toSignals(result).filter(
    (s): s is StrategyOrderResult =>
      (s.action === 'buy' || s.action === 'sell') &&
      s.metadata?.signalType === SignalType.TakeProfit,
  );
}

function findCancelSignals(result: StrategyAnalyzeResult) {
  return toSignals(result).filter((s) => s.action === 'cancel');
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ──────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────

describe('LadderEntrySingleTPStrategy — Strategy 631 unclaimed-entry guards', () => {
  it('cancels a second live entry that no ladder step claims (duplicate guard)', async () => {
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
    const claimedId = 'E1D9000001';
    const strayId = 'E1D9000002';

    // Restart with TWO live entries on the exchange: the ladder re-anchors to
    // the first one (step 0) and has no step left for the second — the exact
    // "old entry still live + new ladder" shape of the 631 duplicate. Left
    // alone, the stray entry would run in parallel with the entry the ladder
    // is about to place (or with the claimed one).
    const result = await strategy.processInitialData(
      createInitialData({
        openOrders: [
          createOrder(claimedId, OrderSide.BUY, OrderStatus.NEW, 99, 0.1),
          createOrder(strayId, OrderSide.BUY, OrderStatus.NEW, 105, 0.1),
        ],
      }),
    );

    const cancels = findCancelSignals(result);
    expect(cancels.length).toBe(1);
    expect(cancels[0].clientOrderId).toBe(strayId);
    // The claimed entry survives and no additional entry is placed: exactly
    // ONE live entry remains for this ladder.
    expect(strategy.getStrategyState().steps[0].entryClientOrderId).toBe(claimedId);
    expect(findEntrySignals(result).length).toBe(0);
  });

  it('recognises the production client-order-id shape (strategy 631, E631D*)', async () => {
    // Same shape as the production orders (E<strategyId>D<seq>), so a metadata
    // parser/format change that silently stopped recognising them would fail
    // here instead of silently re-introducing the duplicate entry.
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig({}, 631));
    const claimedId = 'E631D1';
    const strayId = 'E631D3';

    const result = await strategy.processInitialData(
      createInitialData({
        openOrders: [
          createOrder(claimedId, OrderSide.BUY, OrderStatus.NEW, 99, 6),
          createOrder(strayId, OrderSide.BUY, OrderStatus.NEW, 1414.81, 6),
        ],
      }),
    );

    const cancels = findCancelSignals(result);
    expect(cancels.length).toBe(1);
    expect(cancels[0].clientOrderId).toBe(strayId);
  });

  it("never cancels a sibling strategy's live entry (ownership scoping)", async () => {
    // `processInitialData` receives every open order on the SYMBOL
    // (TradingEngine -> exchange.getOpenOrders(symbol)), so an entry belonging
    // to another strategy trading the same symbol must not be swept up by this
    // cleanup: ownership is the strategyId embedded in the clientOrderId.
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig({}, 631));

    const result = await strategy.processInitialData(
      createInitialData({
        openOrders: [
          createOrder('E631D1', OrderSide.BUY, OrderStatus.NEW, 99, 0.1),
          createOrder('E632D1', OrderSide.BUY, OrderStatus.NEW, 105, 0.1),
        ],
      }),
    );

    expect(findCancelSignals(result).length).toBe(0);
  });

  it('does NOT cancel a recovered entry that a ladder step legitimately claims', async () => {
    // Learn the actual ladder step-0 price from a clean instance.
    const reference = new LadderEntrySingleTPStrategy(createStrategyConfig());
    const initResult = await reference.processInitialData(createInitialData());
    const entry = findEntrySignals(initResult)[0];
    const price = entry.price!.toNumber();
    const qty = entry.quantity!.toNumber();

    // Restart: same ladder, same live entry still open on the exchange.
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
    const result = await strategy.processInitialData(
      createInitialData({
        openOrders: [
          createOrder(entry.clientOrderId!, OrderSide.BUY, OrderStatus.NEW, price, qty),
        ],
      }),
    );

    // Cancelling this would turn every restart into cancel+replace churn.
    expect(findCancelSignals(result).length).toBe(0);
    expect(strategy.getStrategyState().steps[0].entryClientOrderId).toBe(
      entry.clientOrderId,
    );
    expect(findEntrySignals(result).length).toBe(0);
  });

  it('cancels the resting remainder of a partially filled unclaimed entry and blocks new entries', async () => {
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
    const claimedId = 'E1D9000003';
    const strayId = 'E1D9000004';

    const result = await strategy.processInitialData(
      createInitialData({
        openOrders: [
          createOrder(claimedId, OrderSide.BUY, OrderStatus.NEW, 99, 0.1),
          // Unclaimed (no step left for it) AND already partly executed: leaving
          // its remainder resting would keep extra live exposure on top of the
          // entry the ladder is about to place.
          createOrder(
            strayId,
            OrderSide.BUY,
            OrderStatus.PARTIALLY_FILLED,
            105,
            0.1,
            0.04,
            105,
          ),
        ],
      }),
    );

    const cancels = findCancelSignals(result);
    expect(cancels.length).toBe(1);
    expect(cancels[0].clientOrderId).toBe(strayId);
    // ...and the ladder must not place anything until the cancel lands.
    expect(findEntrySignals(result).length).toBe(0);
  });

  it('defers placing the next ladder entry while the stray cancel is still unconfirmed', async () => {
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
    const claimedId = 'E1D9000005';
    const strayId = 'E1D9000006';

    const initResult = await strategy.processInitialData(
      createInitialData({
        openOrders: [
          createOrder(claimedId, OrderSide.BUY, OrderStatus.NEW, 99, 0.1),
          createOrder(strayId, OrderSide.BUY, OrderStatus.NEW, 105, 0.1),
        ],
      }),
    );
    const cancels = findCancelSignals(initResult);
    expect(cancels.length).toBe(1);
    expect(cancels[0].clientOrderId).toBe(strayId);

    // Step 0 now fills. Normally that would place step 1 — but the stray's
    // cancel has not been CONFIRMED yet (the stray may still be live at the
    // venue), so placing step 1 here would double this ladder's exposure.
    const fill = createOrder(
      claimedId,
      OrderSide.BUY,
      OrderStatus.FILLED,
      99,
      0.1,
      0.1,
      99,
    );
    const afterFill = await strategy.analyze(createDataUpdate([fill]));

    expect(strategy.getStrategyState().inventoryQty).toBe('0.1');
    expect(findEntrySignals(afterFill).length).toBe(0);
  });

  it('releases the entry block once the stray cancel is confirmed (no permanent stall)', async () => {
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
    const claimedId = 'E1D9000007';
    const strayId = 'E1D9000008';

    const initResult = await strategy.processInitialData(
      createInitialData({
        openOrders: [
          createOrder(claimedId, OrderSide.BUY, OrderStatus.NEW, 99, 0.1),
          createOrder(strayId, OrderSide.BUY, OrderStatus.NEW, 105, 0.1),
        ],
      }),
    );
    expect(findCancelSignals(initResult)[0].clientOrderId).toBe(strayId);

    // The venue confirms the cancel (stray is dead) and step 0 fills.
    const strayCanceled = createOrder(
      strayId,
      OrderSide.BUY,
      OrderStatus.CANCELED,
      105,
      0.1,
      0,
    );
    const fill = createOrder(
      claimedId,
      OrderSide.BUY,
      OrderStatus.FILLED,
      99,
      0.1,
      0.1,
      99,
    );
    const afterConfirm = await strategy.analyze(createDataUpdate([strayCanceled, fill]));

    // The block must be gone: the ladder has to be able to continue, otherwise
    // the strategy would stall forever with inventory and an unmanaged ladder.
    // Exactly one entry (the next ladder step) — a regression that places two
    // would otherwise pass this assertion.
    expect(findEntrySignals(afterConfirm).length).toBe(1);
  });

  it('accounts a fill that raced the stray cancel (no orphan position)', async () => {
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
    const claimedId = 'E1D9000009';
    const strayId = 'E1D9000010';

    await strategy.processInitialData(
      createInitialData({
        openOrders: [
          createOrder(claimedId, OrderSide.BUY, OrderStatus.NEW, 99, 0.1),
          createOrder(strayId, OrderSide.BUY, OrderStatus.NEW, 105, 0.1),
        ],
      }),
    );

    // The stray fills before the cancel lands (status is NOT tracked by any
    // step). Its fill must still be booked and covered by a TP.
    const strayFill = createOrder(
      strayId,
      OrderSide.BUY,
      OrderStatus.FILLED,
      105,
      0.1,
      0.1,
      105,
    );
    const result = await strategy.analyze(createDataUpdate([strayFill]));

    expect(strategy.getStrategyState().inventoryQty).toBe('0.1');
    expect(strategy.getStrategyState().vwap).toBe('105');
    const tp = findTpSignals(result);
    expect(tp.length).toBeGreaterThanOrEqual(1);
    expect(tp[0].quantity!.toString()).toBe('0.1');
  });

  it('books the executed part of a partially filled stray and keeps it TP-covered', async () => {
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
    const claimedId = 'E1D9000031';
    const strayId = 'E1D9000032';
    const openOrders = [
      createOrder(claimedId, OrderSide.BUY, OrderStatus.NEW, 99, 0.1),
      createOrder(strayId, OrderSide.BUY, OrderStatus.PARTIALLY_FILLED, 105, 0.1, 0.04),
    ];

    const init = await strategy.processInitialData(createInitialData({ openOrders }));
    expect(findCancelSignals(init).map((s) => s.clientOrderId)).toEqual([strayId]);
    expect(findEntrySignals(init).length).toBe(0);

    // The executed 0.04 of the stray is real inventory: it is booked by the
    // normal recovery/fill accounting and gets a TP — the cancel only removes
    // the resting remainder. Nothing is left orphan and uncovered.
    const state = strategy.getStrategyState() as unknown as {
      inventoryQty: Decimal;
      tpClientOrderId?: string;
    };
    expect(new Decimal(state.inventoryQty).toString()).toBe('0.04');
    expect(state.tpClientOrderId).toBeTruthy();

    // ... and the CANCELED push carrying that execution keeps it that way.
    const canceled = createOrder(
      strayId,
      OrderSide.BUY,
      OrderStatus.CANCELED,
      105,
      0.1,
      0.04,
    );
    await strategy.analyze(createDataUpdate([canceled]));
    const after = strategy.getStrategyState() as unknown as { inventoryQty: Decimal };
    expect(new Decimal(after.inventoryQty).toString()).toBe('0.04');

    // The cancel is confirmed, so the dead stray must NOT be re-cancelled (the
    // release half of the guard) while the claimed step-0 entry still blocks
    // placement on its own.
    // Advance past the throttle window so this release assertion can actually
    // fail (round 10, opus MINOR-1): inside the window the throttle suppresses
    // the re-cancel whether or not the release works.
    const releaseSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);
    const resumed = await strategy.analyze(createDataUpdate([]));
    releaseSpy.mockRestore();
    expect(findCancelSignals(resumed).map((s) => s.clientOrderId)).not.toContain(strayId);
  });

  it('keeps blocking entry placement across a ladder reset while the stray is still live', async () => {
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
    const claimedId = 'E1D9000033';
    const strayId = 'E1D9000034';
    const openOrders = [
      createOrder(claimedId, OrderSide.BUY, OrderStatus.NEW, 99, 0.1),
      createOrder(strayId, OrderSide.BUY, OrderStatus.NEW, 105, 0.1),
    ];
    const init = await strategy.processInitialData(createInitialData({ openOrders }));
    expect(findCancelSignals(init).map((s) => s.clientOrderId)).toEqual([strayId]);

    // A cycle-boundary reset hands the ended cycle's orders to
    // `previousCycleOrderIds` and clears the throttle maps (`resetLadder` itself does
    // NOT set `_needsReinit`; `checkAndPerformReset`/`handleTpFilled` do). Either
    // way the engine re-fetches the orderbook and re-runs `processInitialData`,
    // which re-reads the venue's open orders. The test then simulates that
    // engine re-fetch by re-running `processInitialData` itself. None of it may place
    // a fresh entry on top of a still-live stray (the exact 631 duplicate).
    (strategy as unknown as { resetLadder: () => void }).resetLadder();

    const afterResetTick = await strategy.analyze(createDataUpdate([]));
    expect(findEntrySignals(afterResetTick).length).toBe(0);

    // Discriminating: `claimedId` is live AND claimed by step 0, so `0 entries`
    // alone would hold even if the stray contributed nothing. Assert the sweep
    // itself reported a stray-blocking pass (it returns true only when a live
    // unclaimed own entry exists) and that the stray — not the claimed sibling —
    // is what gets cancelled.
    const sweepSpy = vi.spyOn(strategy as unknown as any, 'sweepUnclaimedEntries');
    const reinit = await strategy.processInitialData(createInitialData({ openOrders }));
    expect(findEntrySignals(reinit).length).toBe(0);
    expect(sweepSpy.mock.results.some((r) => r.value === true)).toBe(true);
    // The still-live stray is re-detected and re-cancelled right away.
    expect(findCancelSignals(reinit).map((s) => s.clientOrderId)).toEqual([strayId]);
  });

  it('leaves the ordinary ladder cycle untouched (no false unclaimed-entry cancel)', async () => {
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
    const fresh = await strategy.processInitialData(createInitialData({}));
    const entry0 = findEntrySignals(fresh)[0];
    expect(entry0).toBeTruthy();

    // Entry 0 fills → step 1 must be placed within the same pass, with no
    // "unclaimed entry" cancel and no deferral. Covers the ordinary fill
    // progression; the reprice / cancel-and-replace / cap-guard paths cannot trip
    // the sweep either, because every `step.entryClientOrderId = null` site either
    // guards on a status check (releases only already-terminal orders) or is
    // followed by re-assignment inside the same `processInitialData` pass, which
    // runs before the sweep there.
    const filled = createOrder(
      entry0.clientOrderId as string,
      OrderSide.BUY,
      OrderStatus.FILLED,
      100,
      0.1,
      0.1,
    );
    const afterFill = await strategy.analyze(createDataUpdate([filled]));

    expect(findEntrySignals(afterFill).length).toBe(1);
    expect(
      findCancelSignals(afterFill).filter(
        (s) => s.reason === 'ladder_unclaimed_entry_cancel_no_duplicate',
      ),
    ).toEqual([]);
  });

  it('does not assume a stray is dead just because an init snapshot omits it (fail-safe)', async () => {
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
    const claimedId = 'E1D9000041';
    const strayId = 'E1D9000042';
    const openOrders = [
      createOrder(claimedId, OrderSide.BUY, OrderStatus.NEW, 99, 0.1),
      createOrder(strayId, OrderSide.BUY, OrderStatus.NEW, 105, 0.1),
    ];
    const init = await strategy.processInitialData(createInitialData({ openOrders }));
    expect(findCancelSignals(init).map((s) => s.clientOrderId)).toEqual([strayId]);

    // `processInitialData` MERGES the venue snapshot into `this.orders`; an order
    // the venue no longer lists is NOT assumed dead (a fill could have raced the
    // snapshot, and dropping it would lose the position). Asserted directly, so
    // the test discriminates MERGE from REPLACE semantics (with REPLACE the id
    // would be gone and the block would silently disappear).
    const merged = await strategy.processInitialData(
      createInitialData({
        openOrders: [createOrder(claimedId, OrderSide.BUY, OrderStatus.NEW, 99, 0.1)],
      }),
    );
    const orders = (strategy as unknown as { orders: Map<string, Order> }).orders;
    expect(orders.has(strayId)).toBe(true);
    expect(findEntrySignals(merged).length).toBe(0);

    // ... and because the stray is still tracked, it is re-cancelled once the 60s
    // window expires, even though the snapshot did not list it.
    const realNow = Date.now();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(realNow + 61_000);
    const retry = await strategy.analyze(createDataUpdate([]));
    nowSpy.mockRestore();
    expect(findCancelSignals(retry).map((s) => s.clientOrderId)).toEqual([strayId]);
  });

  it('suppresses the stall alert for one retry window after this instance cancelled the entry itself', async () => {
    // The two entry-cancel paths this strategy owns are `cancelAllEntryOrders`
    // (TP-filled cleanup) and the `ladder_reset_interval` reset. Their cancel can
    // still be unconfirmed when the sweep next runs, making the order look
    // "unclaimed". Re-cancelling is idempotent and blocking is correct during a
    // wind-down, but the alarm must not fire (review round 5, opus MAJOR A).
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const id = 'E1D9000071';
    await strategy.processInitialData(
      createInitialData({
        openOrders: [createOrder(id, OrderSide.BUY, OrderStatus.NEW, 99, 0.1)],
      }),
    );
    const internals = strategy as unknown as {
      _selfCancelledEntryIds: Map<string, number>;
      steps: Array<{ entryClientOrderId: string | null }>;
    };
    // The strategy issued the cancel itself just now, then the step claim went
    // away (reset/reinit) — the sweep must not alarm on it.
    internals._selfCancelledEntryIds.set(id, Date.now());
    for (const step of internals.steps) step.entryClientOrderId = null;

    const result = await strategy.analyze(createDataUpdate([]));

    // Inside the suppression window the sweep neither alarms NOR re-sends the
    // cancel (round 9, opus m2 seeds the throttle from the self-cancel stamp) —
    // the strategy already killed the order at the venue.
    expect(findCancelSignals(result).length).toBe(0);
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes(id))).toBe(false);
    // Still blocking: no new entry while the straggler is live.
    expect(findEntrySignals(result).length).toBe(0);
    errSpy.mockRestore();
  });

  it('raises the stall alert once a self-cancelled entry outlives the retry window (no silent permanent stall)', async () => {
    // Review round 6, opus F1: the suppression must be time-bounded. If the
    // CANCELED push never arrives the order keeps blocking forever, so the alarm
    // has to fire eventually instead of staying silent.
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const id = 'E1D9000072';
    await strategy.processInitialData(
      createInitialData({
        openOrders: [createOrder(id, OrderSide.BUY, OrderStatus.NEW, 99, 0.1)],
      }),
    );
    const internals = strategy as unknown as {
      _selfCancelledEntryIds: Map<string, number>;
      steps: Array<{ entryClientOrderId: string | null }>;
    };
    // Cancelled by us, but longer ago than one retry window.
    internals._selfCancelledEntryIds.set(id, Date.now() - 120_000);
    for (const step of internals.steps) step.entryClientOrderId = null;

    const result = await strategy.analyze(createDataUpdate([]));

    expect(findCancelSignals(result).map((s) => s.clientOrderId)).toEqual([id]);
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes(id))).toBe(true);
    errSpy.mockRestore();
  });

  it('keeps suppressing the alarm across a reset + re-merge, not merely until the first sweep', async () => {
    // Review round 8, opus MAJOR (F1 regression): `resetLadder` empties
    // `this.orders`, so a prune on `!this.orders.has(id)` dropped the suppression
    // on the very first sweep after a reset; the re-merged, still-unconfirmed
    // order then fired the false alarm on a normal TP-filled cycle. The map is
    // now TTL-only, so the suppression survives the whole sequence.
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const id = 'E1D9000075';
    await strategy.processInitialData(
      createInitialData({
        openOrders: [createOrder(id, OrderSide.BUY, OrderStatus.NEW, 99, 0.1)],
      }),
    );
    const internals = strategy as unknown as {
      _selfCancelledEntryIds: Map<string, number>;
      resetLadder: () => void;
      steps: Array<{ entryClientOrderId: string | null }>;
    };
    // The strategy cancelled this entry itself, then reset.
    internals._selfCancelledEntryIds.set(id, Date.now());
    internals.resetLadder();
    // A sweep runs BEFORE the re-merge (this used to drain the map).
    await strategy.analyze(createDataUpdate([]));
    // The engine re-merges the order: its cancel is still unconfirmed, so the
    // venue still lists it. Re-establish the unclaimed shape.
    await strategy.processInitialData(
      createInitialData({
        openOrders: [createOrder(id, OrderSide.BUY, OrderStatus.NEW, 99, 0.1)],
      }),
    );
    for (const step of internals.steps) step.entryClientOrderId = null;

    const after = await strategy.analyze(createDataUpdate([]));

    // No false alarm, and still blocking. The re-issue itself is throttled by the
    // seeded cancel stamp (round 9, opus m2): inside the 60 s suppression window
    // the sweep must NOT re-send the cancel, it resumes at the next boundary.
    expect(findCancelSignals(after)).toEqual([]);
    expect(findEntrySignals(after).length).toBe(0);
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes(id))).toBe(false);
    errSpy.mockRestore();
  });

  it('records the self-cancel from the real call site (cancelAllEntryOrders)', async () => {
    // Review round 8, opus MINOR: the earlier tests wrote the map directly, so
    // nothing proved the two new `.set(...)` call sites are ever reached. Drive
    // the real one.
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
    const id = 'E1D9000076';
    await strategy.processInitialData(
      createInitialData({
        openOrders: [createOrder(id, OrderSide.BUY, OrderStatus.NEW, 99, 0.1)],
      }),
    );
    const internals = strategy as unknown as {
      cancelAllEntryOrders: (reason: string) => StrategyResult[];
      _selfCancelledEntryIds: Map<string, number>;
    };

    internals.cancelAllEntryOrders('test');

    expect(internals._selfCancelledEntryIds.get(id)).toBeGreaterThan(0);
  });

  it('never cancels an own live BUY order whose metadata positively says it is not an entry', async () => {
    // Review round 8, opus MAJOR (F2 scope): the missing-metadata fallback must
    // not also swallow orders whose metadata EXISTS and says "not an entry"
    // (e.g. a TakeProfit). Otherwise a future BUY-side non-entry order would be
    // cancelled every 60s and stall entries.
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const id = 'E1D9000077';
    await strategy.processInitialData(
      createInitialData({
        openOrders: [createOrder(id, OrderSide.BUY, OrderStatus.NEW, 99, 0.1)],
      }),
    );
    const internals = strategy as unknown as {
      orderMetadataMap: Map<string, { signalType: SignalType }>;
      steps: Array<{ entryClientOrderId: string | null }>;
    };
    internals.orderMetadataMap.get(id)!.signalType = SignalType.TakeProfit;
    for (const step of internals.steps) step.entryClientOrderId = null;

    const result = await strategy.analyze(createDataUpdate([]));

    expect(findCancelSignals(result).map((s) => s.clientOrderId)).not.toContain(id);
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes(id))).toBe(false);
    errSpy.mockRestore();
  });

  it('does not treat a digit-prefix sibling as its own order (63 vs 631)', async () => {
    // Review round 9, opus M1: the earlier version used a SINGLE live order,
    // which init always claims onto step 0, so it passed whether or not the
    // matcher collided — a test that cannot fail. Use a claimed own order plus a
    // sibling-shaped candidate, the same shape as the file's first test: with a
    // prefix/`startsWith` matcher the sibling becomes an unclaimed own entry and
    // is cancelled, so this test would fail.
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig({}, 63));

    const result = await strategy.processInitialData(
      createInitialData({
        openOrders: [
          createOrder('E63D1', OrderSide.BUY, OrderStatus.NEW, 99, 0.1),
          createOrder('E631D1', OrderSide.BUY, OrderStatus.NEW, 105, 0.1),
        ],
      }),
    );

    expect(findCancelSignals(result).map((s) => s.clientOrderId)).not.toContain('E631D1');
  });

  it('treats an own BUY entry with no metadata as a stray instead of failing open', async () => {
    // Review round 6, opus F2: a restart can skip the block that recovers
    // metadata for the init `openOrders`. Skipping such an own order silently
    // would let the duplicate through with no signal at all.
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const id = 'E1D9000074';
    await strategy.processInitialData(
      createInitialData({
        openOrders: [createOrder(id, OrderSide.BUY, OrderStatus.NEW, 99, 0.1)],
      }),
    );
    const internals = strategy as unknown as {
      orderMetadataMap: Map<string, unknown>;
      steps: Array<{ entryClientOrderId: string | null }>;
    };
    // Simulate the skipped recovery: the order is live and ours, but has no
    // metadata at all.
    internals.orderMetadataMap.delete(id);
    for (const step of internals.steps) step.entryClientOrderId = null;

    const result = await strategy.analyze(createDataUpdate([]));

    expect(findCancelSignals(result).map((s) => s.clientOrderId)).toEqual([id]);
    expect(findEntrySignals(result).length).toBe(0);
    errSpy.mockRestore();
  });

  it('records the self-cancel from the reset-interval call site (checkAndPerformReset)', async () => {
    // Round 10, opus MINOR-2: the `ladder_reset_interval` site (which MAJOR-1
    // hinges on) was never reached by a test. Drive it for real.
    const strategy = new LadderEntrySingleTPStrategy(
      createStrategyConfig({ basePrice: 0, resetInterval: 1 }),
    );
    const internals = strategy as unknown as {
      checkAndPerformReset: () => StrategyResult[];
      entry0PlacedTime: number;
      _currentBid0: Decimal;
      _currentBid0Time: number;
      _selfCancelledEntryIds: Map<string, number>;
      previousCycleOrderIds: Set<string>;
    };

    const init = await strategy.processInitialData(
      createInitialData({ orderBook: createOrderBook(100) }),
    );
    const e0 = findEntrySignals(init)[0].clientOrderId!;
    expect(e0).toBeTruthy();

    // Entry 0 is live on the exchange, so it is merged into this.orders and
    // linked to step 0.
    await strategy.analyze(
      createDataUpdate([createOrder(e0, OrderSide.BUY, OrderStatus.NEW, 99, 0.1)]),
    );

    // Entry 0 has rested for more than one interval, and bid0 has moved lower so
    // the proximity guard approves a re-anchor.
    internals.entry0PlacedTime = Date.now() - 61_000;
    internals._currentBid0 = new Decimal(95);
    internals._currentBid0Time = Date.now();

    const signals = internals.checkAndPerformReset();

    expect(signals.length).toBe(1);
    expect((signals[0] as { reason?: string }).reason).toBe('ladder_reset_interval');
    expect(internals._selfCancelledEntryIds.has(e0)).toBe(true);
    expect(internals.previousCycleOrderIds.has(e0)).toBe(true);
  });

  it('keeps inventory derived (not accumulated) across reset -> merge -> late pushes', async () => {
    // Round 13, opus (v14) must-fix 1: fault-injection shape that DOES fail.
    // Inventory is rebuilt by recalculateVWAP() from live own entries, so a late
    // terminal push must not add to it. Falsified by zeroing recalculateVWAP's
    // `this.inventoryQty = totalQty` (then every assertion below 0.04/0.06 fails).
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
    const I = strategy as unknown as any;
    const strayId = 'E1D9000302';
    const snap = () =>
      createInitialData({
        openOrders: [
          createOrder(
            strayId,
            OrderSide.BUY,
            OrderStatus.PARTIALLY_FILLED,
            105,
            0.1,
            0.04,
            105,
          ),
        ],
      });

    await strategy.processInitialData(snap());
    expect(strategy.getStrategyState().inventoryQty).toBe('0.04');

    I.resetLadder();
    expect(strategy.getStrategyState().inventoryQty).toBe('0');

    // Non-reinit merge re-books the live entry from the venue's executed qty.
    await strategy.processInitialData(snap());
    expect(strategy.getStrategyState().inventoryQty).toBe('0.04');
    expect(I.orders.has(strayId)).toBe(true);

    // A later, larger partial fill books only the DELTA (0.06), not 0.04 + 0.06.
    await strategy.analyze(
      createDataUpdate([
        createOrder(
          strayId,
          OrderSide.BUY,
          OrderStatus.PARTIALLY_FILLED,
          105,
          0.1,
          0.06,
          105,
        ),
      ]),
    );
    expect(strategy.getStrategyState().inventoryQty).toBe('0.06');

    // And the terminal push does not double-book it either.
    const last = await strategy.analyze(
      createDataUpdate([
        createOrder(strayId, OrderSide.BUY, OrderStatus.CANCELED, 105, 0.1, 0.06, 105),
      ]),
    );
    expect(strategy.getStrategyState().inventoryQty).toBe('0.06');
    expect(findTpSignals(last).length).toBe(1);
  });

  it('keeps inventory derived when a blacklisted stray is un-blacklisted by a sweep, then pushed', async () => {
    // opus v15 m1: the previous derived-inventory test never reaches this patch's
    // un-blacklist (the order is claimed onto step 0). Here the stray is blacklisted
    // AND unclaimed, so the sweep re-admits it; late pushes must still only book the
    // delta (falsified by zeroing recalculateVWAP, as in the sibling test).
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
    const I = strategy as unknown as any;
    const strayId = 'E1D9000401';

    await strategy.processInitialData(
      createInitialData({
        openOrders: [
          createOrder(
            strayId,
            OrderSide.BUY,
            OrderStatus.PARTIALLY_FILLED,
            105,
            0.1,
            0.04,
            105,
          ),
        ],
      }),
    );
    expect(I.orders.has(strayId)).toBe(true);
    expect(strategy.getStrategyState().inventoryQty).toBe('0.04');

    // Blacklist it (as a reset would) and unclaim every step, so the sweep sees a
    // live entry that no ladder step owns.
    I.previousCycleOrderIds.add(strayId);
    for (const step of I.steps) (step as any).entryClientOrderId = null;

    const swept = await strategy.analyze(createDataUpdate([]));
    // The sweep re-admits (un-blacklists) the live stray...
    expect(I.previousCycleOrderIds.has(strayId)).toBe(false);
    // ...and blocks placement while it is live.
    expect(findEntrySignals(swept).length).toBe(0);

    // A later, larger partial fill books only the DELTA.
    await strategy.analyze(
      createDataUpdate([
        createOrder(
          strayId,
          OrderSide.BUY,
          OrderStatus.PARTIALLY_FILLED,
          105,
          0.1,
          0.06,
          105,
        ),
      ]),
    );
    expect(strategy.getStrategyState().inventoryQty).toBe('0.06');

    const last = await strategy.analyze(
      createDataUpdate([
        createOrder(strayId, OrderSide.BUY, OrderStatus.CANCELED, 105, 0.1, 0.06, 105),
      ]),
    );
    expect(strategy.getStrategyState().inventoryQty).toBe('0.06');
    expect(findTpSignals(last).length).toBe(1);
  });

  it('does not un-blacklist a live entry its ladder step still claims (reset ordering)', async () => {
    // opus v16 m4 / v17 m1: on the analyze path `checkAndPerformReset()` runs and THEN
    // `sweepUnclaimedEntries` runs in the SAME analyze() (strategy.ts ~4482-4487 and
    // ~4510-4513). The reset blacklists entry 0 while it is still in `this.orders` and
    // still claimed by its step (resetLadder is deferred to the reinit), so the
    // same-cycle sweep must not re-admit it. This drives the REAL ordering: if a future
    // change made `checkAndPerformReset` clear step 0's claim before the reinit, the
    // sweep would cancel e0 and drop the reset's blacklist, and this test would fail.
    // Note (honest scope): this pins an ORDERING INVARIANT, not a regression of this
    // patch — it also passes on HEAD (HEAD has no sweep), but it does fail under the
    // ordering break: clearing step 0's claim inside checkAndPerformReset makes it
    // fail with `expected false to be true` on the blacklist assertion.
    const strategy = new LadderEntrySingleTPStrategy(
      createStrategyConfig({ basePrice: 0, resetInterval: 1 }),
    );
    const I = strategy as unknown as any;

    const init = await strategy.processInitialData(
      createInitialData({ orderBook: createOrderBook(100) }),
    );
    const e0 = findEntrySignals(init)[0].clientOrderId as string;

    await strategy.analyze(
      createDataUpdate([createOrder(e0, OrderSide.BUY, OrderStatus.NEW, 99, 0.1)]),
    );
    expect(I.steps[0].entryClientOrderId).toBe(e0);

    // Entry 0 has rested past one interval and bid0 moved lower, so the proximity
    // guard approves a reset — the same triggers as the call-site test above.
    I.entry0PlacedTime = Date.now() - 61_000;
    I._currentBid0 = new Decimal(95);
    I._currentBid0Time = Date.now();

    const pass = await strategy.analyze(createDataUpdate([]));

    // checkAndPerformReset fired in this pass (blacklisted e0, set _needsReinit)...
    expect(I.previousCycleOrderIds.has(e0)).toBe(true);
    expect(I._needsReinit).toBe(true);
    // ...and the same-cycle sweep did NOT re-admit e0 — it is still claimed by step 0,
    // so no duplicate-guard cancel is emitted for it and the blacklist survives.
    expect(
      findCancelSignals(pass).filter(
        (s) => s.reason === 'ladder_unclaimed_entry_cancel_no_duplicate',
      ),
    ).toEqual([]);
    expect(I.steps[0].entryClientOrderId).toBe(e0);
  });

  it('re-detects and cancels a live ghost entry after a real reset -> reinit', async () => {
    // Round 13, opus (v14) must-fix 2: cover the REAL `_needsReinit` path, not
    // just a direct resetLadder() call. checkAndPerformReset() blacklists the
    // entry and flips `_needsReinit`; the engine reinit sees the entry STILL live
    // (its cancel was lost) and must not silently leave it un-cancelled.
    // Observed contract: the reinit branch cancels the ghost by id
    // (ladder_reinit_ghost_cleanup) and re-blacklists it, so the stale entry is
    // not left free to fill next to a fresh one. Placement of the replacement
    // ladder is replace-semantics in the same pass; a lost cancel there is a
    // residual exchange-side risk tracked separately, NOT covered by this fix.
    const strategy = new LadderEntrySingleTPStrategy(
      createStrategyConfig({ basePrice: 0, resetInterval: 1 }),
    );
    const I = strategy as unknown as any;
    const init = await strategy.processInitialData(
      createInitialData({ orderBook: createOrderBook(100) }),
    );
    const e0 = findEntrySignals(init)[0].clientOrderId!;
    await strategy.analyze(
      createDataUpdate([createOrder(e0, OrderSide.BUY, OrderStatus.NEW, 99, 0.1)]),
    );
    I.entry0PlacedTime = Date.now() - 61_000;
    I._currentBid0 = new Decimal(95);
    I._currentBid0Time = Date.now();

    const resetSignals = I.checkAndPerformReset();
    expect(resetSignals.length).toBe(1);
    expect(I._needsReinit).toBe(true);

    // Reinit with the cancel lost: e0 is still live at the venue.
    const reinit = await strategy.processInitialData(
      createInitialData({
        orderBook: createOrderBook(100),
        openOrders: [createOrder(e0, OrderSide.BUY, OrderStatus.NEW, 99, 0.1)],
      }),
    );
    const cancels = findCancelSignals(reinit).map((s: any) => s.clientOrderId);
    expect(cancels).toContain(e0);
    expect(I.previousCycleOrderIds.has(e0)).toBe(true);
    expect(I._needsReinit).toBe(false);
    // Pins the documented residual (opus v15 M2): the replacement ladder is placed
    // in the SAME pass as the ghost cancel (replace semantics), so it is not
    // "blocked". A follow-up fix that suppresses placement while the ghost cancel
    // is unconfirmed must flip this assertion to `toBe(0)`.
    expect(findEntrySignals(reinit).length).toBe(1);
  });

  it('clears the self-cancel / blacklist state on teardown (restart symmetry)', async () => {
    // Round 10, kimi MINOR (teardown symmetry): onCleanup must drop every stamp
    // so a reused instance cannot suppress a first alert/cancel for a window.
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
    const internals = strategy as unknown as {
      _selfCancelledEntryIds: Map<string, number>;
      _unclaimedCancelIssuedAt: Map<string, number>;
      _unclaimedStrayFirstSeenAt: Map<string, number>;
      _lastVisibleAlertAt: Map<string, number>;
      previousCycleOrderIds: Set<string>;
      onCleanup: () => Promise<void>;
    };
    const t = Date.now();
    internals._selfCancelledEntryIds.set('E1D9000099', t);
    internals._unclaimedCancelIssuedAt.set('E1D9000099', t);
    internals._unclaimedStrayFirstSeenAt.set('E1D9000099', t);
    internals._lastVisibleAlertAt.set('E1D9000099', t);
    internals.previousCycleOrderIds.add('E1D9000099');

    await internals.onCleanup();

    // Every stamp added for this feature must clear (round 12, opus minor): the
    // 60 s window and the first-seen marker would otherwise survive a reused
    // instance and suppress the first alert/cancel for a real stray.
    expect(internals._selfCancelledEntryIds.size).toBe(0);
    expect(internals._unclaimedCancelIssuedAt.size).toBe(0);
    expect(internals._unclaimedStrayFirstSeenAt.size).toBe(0);
    expect(internals._lastVisibleAlertAt.size).toBe(0);
    expect(internals.previousCycleOrderIds.size).toBe(0);
  });

  it('un-blacklists a live unclaimed entry even while its cancel re-send is throttled (no swallowed push)', async () => {
    // Round 10, opus MAJOR-1: the m2 seed throttles the sweep right after a
    // self-cancel. The un-blacklisting of `previousCycleOrderIds` must NOT be
    // throttled with it, or a CANCELED/FILLED push for that live order is
    // DROPPED (handleOrderUpdates ignores blacklisted ids) — a permanent block,
    // or an orphan long with no TP.
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
    const claimedId = 'E1D9000081';
    const strayId = 'E1D9000082';
    await strategy.processInitialData(
      createInitialData({
        openOrders: [
          createOrder(claimedId, OrderSide.BUY, OrderStatus.NEW, 99, 0.1),
          createOrder(strayId, OrderSide.BUY, OrderStatus.NEW, 105, 0.1),
        ],
      }),
    );
    const internals = strategy as unknown as {
      _selfCancelledEntryIds: Map<string, number>;
      _unclaimedCancelIssuedAt: Map<string, number>;
      previousCycleOrderIds: Set<string>;
      orders: Map<string, unknown>;
    };
    // The reset-interval path blacklists the order and stamps it self-cancelled,
    // then clears the throttle maps (resetLadder). The order is still live.
    internals._selfCancelledEntryIds.set(strayId, Date.now());
    internals.previousCycleOrderIds.add(strayId);
    internals._unclaimedCancelIssuedAt.clear();
    expect(internals.orders.has(strayId)).toBe(true);

    // Cycle A: the sweep runs while the re-send is throttled by the seed. It must
    // still un-blacklist the order.
    await strategy.analyze(createDataUpdate([]));
    expect(internals.previousCycleOrderIds.has(strayId)).toBe(false);

    // Cycle B: the CANCELED push now reaches normal accounting.
    await strategy.analyze(
      createDataUpdate([
        createOrder(strayId, OrderSide.BUY, OrderStatus.CANCELED, 105, 0.1, 0),
      ]),
    );
    expect(internals.orders.has(strayId)).toBe(false);
  });

  it('books a FILLED push for a throttled, blacklisted live entry instead of orphaning it', async () => {
    // Same path, racing fill (round 10, opus MAJOR-1).
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
    const claimedId = 'E1D9000043';
    const strayId = 'E1D9000044';
    await strategy.processInitialData(
      createInitialData({
        openOrders: [
          createOrder(claimedId, OrderSide.BUY, OrderStatus.NEW, 99, 0.1),
          createOrder(strayId, OrderSide.BUY, OrderStatus.NEW, 105, 0.1),
        ],
      }),
    );
    const internals = strategy as unknown as {
      _selfCancelledEntryIds: Map<string, number>;
      _unclaimedCancelIssuedAt: Map<string, number>;
      previousCycleOrderIds: Set<string>;
      orders: Map<string, unknown>;
    };
    internals._selfCancelledEntryIds.set(strayId, Date.now());
    internals.previousCycleOrderIds.add(strayId);
    internals._unclaimedCancelIssuedAt.clear();

    await strategy.analyze(createDataUpdate([])); // un-blacklist while throttled
    const result = await strategy.analyze(
      createDataUpdate([
        createOrder(strayId, OrderSide.BUY, OrderStatus.FILLED, 105, 0.1, 0.1, 105),
      ]),
    );

    expect(strategy.getStrategyState().inventoryQty).toBe('0.1');
    expect(findTpSignals(result).length).toBeGreaterThanOrEqual(1);
  });

  it('reproduces the 2026-10-01 incident: a capped ladder places no second entry over a live one', async () => {
    // TRUE production shape, empirically verified against HEAD (see below).
    // With `basePrice: 0` the ladder anchors on the fresh orderbook bid0, and
    // with `maxEntryPrice` set the anchor is CLAMPED TO THE CAP — not to the
    // surviving live entry. A live entry above the cap is therefore claimed by no
    // step. In production that was `E631D3 @1414.81` while the ladder re-anchored
    // to the capped ~1402.28, so at 18:31 a second entry `E631D2 @1397.12` was
    // placed next to the still-live first one: 12 ZEC instead of 6.
    //
    // MEASURED: on HEAD this test FAILS ON THE ENTRY ASSERTION BELOW (HEAD emits
    // `ladder_entry_step_0` and never cancels E631D3). It is not merely the new
    // cancel signal — the duplicate itself is reproduced.
    const strategy = new LadderEntrySingleTPStrategy(
      createStrategyConfig(
        {
          basePrice: 0,
          maxEntryPrice: 1402.28,
          stepType: 'geometric',
          stepValue: 0.62,
          entryGapType: 'geometric',
          entryGapValue: 0.62,
        },
        631,
      ),
    );
    const stale = 'E631D3';

    const init = await strategy.processInitialData(
      createInitialData({
        orderBook: createOrderBook(1414.81),
        openOrders: [createOrder(stale, OrderSide.BUY, OrderStatus.NEW, 1414.81, 6)],
      }),
    );

    // No second entry on top of the live one, and the un-claimable live order is
    // cancelled by id.
    expect(findEntrySignals(init).length).toBe(0);
    expect(findCancelSignals(init).map((s) => s.clientOrderId)).toEqual([stale]);

    await strategy.analyze(
      createDataUpdate([
        createOrder(stale, OrderSide.BUY, OrderStatus.CANCELED, 1414.81, 6, 0),
      ]),
    );
    // Once the cancel is confirmed the ladder MUST resume. Feed a fresh book tick
    // so bid0 is live, then PIN the count: exactly ONE entry, at or below the cap
    // (round 12, opus M1 — the previous `<= 1` passed vacuously on a permanent
    // stall, because the loop over an empty array asserts nothing).
    const resumed = await strategy.processInitialData(
      createInitialData({ orderBook: createOrderBook(1414.81), openOrders: [] }),
    );
    const entries = findEntrySignals(resumed);
    expect(entries.length).toBe(1);
    for (const e of entries) {
      expect(new Decimal(e.price!.toString()).lte(1402.28)).toBe(true);
    }
  });

  it('reproduces the 2026-10-01 incident shape: an out-of-tolerance live entry is cancelled AND blocks', async () => {
    // Empirically verified shape (see the diag that produced step prices
    // [1414.81, 1413.81, 1412.81]): the ladder re-anchors step 0 on the highest
    // surviving live entry, so any live entry more than the 0.1% recovery
    // tolerance away from every step becomes un-claimable. In production that
    // was `E631D3 @1414.81` vs the level-2 order `E631D2 @1397.12` (1.27% away).
    // While such an order is live it must be cancelled by id AND block placement;
    // otherwise a second entry is placed on top of it (12 ZEC instead of 6).
    const strategy = new LadderEntrySingleTPStrategy(
      createStrategyConfig({ basePrice: 1402.28 }, 631),
    );
    const claimed = 'E631D3';
    const stray = 'E631D2';

    const init = await strategy.processInitialData(
      createInitialData({
        orderBook: createOrderBook(1402.28),
        openOrders: [
          createOrder(claimed, OrderSide.BUY, OrderStatus.NEW, 1414.81, 6),
          createOrder(stray, OrderSide.BUY, OrderStatus.NEW, 1402.28, 6),
        ],
      }),
    );

    // MEASURED on HEAD: this repro fails on the cancel assertion below, NOT on a
    // duplicate-entry assertion. Reason: in this harness the recovery claims the
    // highest live order for step 0, so `hasActiveEntryAfterCleanup` is already
    // true on HEAD and HEAD places no entry either. The production duplicate
    // additionally needed the ghost-cleanup block to be skipped (`_needsReinit`
    // false on a pg_notify restart), which is an engine-init property this
    // harness does not reproduce. What HEAD provably does here is leave the
    // out-of-tolerance live order unmanaged (no cancel, no alert, exposure kept)
    // — that is the assertion below that fails on HEAD.
    //
    // Exactly the out-of-tolerance order is cancelled — by id — and nothing new
    // is placed while it is still live.
    expect(findCancelSignals(init).map((s) => s.clientOrderId)).toEqual([stray]);
    expect(findEntrySignals(init).length).toBe(0);

    // Once the cancel is confirmed the dead stray is never re-cancelled, and the
    // live claimed order (E631D3) still holds the ladder to a single entry.
    // Advance past the throttle window so the release assertion is falsifiable
    // (round 10, opus MINOR-1).
    const releaseSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);
    const resumed = await strategy.analyze(
      createDataUpdate([
        createOrder(stray, OrderSide.BUY, OrderStatus.CANCELED, 1402.28, 6, 0),
      ]),
    );
    releaseSpy.mockRestore();
    expect(findCancelSignals(resumed).map((s) => s.clientOrderId)).not.toContain(stray);
    expect(findEntrySignals(resumed).length).toBe(0);

    // ... and when that claimed entry fills, the ladder advances by exactly one
    // step — never placing a second order alongside the (now dead) stray.
    const advanced = await strategy.analyze(
      createDataUpdate([
        createOrder(claimed, OrderSide.BUY, OrderStatus.FILLED, 1414.81, 6, 6, 1414.81),
      ]),
    );
    expect(findEntrySignals(advanced).length).toBe(1);
  });

  it('never cancels a sibling strategy order that arrives through analyze()', async () => {
    // `orderMetadataMap` is the only source of ownership, and on the update path
    // it is built solely by `ensureRecoveredMetadata`, which bails out unless the
    // clientOrderId carries THIS strategy's id (`isStrategyOrderId`). Round 3
    // widened the sweep's trigger surface from init-only to every tick, so the
    // sibling exclusion is pinned here on the analyze path too.
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig({}, 631));
    await strategy.processInitialData(createInitialData({}));

    const sibling = createOrder('E632D9000001', OrderSide.BUY, OrderStatus.NEW, 105, 0.1);
    const result = await strategy.analyze(createDataUpdate([sibling]));

    expect(findCancelSignals(result).map((s) => s.clientOrderId)).not.toContain(
      'E632D9000001',
    );
  });

  it('cancels every stray and does not re-issue inside the 60s window', async () => {
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
    const claimedId = 'E1D9000051';
    const strayA = 'E1D9000052';
    const strayB = 'E1D9000053';
    const openOrders = [
      createOrder(claimedId, OrderSide.BUY, OrderStatus.NEW, 99, 0.1),
      createOrder(strayA, OrderSide.BUY, OrderStatus.NEW, 105, 0.1),
      createOrder(strayB, OrderSide.BUY, OrderStatus.NEW, 106, 0.1),
    ];

    const init = await strategy.processInitialData(createInitialData({ openOrders }));
    expect(
      findCancelSignals(init)
        .map((s) => s.clientOrderId)
        .sort(),
    ).toEqual([strayA, strayB]);

    // Same second, one more placement attempt: still blocked, but no duplicate
    // cancel for either stray (per-id throttle) and no new entry.
    const again = await strategy.analyze(createDataUpdate([]));
    expect(findCancelSignals(again)).toEqual([]);
    expect(findEntrySignals(again).length).toBe(0);
  });

  it('alerts once per stray, survives the silent logger, and is throttled per order', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
      const claimedId = 'E1D9000061';
      const strayA = 'E1D9000062';
      const strayB = 'E1D9000063';

      await strategy.processInitialData(
        createInitialData({
          openOrders: [
            createOrder(claimedId, OrderSide.BUY, OrderStatus.NEW, 99, 0.1),
            createOrder(strayA, OrderSide.BUY, OrderStatus.NEW, 105, 0.1),
            createOrder(strayB, OrderSide.BUY, OrderStatus.NEW, 106, 0.1),
          ],
        }),
      );

      // One alert per stray order (per-order key, not per kind): the whole
      // "never silently blocked" claim rests on this escape hatch, since the
      // strategy is built with `silentLogger` in production.
      const first = spy.mock.calls.map((c) => String(c[0]));
      expect(first.filter((m) => m.includes(strayA)).length).toBe(1);
      expect(first.filter((m) => m.includes(strayB)).length).toBe(1);

      // Inside the 60s window nothing is re-issued → no further alerts.
      spy.mockClear();
      await strategy.analyze(createDataUpdate([]));
      expect(spy.mock.calls.length).toBe(0);

      // Past the window the retry is both re-issued and re-alerted.
      const realNow = Date.now();
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(realNow + 61_000);
      const retry = await strategy.analyze(createDataUpdate([]));
      nowSpy.mockRestore();

      expect(
        findCancelSignals(retry)
          .map((s) => s.clientOrderId)
          .sort(),
      ).toEqual([strayA, strayB]);
      const retryAlerts = spy.mock.calls.map((c) => String(c[0]));
      expect(retryAlerts.filter((m) => m.includes('still unconfirmed')).length).toBe(2);
    } finally {
      spy.mockRestore();
    }
  });

  it('retries the cancel from a plain analyze() cycle (no reinit needed)', async () => {
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
    const claimedId = 'E1D9000013';
    const strayId = 'E1D9000014';
    const openOrders = [
      createOrder(claimedId, OrderSide.BUY, OrderStatus.NEW, 99, 0.1),
      createOrder(strayId, OrderSide.BUY, OrderStatus.NEW, 105, 0.1),
    ];

    const first = await strategy.processInitialData(createInitialData({ openOrders }));
    expect(findCancelSignals(first).length).toBe(1);

    // Nothing but WS ticks from here on: in a running process nothing calls
    // processInitialData again, so the retry of a lost cancel must happen on the
    // analyze path too — otherwise the block is silent and permanent.
    const realNow = Date.now();
    const spy = vi.spyOn(Date, 'now').mockReturnValue(realNow + 61_000);
    const tick = await strategy.analyze(createDataUpdate([]));
    spy.mockRestore();

    const cancels = findCancelSignals(tick);
    expect(cancels.length).toBe(1);
    expect(cancels[0].clientOrderId).toBe(strayId);
    expect(findEntrySignals(tick).length).toBe(0);
  });

  it('re-issues a lost cancel instead of failing open after the 60s retry window', async () => {
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
    const claimedId = 'E1D9000011';
    const strayId = 'E1D9000012';
    const openOrders = [
      createOrder(claimedId, OrderSide.BUY, OrderStatus.NEW, 99, 0.1),
      createOrder(strayId, OrderSide.BUY, OrderStatus.NEW, 105, 0.1),
    ];

    const first = await strategy.processInitialData(createInitialData({ openOrders }));
    expect(findCancelSignals(first).length).toBe(1);

    // 61s later the stray is STILL live locally (no CANCELED push arrived).
    // Treating that as "gone" would re-open the duplicate-exposure hole.
    const realNow = Date.now();
    const spy = vi.spyOn(Date, 'now').mockReturnValue(realNow + 61_000);
    const second = await strategy.processInitialData(
      createInitialData({ openOrders, timestamp: new Date(realNow + 61_000) }),
    );
    spy.mockRestore();

    const cancels = findCancelSignals(second);
    expect(cancels.length).toBe(1);
    expect(cancels[0].clientOrderId).toBe(strayId);
    expect(findEntrySignals(second).length).toBe(0);
  });
});
