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
 * Regression tests for the 2026-10-01 restart mass-cancel defect
 * (Strategy 629/630/631/632/633, `LadderEntrySingleTPStrategy`).
 *
 * Production shape (console container created 09:26:00.48 by the CD rollout of
 * 5e7dd98):
 *   09:26:18.9 – 09:26:19.8  every live entry was cancelled
 *                            ("unclaimed live entry ... claimed by no ladder
 *                             step for 0s")
 *   09:26:21  – 09:26:22.9   fresh entries were placed at the NEW bid0
 *                            (E631D1 @1365.44, E630D1 6000 @0.5097,
 *                             E629D1 @0.5177) + a re-issued TP
 *   09:26:27.8               "LISTEN itrade_config_changed registered"
 *                            → the engine was STILL initializing when the
 *                            cancels fired.
 *
 * Root cause: `TradingEngine.start()` sets `_isRunning = true` BEFORE the
 * sequential `loadInitialDataForStrategy()` loop, and `addStrategy()` puts the
 * strategy into `this._strategies` before its initial data is loaded. The
 * account/user-data stream replays every open order on reconnect, and
 * `onAccountUpdate()` has no `_strategiesWithLoadedInitialData` gate, so
 * `analyze()` runs while `this.steps` is still `[]`. `sweepUnclaimedEntries()`
 * then deems each replayed live entry "claimed by no ladder step" and, because
 * `_unclaimedStrayFirstSeenAt` is in-memory (0s grace after a restart), cancels
 * it immediately. Cancelling removes the evidence the ladder would have been
 * rebuilt from, so the ladder re-anchors on the fresh bid0 and places a
 * duplicate at the next level.
 *
 * Production parameters reproduced here (strategy 630, 2026-10-WLD-L-2):
 *   entryGapType=geometric entryGapValue=0.33 stepType=geometric stepValue=2.15
 *   stepValueRatio=2 qtyPerStep=3000 qtyStepRatio=2 ladderSteps=4
 *   maxEntryPrice=0.53 tpType=absolute tpAbsoluteProfit=12.
 *
 * Quantities are anchor-independent ([3000, 6000, 12000, 24000]), so a live
 * entry's quantity alone identifies its ladder level; its price then rebuilds
 * every level price (entryBase = price / R_i).
 */

const P630: Partial<LadderEntrySingleTPParameters> = {
  basePrice: 0,
  ladderSteps: 4,
  stepType: 'geometric',
  stepValue: 2.15,
  stepValueAdd: 0,
  stepValueRatio: 2,
  entryGapType: 'geometric',
  entryGapValue: 0.33,
  qtyType: 'geometric',
  qtyPerStep: 3000,
  qtyStepRatio: 2,
  maxEntryPrice: 0.53,
  tpType: 'absolute',
  tpAbsoluteProfit: 12,
  tpPercent: 0.58,
  maxInvestment: 1_000_000,
  maxPosition: 1_000_000,
  leverage: 5,
  resetInterval: 15,
};

/** E630D8: the real live order cancelled at 09:26:19.677 (104 of 3000 @0.5219). */
const LIVE_ENTRY_ID = 'E630D8D1790845834483';
const LIVE_ENTRY_PRICE = 0.5219;
const LIVE_ENTRY_QTY = 3000;
const LIVE_ENTRY_EXEC = 104;
/** bid0 at restart: a fresh ladder anchored here puts step 0 ~0.12% away from
 * the live entry, i.e. outside `recoverStepIndex`'s 0.1% price tolerance. */
const FRESH_BID0 = 0.523;

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
      resetInterval: 15,
      ...params,
    },
    symbol: 'BTC/USDT',
    exchange: 'okx',
    strategyId,
    strategyName: `Strategy ${strategyId} restart replay`,
    performance: createEmptyPerformance(
      'BTC/USDT',
      'okx',
      strategyId,
      `Strategy ${strategyId} restart replay`,
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

function createOrderBook(bid0: number, tick = 0.0001): OrderBook {
  const bestBid = new Decimal(bid0);
  const t = new Decimal(tick);
  const bids: Array<[Decimal, Decimal]> = [];
  const asks: Array<[Decimal, Decimal]> = [];
  for (let i = 0; i < 5; i += 1) {
    bids.push([bestBid.minus(t.mul(i)), new Decimal(1000)]);
    asks.push([bestBid.plus(t).plus(t.mul(i)), new Decimal(1000)]);
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
    orderBook: createOrderBook(FRESH_BID0),
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

function findCancelSignals(result: StrategyAnalyzeResult) {
  return toSignals(result).filter((s) => s.action === 'cancel');
}

function cancelIds(result: StrategyAnalyzeResult): string[] {
  return findCancelSignals(result)
    .map((s) => s.clientOrderId)
    .filter((id): id is string => typeof id === 'string');
}

/** Ladder prices the strategy currently holds (test-only introspection). */
function ladderPrices(strategy: LadderEntrySingleTPStrategy): number[] {
  return ((strategy as unknown as { steps: Array<{ price: Decimal }> }).steps ?? []).map(
    (step) => step.price.toNumber(),
  );
}

const liveEntry = () =>
  createOrder(
    LIVE_ENTRY_ID,
    OrderSide.BUY,
    OrderStatus.PARTIALLY_FILLED,
    LIVE_ENTRY_PRICE,
    LIVE_ENTRY_QTY,
    LIVE_ENTRY_EXEC,
    LIVE_ENTRY_PRICE,
  );
function findTpSignals(result: StrategyAnalyzeResult): StrategyOrderResult[] {
  return toSignals(result).filter(
    (s): s is StrategyOrderResult =>
      (s.action === 'buy' || s.action === 'sell') &&
      s.metadata?.signalType === SignalType.TakeProfit,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LadderEntrySingleTPStrategy — 2026-10-01 restart replay must not cancel valid entries', () => {
  it('does NOT cancel a replayed live entry that arrives before the ladder exists', async () => {
    // Engine is already `_isRunning` while `loadInitialDataForStrategy()` is
    // still looping; the account stream replays the open order and analyze()
    // is invoked with `this.steps === []`.
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig(P630, 630));

    const result = await strategy.analyze(createDataUpdate([liveEntry()]));

    expect(cancelIds(result)).toEqual([]);
    expect(findEntrySignals(result).length).toBe(0);
  });

  it('claims the recovered live entry by quantity and rebuilds every level from its price', async () => {
    // Recovery snapshot: the live entry plus a fresh bid0 that puts a
    // bid0-anchored step 0 ~0.12% away (outside the 0.1% price tolerance).
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig(P630, 630));

    const result = await strategy.processInitialData(
      createInitialData({
        orderBook: createOrderBook(FRESH_BID0),
        openOrders: [liveEntry()],
      }),
    );

    // No cancel, and no duplicate entry placed next to the live one.
    expect(cancelIds(result)).toEqual([]);
    expect(findEntrySignals(result).length).toBe(0);

    // The ladder is rebuilt from the live entry's own price: step 0 == the live
    // price (not the fresh-bid0 price 0.52127...), so the entry stays claimed.
    const prices = ladderPrices(strategy);
    expect(prices.length).toBe(4);
    expect(prices[0]).toBeCloseTo(LIVE_ENTRY_PRICE, 6);
    // Remaining levels follow the ORIGINAL geometry (price * R_i), not the
    // fresh-bid0 geometry: 0.5219*0.9785 = 0.51067 vs 0.52127*0.9785 = 0.51006.
    expect(prices[1]).toBeCloseTo(LIVE_ENTRY_PRICE * 0.9785, 6);
    expect(Math.abs(prices[1] - 0.51006)).toBeGreaterThan(0.0004);
  });

  it('keeps the live entry claimed through a replayed account update after recovery', async () => {
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig(P630, 630));

    await strategy.processInitialData(
      createInitialData({
        orderBook: createOrderBook(FRESH_BID0),
        openOrders: [liveEntry()],
      }),
    );

    const replayed = await strategy.analyze(createDataUpdate([liveEntry()]));

    expect(cancelIds(replayed)).toEqual([]);
    expect(findEntrySignals(replayed).length).toBe(0);
  });

  it('claims a drifted live entry on a CONSTANT-quantity ladder (no quantity key available)', async () => {
    // qtyStepRatio=1 + qtyStepAdd=0 → every step shares one quantity, so the
    // quantity key is deliberately unusable here (see matchStepIndexByQuantity)
    // and the level has to come from the price instead. Step 1c reverse-engineers
    // the anchor from the entry order itself, so the rebuilt ladder reproduces
    // that entry's price exactly and the claim succeeds: no cancel, no duplicate.
    //
    // This is the case review round 1 (M1-A) predicted would still be cancelled
    // with a 0s grace window; it is not, because the sweep is gated on the first
    // recovery having completed, and that recovery claims the entry by price.
    const strategy = new LadderEntrySingleTPStrategy(
      createStrategyConfig({ basePrice: 0, ladderSteps: 3 }, 630),
    );

    const result = await strategy.processInitialData(
      createInitialData({
        // Drifted bid0: a bid0-anchored step 0 would be 99.5 - 1 = 98.5, i.e.
        // 0.5% away from the live entry at 99 (outside the 0.1% claim tolerance).
        orderBook: createOrderBook(99.5),
        openOrders: [
          createOrder('E630D1D1790800000001', OrderSide.BUY, OrderStatus.NEW, 99, 0.1),
        ],
      }),
    );

    expect(cancelIds(result)).toEqual([]);
    expect(findEntrySignals(result).length).toBe(0);
    // The ladder was re-anchored on the live entry's own price.
    expect(ladderPrices(strategy)[0]).toBeCloseTo(99, 6);
  });

  it('recovers an uncovered position from the DB net position when no order is open', async () => {
    // No live entry, no orderHistory fill for the cycle: the net position is the
    // only trace. The fill's own price rebuilds the anchor, the quantity decides
    // which levels are filled, and the position must come back covered by a TP.
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig(P630, 630));

    const result = await strategy.processInitialData(
      createInitialData({
        orderBook: createOrderBook(FRESH_BID0),
        openOrders: [],
        strategyNetPosition: new Decimal(3000),
        orderHistory: [
          createOrder(
            'E630D6D1790845000001',
            OrderSide.BUY,
            OrderStatus.FILLED,
            LIVE_ENTRY_PRICE,
            3000,
            3000,
            LIVE_ENTRY_PRICE,
          ),
        ],
      }),
    );

    // The ladder is anchored on the FILL's price, not the fresh bid0.
    expect(ladderPrices(strategy)[0]).toBeCloseTo(LIVE_ENTRY_PRICE, 6);

    // The recovered position is covered by a TP for its full quantity.
    const tps = findTpSignals(result);
    expect(tps.length).toBe(1);
    expect(tps[0].quantity!.toNumber()).toBe(3000);
    expect(tps[0].price!.toNumber()).toBeCloseTo(LIVE_ENTRY_PRICE + 12 / 3000, 4);

    // The ladder resumes on step 1 with the ORIGINAL geometry.
    const entries = findEntrySignals(result);
    expect(entries.length).toBe(1);
    expect(entries[0].quantity!.toNumber()).toBe(6000);
    expect(entries[0].price!.toNumber()).toBeCloseTo(LIVE_ENTRY_PRICE * 0.9785, 5);
    expect(cancelIds(result)).toEqual([]);
  });

  it('falls back to the reported position VWAP when history has no fill price', async () => {
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig(P630, 630));

    const result = await strategy.processInitialData(
      createInitialData({
        orderBook: createOrderBook(FRESH_BID0),
        openOrders: [],
        strategyNetPosition: new Decimal(3000),
        orderHistory: [],
        positions: [
          {
            symbol: 'BTC/USDT',
            side: 'long',
            quantity: new Decimal(3000),
            avgPrice: new Decimal(LIVE_ENTRY_PRICE),
            markPrice: new Decimal(FRESH_BID0),
            unrealizedPnl: new Decimal(0),
            leverage: new Decimal(5),
            timestamp: new Date(),
          },
        ],
      }),
    );

    const tps = findTpSignals(result);
    expect(tps.length).toBe(1);
    expect(tps[0].quantity!.toNumber()).toBe(3000);
    expect(tps[0].price!.toNumber()).toBeCloseTo(LIVE_ENTRY_PRICE + 12 / 3000, 4);
  });

  it('still books the net position when no price evidence exists at all', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig(P630, 630));

    const result = await strategy.processInitialData(
      createInitialData({
        orderBook: createOrderBook(FRESH_BID0),
        openOrders: [],
        strategyNetPosition: new Decimal(3000),
        orderHistory: [],
      }),
    );

    const internals = strategy as unknown as { inventoryQty: Decimal };
    expect(internals.inventoryQty.toNumber()).toBe(3000);
    expect(cancelIds(result)).toEqual([]);
    // UNCOVERED position (no VWAP → no TP can be priced): adding exposure on top
    // of it would compound the risk, so NO entry may be placed.
    expect(findEntrySignals(result).length).toBe(0);
    // ... and the halt must be visible to the operator.
    expect(
      errSpy.mock.calls.some((c) => String(c[0]).includes('Position UNCOVERED')),
    ).toBe(true);
    errSpy.mockRestore();
  });

  it('places nothing before the initial data has been reconciled (fail-closed)', async () => {
    // `TradingEngine.start()` flips `_isRunning = true` before the sequential
    // `loadInitialDataForStrategy()` loop, and `addStrategy()` registers the
    // strategy before loading its initial data. A `basePrice > 0` ladder is fully
    // buildable from the config alone, so without the gate this pass would place a
    // fresh ladder next to the entry/position the account stream is about to
    // replay. Placement is held until the first recovery ran (review round 2, M1).
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig({}, 630));

    const result = await strategy.analyze(createDataUpdate([liveEntry()]));

    expect(findEntrySignals(result).length).toBe(0);
    expect(cancelIds(result)).toEqual([]);
  });

  it('recovers a CANCELED partially-filled entry (fills are status-agnostic)', async () => {
    // The production entry was CANCELED with 104/3000 executed — a FILLED-only
    // filter drops the only price evidence there is, leaving the position
    // uncovered (review round 2, 5a).
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig(P630, 630));
    const cancelledPartial = createOrder(
      'E630D8D1790845834483',
      OrderSide.BUY,
      OrderStatus.CANCELED,
      0.5219,
      3000,
      104,
      0.5219,
    );

    const result = await strategy.processInitialData(
      createInitialData({
        orderBook: createOrderBook(FRESH_BID0),
        openOrders: [],
        orderHistory: [cancelledPartial],
        strategyNetPosition: new Decimal(104),
      }),
    );

    // The cancel is real and must stand; what matters is that its executed part
    // still prices the position.
    expect(ladderPrices(strategy)[0]).toBeCloseTo(0.5219, 6);
    const tps = findTpSignals(result);
    expect(tps.length).toBe(1);
    expect(tps[0].quantity!.toNumber()).toBeCloseTo(104, 6);
    expect(tps[0].price!.toNumber()).toBeCloseTo(0.5219 + 12 / 104, 4);
    // No ladder step may be re-placed on top of the recovered level.
    expect(findEntrySignals(result).filter((e) => e.price!.toNumber() < 0.5219)).toEqual(
      [],
    );
  });

  it('nets a partially-sold, cancelled TP out of the gross level inference', async () => {
    // The cycle bought 9000 (level 0 = 3000, level 1 = 6000) and its TP already
    // sold 2000 before being cancelled/replaced, so the DB net position is 7000
    // and the 2000 survives only in the order history. Counting it is what stops
    // the recovery from re-placing level 1 (review round 2, 5c).
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig(P630, 630));

    const result = await strategy.processInitialData(
      createInitialData({
        orderBook: createOrderBook(FRESH_BID0),
        openOrders: [],
        orderHistory: [
          createOrder(
            'E630D6D1790845000001',
            OrderSide.BUY,
            OrderStatus.FILLED,
            0.5219,
            3000,
            3000,
            0.5219,
          ),
          createOrder(
            'E630D5D1790845000003',
            OrderSide.BUY,
            OrderStatus.FILLED,
            0.5107,
            6000,
            6000,
            0.5107,
          ),
          createOrder(
            'T630D1D1790845000002',
            OrderSide.SELL,
            OrderStatus.CANCELED,
            0.6373,
            9000,
            2000,
            0.6373,
          ),
        ],
        strategyNetPosition: new Decimal(7000),
      }),
    );

    // gross 9000 → two levels are accounted for, so level 1 (6000) must NOT be
    // re-placed; the TP covers the remaining `9000 - 2000 = 7000`.
    expect(
      findEntrySignals(result).filter((e) => e.quantity!.toNumber() === 6000),
    ).toEqual([]);
    const tps = findTpSignals(result);
    expect(tps.length).toBe(1);
    expect(tps[0].quantity!.toNumber()).toBe(7000);

    // A later `recalculateVWAP()` (visible BUY fills = 9000 = the recovered gross)
    // must keep both numbers (review round 3, B2/B3).
    const after = strategy as unknown as {
      inventoryQty: Decimal;
      tpFilledQty: Decimal;
      recalculateVWAP: () => void;
    };
    after.recalculateVWAP();
    expect(after.inventoryQty.toNumber()).toBe(9000);
    expect(after.tpFilledQty.toNumber()).toBe(2000);

    // ...and the TP it drives must still cover the whole net position, not the
    // visible evidence only (review round 3, shapes A/B: 1000/5000 were wrong).
    const later = await strategy.analyze(createDataUpdate([]));
    const laterTps = findTpSignals(later);
    for (const tp of laterTps) {
      expect(tp.quantity!.toNumber()).toBe(7000);
    }
  });

  it('rejects no fill when part of the cycle’s TP already sold (net != bought)', async () => {
    // The restart shape that matters most: level 0 bought 3000, the TP sold 2000
    // and was then cancelled, so the DB net position is only 1000. Comparing the
    // GROSS fills (3000) against the NET position (1000) used to reject the fill
    // entirely — no anchor, no VWAP, and a halted position (review round 3, B1).
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig(P630, 630));

    const result = await strategy.processInitialData(
      createInitialData({
        orderBook: createOrderBook(FRESH_BID0),
        openOrders: [],
        orderHistory: [
          createOrder(
            'E630D6D1790846000001',
            OrderSide.BUY,
            OrderStatus.FILLED,
            0.5219,
            3000,
            3000,
            0.5219,
          ),
          createOrder(
            'T630D1D1790846000002',
            OrderSide.SELL,
            OrderStatus.CANCELED,
            0.6373,
            3000,
            2000,
            0.6373,
          ),
        ],
        strategyNetPosition: new Decimal(1000),
      }),
    );

    const tps = findTpSignals(result);
    expect(tps.length).toBe(1);
    expect(tps[0].quantity!.toNumber()).toBe(1000);

    // The position keeps its cover across a later recalculation (round 3, B2):
    // writing the net position back would make `tpQty` negative.
    const after = strategy as unknown as {
      inventoryQty: Decimal;
      tpFilledQty: Decimal;
      _positionUncovered: boolean;
      recalculateVWAP: () => void;
    };
    after.recalculateVWAP();
    expect(after.inventoryQty.toNumber()).toBe(3000);
    expect(after.tpFilledQty.toNumber()).toBe(2000);
    expect(after._positionUncovered).toBe(false);
  });

  it('keeps a recovered position across later cycles (no silent zeroing)', async () => {
    // The position was recovered from `positions.avgPrice` (no fill in
    // `this.orders`), so `recalculateVWAP()` has no filled entry to sum and used to
    // walk the inventory back to 0 on the next analyze cycle — dropping the TP
    // cover with it (review round 2, M4b).
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig(P630, 630));

    await strategy.processInitialData(
      createInitialData({
        orderBook: createOrderBook(FRESH_BID0),
        openOrders: [],
        strategyNetPosition: new Decimal(3000),
        orderHistory: [],
        positions: [
          {
            symbol: 'BTC/USDT',
            side: 'long',
            quantity: new Decimal(3000),
            avgPrice: new Decimal(LIVE_ENTRY_PRICE),
            markPrice: new Decimal(FRESH_BID0),
            unrealizedPnl: new Decimal(0),
            leverage: new Decimal(5),
            timestamp: new Date(),
          },
        ],
      }),
    );

    const internals = strategy as unknown as { inventoryQty: Decimal };
    expect(internals.inventoryQty.toNumber()).toBe(3000);

    const later = await strategy.analyze(createDataUpdate([]));

    expect(internals.inventoryQty.toNumber()).toBe(3000);
    const tps = findTpSignals(later);
    for (const tp of tps) {
      expect(tp.quantity!.toNumber()).toBe(3000);
    }
  });

  it('covers a filled level with a TP while the next entry is still live', async () => {
    // netPos = 3000 (level 0 filled) with a live entry on level 1 and no live TP:
    // the position still has to come back TP-covered even though the recovery runs
    // the *live entry* path rather than the net-position path (review round 2, 5d).
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig(P630, 630));

    const result = await strategy.processInitialData(
      createInitialData({
        orderBook: createOrderBook(FRESH_BID0),
        openOrders: [
          createOrder(
            'E630D2D1790845834483',
            OrderSide.BUY,
            OrderStatus.NEW,
            0.5219 * 0.9785,
            6000,
          ),
        ],
        orderHistory: [
          createOrder(
            'E630D1D1790845834483',
            OrderSide.BUY,
            OrderStatus.FILLED,
            0.5219,
            3000,
            3000,
            0.5219,
          ),
        ],
        strategyNetPosition: new Decimal(3000),
      }),
    );

    expect(cancelIds(result)).toEqual([]);
    const tps = findTpSignals(result);
    expect(tps.length).toBe(1);
    expect(tps[0].quantity!.toNumber()).toBe(3000);
    // The filled level must not be re-placed next to the live entry.
    expect(
      findEntrySignals(result).filter((e) => e.quantity!.toNumber() === 3000),
    ).toEqual([]);
  });

  it('places nothing while a replayed stream-only entry is inside the observation window', async () => {
    // The REST snapshot did not carry this entry, so only the account stream can
    // supply its price. Until the window elapses the sweep may only BLOCK, never
    // cancel — a cancel would destroy the re-anchor evidence (review round 2, M1).
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig(P630, 630));

    await strategy.processInitialData(
      createInitialData({ orderBook: createOrderBook(FRESH_BID0), openOrders: [] }),
    );

    const streamOnly = await strategy.analyze(
      createDataUpdate([
        createOrder('E630D9D1790845834483', OrderSide.BUY, OrderStatus.NEW, 0.5219, 3000),
      ]),
    );

    expect(cancelIds(streamOnly)).toEqual([]);
    expect(findEntrySignals(streamOnly).length).toBe(0);
  });

  it('carries the part of the gross the order history cannot show', async () => {
    // Truncated history: the cycle bought 9000 (levels 0+1) and its TP sold 2000,
    // but only level 0's fill is in `orderHistory`, so the visible evidence adds up
    // to 3000 while the recovered gross is 9000. `recalculateVWAP()` sees evidence
    // only — without the carry-in the first later fill would drop the unseen 6000
    // and the TP would under-cover the position (review round 3, item C).
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig(P630, 630));

    await strategy.processInitialData(
      createInitialData({
        orderBook: createOrderBook(FRESH_BID0),
        openOrders: [],
        strategyNetPosition: new Decimal(7000),
        orderHistory: [
          // Deliberately NOT the position's avgPrice: the carry-in must carry the
          // cost identity `gross * vwap - visible notional`, otherwise the blended
          // VWAP moves (and the TP jumps) on the first recalculation (round 4, N2).
          createOrder(
            'E630D6D1790847000001',
            OrderSide.BUY,
            OrderStatus.FILLED,
            0.53,
            3000,
            3000,
            0.53,
          ),
          createOrder(
            'T630D1D1790847000002',
            OrderSide.SELL,
            OrderStatus.CANCELED,
            0.6373,
            9000,
            2000,
            0.6373,
          ),
        ],
        // The only price evidence for the unseen part: the reported position.
        positions: [
          {
            symbol: 'BTC/USDT',
            side: 'long',
            quantity: new Decimal(7000),
            avgPrice: new Decimal(LIVE_ENTRY_PRICE),
            markPrice: new Decimal(FRESH_BID0),
            unrealizedPnl: new Decimal(0),
            leverage: new Decimal(5),
            timestamp: new Date(),
          },
        ],
      }),
    );

    const internals = strategy as unknown as {
      inventoryQty: Decimal;
      tpFilledQty: Decimal;
      recalculateVWAP: () => void;
    };
    expect(internals.inventoryQty.toNumber()).toBe(9000);
    expect(internals.tpFilledQty.toNumber()).toBe(2000);

    // A later recalculation keeps the carried-in part (evidence 3000 + carry 6000)
    // AND the recovered VWAP, despite the visible fill sitting at a different price.
    internals.recalculateVWAP();
    expect(internals.inventoryQty.toNumber()).toBe(9000);
    const vwapHolder = strategy as unknown as { vwap: Decimal };
    expect(vwapHolder.vwap.toNumber()).toBeCloseTo(Number(LIVE_ENTRY_PRICE), 6);
  });

  it('keeps the pricing lock when an incomplete fill set cannot be priced', async () => {
    // Truncated history, and no reported position to price it: the recovery must
    // stay uncovered. `recalculateVWAP()` re-derives the position every pass, and
    // pricing it from the VISIBLE subset would put the TP below the true cost and
    // silently release the "manual intervention" halt (review round 4, N1).
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig(P630, 630));

    await strategy.processInitialData(
      createInitialData({
        orderBook: createOrderBook(FRESH_BID0),
        openOrders: [],
        strategyNetPosition: new Decimal(7000),
        orderHistory: [
          createOrder(
            'E630D6D1790848000001',
            OrderSide.BUY,
            OrderStatus.FILLED,
            0.5219,
            3000,
            3000,
            0.5219,
          ),
          createOrder(
            'T630D1D1790848000002',
            OrderSide.SELL,
            OrderStatus.CANCELED,
            0.6373,
            9000,
            2000,
            0.6373,
          ),
        ],
      }),
    );

    const internals = strategy as unknown as {
      inventoryQty: Decimal;
      vwap: Decimal;
      _positionUncovered: boolean;
      _recoveryPricingLocked: boolean;
      recalculateVWAP: () => void;
    };
    expect(internals.inventoryQty.toNumber()).toBe(9000);
    expect(internals.vwap.toNumber()).toBe(0);
    expect(internals._positionUncovered).toBe(true);

    internals.recalculateVWAP();
    expect(internals.vwap.toNumber()).toBe(0);
    expect(internals._positionUncovered).toBe(true);
    expect(internals._recoveryPricingLocked).toBe(true);
    expect(internals.inventoryQty.toNumber()).toBe(9000);

    const later = await strategy.analyze(createDataUpdate([]));
    expect(findEntrySignals(later).length).toBe(0);
  });

  it('does not resurrect a discarded position after a cycle reset', async () => {
    // 恢复出一个仓位 → 一次非 TP-filled 的 resetLadder()：reset 已经发出
    // `reset_drops_position` 告警宣告放弃这份账本，`recalculateVWAP()` 不得再把
    // `_recoveredNetPos`（它作为"延迟 WS 推送额度"有意跨 reset 保留）当成仓位写回
    // 新周期 —— 否则新周期会带着一份没有价格、也拿不到 TP 的仓位永久停摆
    // （review round 5, B）。
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig(P630, 630));
    await strategy.processInitialData(
      createInitialData({
        orderBook: createOrderBook(FRESH_BID0),
        openOrders: [],
        strategyNetPosition: new Decimal(7000),
        orderHistory: [
          createOrder(
            'E630B5D1790848000001',
            OrderSide.BUY,
            OrderStatus.FILLED,
            0.5219,
            3000,
            3000,
            0.5219,
          ),
        ],
      }),
    );

    const internals = strategy as unknown as {
      inventoryQty: Decimal;
      tpFilledQty: Decimal;
      vwap: Decimal;
      _positionUncovered: boolean;
      _recoveredNetPos: Decimal;
      resetLadder: () => void;
      recalculateVWAP: () => void;
    };
    // No TP fill in this fixture, so the recovered GROSS equals the net position.
    expect(internals.inventoryQty.toNumber()).toBe(7000);
    expect(internals._recoveredNetPos.toNumber()).toBe(7000);

    // The 5-min delayed-push budget survives the reset on purpose.
    internals.resetLadder();
    expect(internals._recoveredNetPos.toNumber()).toBe(7000);
    expect(internals.inventoryQty.toNumber()).toBe(0);

    internals.recalculateVWAP();
    expect(internals.inventoryQty.toNumber()).toBe(0);
    expect(internals.vwap.toNumber()).toBe(0);
    expect(internals._positionUncovered).toBe(false);

    // The reset is followed by a re-init with a fresh snapshot (the engine re-fetches
    // the book): the new cycle starts from zero and places its ladder again instead of
    // sitting on a phantom position.
    const fresh = await strategy.processInitialData(
      createInitialData({
        orderBook: createOrderBook(FRESH_BID0),
        openOrders: [],
        strategyNetPosition: new Decimal(0),
        orderHistory: [],
      }),
    );
    expect(internals.inventoryQty.toNumber()).toBe(0);
    expect(internals._positionUncovered).toBe(false);
    expect(findEntrySignals(fresh).length).toBeGreaterThan(0);
  });
});
