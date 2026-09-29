import { describe, it, expect, vi } from 'vitest';
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
  isUpdateOrderResult,
  StrategyUpdateOrderResult,
} from '@itrade/core';

/**
 * Regression tests for the Strategy 609 oversell
 * (2026-09-23, `2026-09-WLD-L-9`, WLDUSDC perp → net position -15000).
 *
 * Two identical TP sells (15000 @ 0.4202) were live at the same time and BOTH
 * filled against 15000 of inventory. Root causes covered here:
 *
 *   1. TP orders carried no `reduceOnly` → nothing stopped the second sell from
 *      opening a short position.
 *   2. `refreshTakeProfit()` dropped `tpClientOrderId` WITHOUT emitting a cancel
 *      when the TP metadata was missing → the previous TP stayed live on the
 *      exchange, invisible to the strategy, and a second TP was placed.
 *   3. A terminal push whose metadata had been reconstructed from the
 *      clientOrderId prefix (`ensureRecoveredMetadata`) was treated as "our
 *      current TP ended" → spurious TP refresh.
 */

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function createStrategyConfig(
  params: Partial<LadderEntrySingleTPParameters> = {},
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
    strategyId: 1,
    strategyName: 'Strategy 609 regression',
    performance: createEmptyPerformance('BTC/USDT', 'okx', 1, 'Strategy 609 regression'),
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

function createInitialData(): InitialDataResult {
  return {
    symbol: 'BTC/USDT',
    exchange: 'okx',
    timestamp: new Date(),
    orderBook: createOrderBook(),
  };
}

function createDataUpdate(orders: Order[]): DataUpdate {
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

function findNewTpSignals(result: StrategyAnalyzeResult): StrategyOrderResult[] {
  return toSignals(result).filter(
    (s): s is StrategyOrderResult =>
      (s.action === 'buy' || s.action === 'sell') &&
      s.metadata?.signalType === SignalType.TakeProfit,
  );
}

function findTpUpdateSignals(result: StrategyAnalyzeResult): StrategyUpdateOrderResult[] {
  return toSignals(result).filter(
    (s): s is StrategyUpdateOrderResult =>
      isUpdateOrderResult(s) && s.metadata?.signalType === SignalType.TakeProfit,
  );
}

function findCancelSignals(result: StrategyAnalyzeResult) {
  return toSignals(result).filter((s) => s.action === 'cancel');
}

/** Fill the first ladder entry and return the TP order the strategy placed. */
async function fillFirstEntry(strategy: LadderEntrySingleTPStrategy) {
  const initResult = await strategy.processInitialData(createInitialData());
  const entry = findEntrySignals(initResult)[0];
  const price = entry.price!.toNumber();

  const fill = createOrder(
    entry.clientOrderId!,
    OrderSide.BUY,
    OrderStatus.FILLED,
    price,
    entry.quantity!.toNumber(),
    entry.quantity!.toNumber(),
    price,
  );

  const result = await strategy.analyze(createDataUpdate([fill]));
  const tp = findNewTpSignals(result)[0];
  expect(tp).toBeDefined();
  // The same analyze() call also places the next ladder entry (sequential mode).
  const nextEntry = findEntrySignals(result).find(
    (s) => s.clientOrderId !== entry.clientOrderId,
  );
  return { entry, fill, tp, nextEntry };
}

// ──────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────

describe('LadderEntrySingleTPStrategy — Strategy 609 oversell guards', () => {
  describe('Fix 1: TP orders are risk-reducing (reduceOnly)', () => {
    it('marks the placed TP SELL order as reduceOnly', async () => {
      const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
      const { tp } = await fillFirstEntry(strategy);

      expect(tp.action).toBe('sell');
      expect(tp.reduceOnly).toBe(true);
    });

    it('keeps reduceOnly on the cancel+replace (update) path', async () => {
      const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
      const { tp, nextEntry } = await fillFirstEntry(strategy);
      expect(nextEntry).toBeDefined();

      // Let the exchange confirm the TP (engine pushes the created order back).
      await strategy.analyze(
        createDataUpdate([
          createOrder(
            tp.clientOrderId!,
            OrderSide.SELL,
            OrderStatus.NEW,
            tp.price!.toNumber(),
            tp.quantity!.toNumber(),
          ),
        ]),
      );

      // Second entry fills at a different price → VWAP changes → TP must be
      // re-priced. The engine implements this as cancel+replace, so the
      // replacement order needs its own reduceOnly flag.
      const fill = createOrder(
        nextEntry!.clientOrderId!,
        OrderSide.BUY,
        OrderStatus.FILLED,
        nextEntry!.price!.toNumber(),
        nextEntry!.quantity!.toNumber(),
        nextEntry!.quantity!.toNumber(),
        nextEntry!.price!.toNumber(),
      );

      const result = await strategy.analyze(createDataUpdate([fill]));
      const updates = findTpUpdateSignals(result);

      expect(updates.length).toBeGreaterThanOrEqual(1);
      expect(updates[0].reduceOnly).toBe(true);
      expect(updates[0].clientOrderId).toBe(tp.clientOrderId);
    });
  });

  describe('Fix 3: a TP reference is never dropped without a cancel', () => {
    it('cancels an unknown-state TP before placing a new one (the 609 hole)', async () => {
      const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
      const { tp, nextEntry } = await fillFirstEntry(strategy);
      const firstTpId = tp.clientOrderId!;
      expect(nextEntry).toBeDefined();

      // Reproduce the 609 state exactly: `tpClientOrderId` is still set and the
      // id is still "pending", but its metadata is gone (no signal-time record)
      // → the old code silently deleted the reference and placed a second,
      // identical TP.
      const internal = strategy as unknown as {
        orderMetadataMap: Map<string, unknown>;
        pendingClientOrderIds: Set<string>;
        _trackedTpIds: Set<string>;
      };
      internal.orderMetadataMap.delete(firstTpId);
      expect(internal.pendingClientOrderIds.has(firstTpId)).toBe(true);

      // A further entry fill triggers refreshTakeProfit.
      const fill = createOrder(
        nextEntry!.clientOrderId!,
        OrderSide.BUY,
        OrderStatus.FILLED,
        nextEntry!.price!.toNumber(),
        nextEntry!.quantity!.toNumber(),
        nextEntry!.quantity!.toNumber(),
        nextEntry!.price!.toNumber(),
      );
      const result = await strategy.analyze(createDataUpdate([fill]));

      // MUST cancel the orphaned TP before placing the replacement.
      const cancels = findCancelSignals(result);
      expect(cancels.some((c) => c.clientOrderId === firstTpId)).toBe(true);

      const newTps = findNewTpSignals(result);
      expect(newTps).toHaveLength(1);
      expect(newTps[0].clientOrderId).not.toBe(firstTpId);
      expect(newTps[0].reduceOnly).toBe(true);

      // The orphan stays tracked until a terminal push confirms the cancel.
      expect(internal._trackedTpIds.has(firstTpId)).toBe(true);
    });

    it('cancels a ghost TP before the safety net replaces it (609 trigger)', async () => {
      const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
      const { tp } = await fillFirstEntry(strategy);
      const tpId = tp.clientOrderId!;

      // The 609 window: the strategy holds a TP reference it can no longer
      // resolve locally (creation push not received yet) — the old safety net
      // simply dropped the reference and placed a second TP 3.2s later while
      // the first was already live on the exchange.
      const internal = strategy as unknown as {
        pendingClientOrderIds: Set<string>;
        tpClientOrderId: string | null;
      };
      internal.pendingClientOrderIds.delete(tpId);

      const result = await strategy.analyze(
        createDataUpdate([
          createOrder(`E1D${1790172799999}`, OrderSide.BUY, OrderStatus.NEW, 99, 0.1),
        ]),
      );

      // The cancel must be issued...
      expect(findCancelSignals(result).some((c) => c.clientOrderId === tpId)).toBe(true);
      // ...and the replacement must WAIT. "Cancel sent" is not "cancel
      // confirmed": placing a second TP now is exactly how 609 got two live TPs
      // filling against 15000 of inventory. The reference survives and later
      // cycles retry (bounded by the 5-attempt cap, then give-up unlocks it).
      expect(internal.tpClientOrderId).toBe(tpId);
      expect(findNewTpSignals(result)).toHaveLength(0);

      // Once the exchange confirms the cancel (terminal push), the replacement
      // is unlocked.
      const after = await strategy.analyze(
        createDataUpdate([
          createOrder(tpId, OrderSide.SELL, OrderStatus.CANCELED, 102, 0.1),
        ]),
      );
      const newTps = findNewTpSignals(after);
      expect(newTps).toHaveLength(1);
      expect(newTps[0].clientOrderId).not.toBe(tpId);
      expect(newTps[0].reduceOnly).toBe(true);
    });

    it('tracks every signalled TP until a terminal push arrives', async () => {
      const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
      const { tp } = await fillFirstEntry(strategy);

      const internal = strategy as unknown as { _trackedTpIds: Set<string> };
      expect(internal._trackedTpIds.has(tp.clientOrderId!)).toBe(true);
      expect(internal._trackedTpIds.size).toBe(1);

      // Terminal confirmation clears the tracking entry.
      await strategy.analyze(
        createDataUpdate([
          createOrder(
            tp.clientOrderId!,
            OrderSide.SELL,
            OrderStatus.CANCELED,
            0,
            tp.quantity!.toNumber(),
          ),
        ]),
      );
      expect(internal._trackedTpIds.has(tp.clientOrderId!)).toBe(false);
    });
  });

  describe('Fix 4: recovered metadata cannot drive a TP refresh', () => {
    it('ignores a terminal push for a TP this strategy never signalled', async () => {
      const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
      await fillFirstEntry(strategy);

      // A CANCELED push for an id that was never signalled by this process and
      // has no metadata — the strategy has to infer "TP" from the `T1D` prefix.
      const foreignTpId = `T1D${1790172796407}`;
      const result = await strategy.analyze(
        createDataUpdate([
          createOrder(foreignTpId, OrderSide.SELL, OrderStatus.CANCELED, 102, 0.1),
        ]),
      );

      // Inventory is still unsold, but the push carries no real intent: placing
      // a second TP here is exactly the 609 duplicate.
      expect(findNewTpSignals(result)).toHaveLength(0);
    });

    it('still refreshes the TP when the CURRENT tracked TP is cancelled', async () => {
      const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
      const { tp } = await fillFirstEntry(strategy);

      const result = await strategy.analyze(
        createDataUpdate([
          createOrder(
            tp.clientOrderId!,
            OrderSide.SELL,
            OrderStatus.CANCELED,
            0,
            tp.quantity!.toNumber(),
          ),
        ]),
      );

      const newTps = findNewTpSignals(result);
      expect(newTps).toHaveLength(1);
      expect(newTps[0].reduceOnly).toBe(true);
    });
  });

  describe('Review must-fix regressions (609 follow-up)', () => {
    it('refreshes when a recovered terminal push arrives and no live TP remains', async () => {
      // Restart-race must-fix: after a restart the process has not learned
      // which TP is live, so the real current TP comes back as recovered
      // metadata. Suppressing its terminal event would strand the position.
      const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
      await fillFirstEntry(strategy);

      const priv = strategy as unknown as {
        tpClientOrderId: string | null;
        _trackedTpIds: Set<string>;
        _logger: { warn: (msg: string) => void };
      };
      const warnSpy = vi.fn();
      priv._logger = { ...priv._logger, warn: warnSpy };
      priv.tpClientOrderId = null;
      priv._trackedTpIds.clear();

      const foreignTpId = `T1D${1790172796407}`;
      const result = await strategy.analyze(
        createDataUpdate([
          createOrder(foreignTpId, OrderSide.SELL, OrderStatus.CANCELED, 102, 0.1),
        ]),
      );

      // The guard branch itself must not fire: with no live TP left, suppressing
      // the refresh would be wrong. (Asserted on the branch, not just on the TP
      // count — the analyze-level safety net would also place a TP, so a count
      // assertion alone would be vacuous.)
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('skipping TP refresh'),
      );
      expect(findNewTpSignals(result)).toHaveLength(1);
    });

    it('still suppresses the refresh when a recovered push arrives while a live TP exists', async () => {
      const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
      await fillFirstEntry(strategy);

      const priv = strategy as unknown as {
        _logger: { warn: (msg: string) => void };
      };
      const warnSpy = vi.fn();
      priv._logger = { ...priv._logger, warn: warnSpy };

      const foreignTpId = `T1D${1790172796407}`;
      await strategy.analyze(
        createDataUpdate([
          createOrder(foreignTpId, OrderSide.SELL, OrderStatus.CANCELED, 102, 0.1),
        ]),
      );

      // Here the live TP is tracked, so the guard must engage (the 609 case).
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('skipping TP refresh'),
      );
    });

    it('cancels a tracked TP whose local reference was lost (orphan guard)', async () => {
      const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
      const { tp } = await fillFirstEntry(strategy);
      const orphanId = tp.clientOrderId!;

      const priv = strategy as unknown as {
        tpClientOrderId: string | null;
        _trackedTpIds: Set<string>;
        _pendingCancelTpIds: Set<string>;
        pendingClientOrderIds: Set<string>;
        cancelAllTpOrders: (reason: string) => StrategyResult[];
      };
      // 609 state: we signalled the order and never saw it terminate, but every
      // local reference to it is gone. It is still LIVE on the exchange.
      priv.tpClientOrderId = null;
      priv.pendingClientOrderIds.delete(orphanId);
      priv._pendingCancelTpIds.delete(orphanId);
      expect(priv._trackedTpIds.has(orphanId)).toBe(true);

      const signals = priv.cancelAllTpOrders('test_orphan_reference_lost');
      const cancelled = signals
        .filter((s) => s.action === 'cancel')
        .map((s) => s.clientOrderId);

      expect(cancelled).toContain(orphanId);
    });
  });

  describe('Review must-fix regressions (609 second pass — GLM/Opus)', () => {
    it('retries an unconfirmed TP cancel on a later refresh (tracked loop, GLM ①)', async () => {
      const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
      const { tp } = await fillFirstEntry(strategy);
      const tpId = tp.clientOrderId!;

      const priv = strategy as unknown as {
        tpClientOrderId: string | null;
        _trackedTpIds: Set<string>;
        _pendingCancelTpIds: Set<string>;
        pendingClientOrderIds: Set<string>;
        _tpCancelAttempts: Map<string, { count: number; lastAt: number }>;
      };
      // 609 "ghost" state: the cancel was requested but never confirmed. Only
      // the tracked loop can still reach this id (the current-TP branch and the
      // pending sweep are both out of play), so it is the retry path under test.
      priv.tpClientOrderId = null;
      priv.pendingClientOrderIds.delete(tpId);
      priv._pendingCancelTpIds.add(tpId);
      priv._tpCancelAttempts.set(tpId, { count: 1, lastAt: Date.now() - 600_000 });

      const result = await strategy.analyze(
        createDataUpdate([
          createOrder(`E1D${1790172799999}`, OrderSide.BUY, OrderStatus.NEW, 99, 0.1),
        ]),
      );

      // The old code `continue`d past every id that was already in
      // _pendingCancelTpIds, so a failed cancel was never retried and the ghost
      // TP stayed live forever. It must be re-cancelled here.
      expect(findCancelSignals(result).some((c) => c.clientOrderId === tpId)).toBe(true);
    });

    it('keeps a TP tracked when a cancel-failure REJECTED arrives (GLM ①/Opus M1)', async () => {
      const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
      const { tp } = await fillFirstEntry(strategy);
      const tpId = tp.clientOrderId!;

      const priv = strategy as unknown as {
        _trackedTpIds: Set<string>;
        _pendingCancelTpIds: Set<string>;
      };
      // A cancel is in flight for this TP…
      priv._pendingCancelTpIds.add(tpId);

      // …and the engine reports REJECTED because the cancel itself failed (e.g.
      // a network error). The order is STILL LIVE on the exchange.
      await strategy.analyze(
        createDataUpdate([
          createOrder(tpId, OrderSide.SELL, OrderStatus.REJECTED, 102, 0.1),
        ]),
      );

      // Untracking here is what killed the retry path in 609.
      expect(priv._trackedTpIds.has(tpId)).toBe(true);
      expect(priv._pendingCancelTpIds.has(tpId)).toBe(true);
    });

    it('still untracks a TP on REJECTED when no cancel was requested', async () => {
      const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
      const { tp } = await fillFirstEntry(strategy);
      const tpId = tp.clientOrderId!;

      const priv = strategy as unknown as {
        _trackedTpIds: Set<string>;
        _pendingCancelTpIds: Set<string>;
      };
      priv._pendingCancelTpIds.delete(tpId);

      // A rejection of the ORDER itself (not of a cancel) is real proof that
      // nothing is live — the guard must not swallow it.
      await strategy.analyze(
        createDataUpdate([
          createOrder(tpId, OrderSide.SELL, OrderStatus.REJECTED, 102, 0.1),
        ]),
      );

      expect(priv._trackedTpIds.has(tpId)).toBe(false);
    });

    it('books a fill for a blacklisted TP whose cancel was never confirmed (GLM ②)', async () => {
      const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
      const { tp } = await fillFirstEntry(strategy);
      const tpId = tp.clientOrderId!;
      const tpPrice = tp.price!.toNumber();
      const tpQty = tp.quantity!.toNumber();

      const priv = strategy as unknown as {
        previousCycleOrderIds: Set<string>;
        _pendingCancelTpIds: Set<string>;
        _tpCancelAttempts: Map<string, { count: number; lastAt: number }>;
      };
      // 609's TP_B: cycle-switched (blacklisted) AFTER a cancel was requested
      // that never got confirmed, and it was live all along.
      priv.previousCycleOrderIds.add(tpId);
      priv._pendingCancelTpIds.add(tpId);
      // Review round 2: booking is now gated on a RECENT cancel attempt.
      priv._tpCancelAttempts.set(tpId, { count: 1, lastAt: Date.now() });

      const result = await strategy.analyze(
        createDataUpdate([
          createOrder(
            tpId,
            OrderSide.SELL,
            OrderStatus.FILLED,
            tpPrice,
            tpQty,
            tpQty,
            tpPrice,
          ),
        ]),
      );

      // Swallowing this push left the ledger over-stating inventory, which is
      // how a second full-size TP gets placed. The fill must end the cycle.
      expect(findEntrySignals(result).length).toBeGreaterThanOrEqual(1);
    });

    it('does NOT book a stale (TTL-expired) pending-cancel fill (GLM ②/Opus ①)', async () => {
      const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
      const { tp } = await fillFirstEntry(strategy);
      const tpId = tp.clientOrderId!;
      const priv = strategy as unknown as {
        previousCycleOrderIds: Set<string>;
        _pendingCancelTpIds: Set<string>;
        _tpCancelAttempts: Map<string, { count: number; lastAt: number }>;
      };
      priv.previousCycleOrderIds.add(tpId);
      priv._pendingCancelTpIds.add(tpId);
      // A give-up id stays in _pendingCancelTpIds for the whole process, so an
      // ancient push must not be booked into the current cycle.
      priv._tpCancelAttempts.set(tpId, { count: 5, lastAt: Date.now() - 11 * 60 * 1000 });

      const result = await strategy.analyze(
        createDataUpdate([
          createOrder(
            tpId,
            OrderSide.SELL,
            OrderStatus.FILLED,
            tp.price!.toNumber(),
            tp.quantity!.toNumber(),
            tp.quantity!.toNumber(),
            tp.price!.toNumber(),
          ),
        ]),
      );
      expect(findEntrySignals(result).length).toBe(0);
    });

    it('give-up stops tracking the id but keeps the booking window open (GLM ①/⑤)', async () => {
      const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
      const { tp } = await fillFirstEntry(strategy);
      const tpId = tp.clientOrderId!;
      const priv = strategy as unknown as {
        previousCycleOrderIds: Set<string>;
        _pendingCancelTpIds: Set<string>;
        _trackedTpIds: Set<string>;
        _tpCancelAttempts: Map<string, { count: number; lastAt: number }>;
        cancelTrackedTp: (
          id: string,
          reason: string,
          signals: unknown[],
          sent: Set<string>,
        ) => boolean;
      };
      priv._pendingCancelTpIds.add(tpId);
      priv._tpCancelAttempts.set(tpId, { count: 4, lastAt: 0 });

      const sent = new Set<string>();
      const ok = priv.cancelTrackedTp(tpId, 'test_give_up', [], sent);

      expect(ok).toBe(true); // the 5th attempt is still sent
      expect(priv.previousCycleOrderIds.has(tpId)).toBe(true); // blacklisted
      expect(priv._trackedTpIds.has(tpId)).toBe(false); // no more orphan-sweep churn
      expect(priv._pendingCancelTpIds.has(tpId)).toBe(true); // TTL anchor kept
      expect(priv._tpCancelAttempts.get(tpId)?.count).toBe(5);
    });

    it('unified limiter accumulates attempts and never resets them (round 3, Opus)', async () => {
      const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
      const { tp } = await fillFirstEntry(strategy);
      const tpId = tp.clientOrderId!;
      const priv = strategy as unknown as {
        _tpCancelAttempts: Map<string, { count: number; lastAt: number }>;
        cancelTrackedTp: (
          id: string,
          r: string,
          s: unknown[],
          sent: Set<string>,
        ) => boolean;
        noteUnconfirmedCancelTp: (id: string) => void;
      };

      let emitted = 0;
      for (let i = 0; i < 6; i++) {
        const rec = priv._tpCancelAttempts.get(tpId);
        if (rec) rec.lastAt = 0; // behave as if the 5s cooldown had elapsed
        emitted += priv.cancelTrackedTp(tpId, 'test_limit', [], new Set<string>())
          ? 1
          : 0;
      }
      expect(emitted).toBe(5); // bounded, never unbounded
      expect(priv._tpCancelAttempts.get(tpId)?.count).toBe(5);

      // Implied cancels (order update / ghost replace) must not reset the count.
      priv.noteUnconfirmedCancelTp(tpId);
      expect(priv._tpCancelAttempts.get(tpId)?.count).toBe(5);
    });

    it('implied cancels record a timestamp once, never overwrite (round 3, GLM N1)', async () => {
      const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
      const priv = strategy as unknown as {
        _tpCancelAttempts: Map<string, { count: number; lastAt: number }>;
        noteUnconfirmedCancelTp: (id: string) => void;
      };
      const id = 'T609D99D1790000000001';
      priv.noteUnconfirmedCancelTp(id);
      expect(priv._tpCancelAttempts.get(id)?.count).toBe(1);
      priv._tpCancelAttempts.set(id, { count: 3, lastAt: 5 });
      priv.noteUnconfirmedCancelTp(id);
      expect(priv._tpCancelAttempts.get(id)?.count).toBe(3);
    });

    it('does not forget a ghost TP while its cancel is unconfirmed (round 4, Opus ①)', async () => {
      const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
      const { tp } = await fillFirstEntry(strategy);
      const tpId = tp.clientOrderId!;
      const priv = strategy as unknown as {
        tpClientOrderId: string | null;
        orders: Map<string, unknown>;
        pendingClientOrderIds: Set<string>;
        _tpCancelAttempts: Map<string, { count: number; lastAt: number }>;
      };
      // Make the tracked TP look like a ghost: no creation push / no pending mark.
      priv.pendingClientOrderIds.delete(tpId);
      priv.orders.delete(tpId);
      // A cancel is already in flight (cooldown active) but unconfirmed.
      priv._tpCancelAttempts.set(tpId, { count: 1, lastAt: Date.now() });

      await strategy.analyze(
        createDataUpdate([
          createOrder('E1D1790172796000', OrderSide.BUY, OrderStatus.NEW, 0.42, 0.1),
        ]),
      );

      // The reference must survive: dropping it here would forget a TP that may
      // still be live on the exchange — the 609 duplicate-TP bug.
      expect(priv.tpClientOrderId).toBe(tpId);
    });

    it('clears the ghost reference once the cancel limiter gives up (round 4, Opus ①)', async () => {
      const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
      const { tp } = await fillFirstEntry(strategy);
      const tpId = tp.clientOrderId!;
      const priv = strategy as unknown as {
        tpClientOrderId: string | null;
        orders: Map<string, unknown>;
        pendingClientOrderIds: Set<string>;
        previousCycleOrderIds: Set<string>;
        _tpCancelAttempts: Map<string, { count: number; lastAt: number }>;
      };
      priv.pendingClientOrderIds.delete(tpId);
      priv.orders.delete(tpId);
      // Limiter already exhausted → give-up: dropping the reference is safe.
      priv._tpCancelAttempts.set(tpId, { count: 5, lastAt: 0 });

      await strategy.analyze(
        createDataUpdate([
          createOrder('E1D1790172796001', OrderSide.BUY, OrderStatus.NEW, 0.42, 0.1),
        ]),
      );

      // Give-up: the stale reference is dropped and a fresh TP takes its place.
      expect(priv.tpClientOrderId).not.toBe(tpId);
    });

    it('does not clear a ghost reference merely because a cancel was emitted (round 5, Opus ①)', async () => {
      const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
      const { tp } = await fillFirstEntry(strategy);
      const tpId = tp.clientOrderId!;
      const priv = strategy as unknown as {
        tpClientOrderId: string | null;
        orders: Map<string, unknown>;
        pendingClientOrderIds: Set<string>;
        _pendingCancelTpIds: Set<string>;
        _tpCancelAttempts: Map<string, { count: number; lastAt: number }>;
      };
      // First time this ghost is seen: nothing in flight, no attempt recorded.
      priv.pendingClientOrderIds.delete(tpId);
      priv.orders.delete(tpId);
      priv._pendingCancelTpIds.delete(tpId);
      priv._tpCancelAttempts.delete(tpId);

      await strategy.analyze(
        createDataUpdate([
          createOrder('E1D1790172796002', OrderSide.BUY, OrderStatus.NEW, 0.42, 0.1),
        ]),
      );

      expect(priv._pendingCancelTpIds.has(tpId)).toBe(true); // cancel WAS emitted
      // ...but "sent" is not "confirmed": no terminal push has been processed,
      // so the reference must survive (otherwise a second TP may be placed while
      // the old one is still live — the 609 race).
      expect(priv.tpClientOrderId).toBe(tpId);
    });

    it('keeps re-driving the ghost cancel until give-up, even when already pending (round 6, GLM ①)', async () => {
      const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
      const { tp } = await fillFirstEntry(strategy);
      const tpId = tp.clientOrderId!;
      const priv = strategy as unknown as {
        tpClientOrderId: string | null;
        orders: Map<string, unknown>;
        pendingClientOrderIds: Set<string>;
        previousCycleOrderIds: Set<string>;
        _pendingCancelTpIds: Set<string>;
        _tpCancelAttempts: Map<string, { count: number; lastAt: number }>;
      };
      priv.pendingClientOrderIds.delete(tpId);
      priv.orders.delete(tpId);
      // Already "in flight" from an earlier attempt, cooldown elapsed, one short of
      // the cap. A guard skipping ids already in _pendingCancelTpIds would freeze
      // the count here forever → an unbounded wait whenever the CANCELED push was
      // lost (exactly the case the guard was meant to handle).
      priv._pendingCancelTpIds.add(tpId);
      priv._tpCancelAttempts.set(tpId, { count: 4, lastAt: 0 });

      await strategy.analyze(
        createDataUpdate([
          createOrder('E1D1790172796003', OrderSide.BUY, OrderStatus.NEW, 0.42, 0.1),
        ]),
      );

      // 5th attempt fired → give-up → the reference is released.
      expect(priv._tpCancelAttempts.get(tpId)?.count).toBe(5);
      expect(priv.previousCycleOrderIds.has(tpId)).toBe(true);
      expect(priv.tpClientOrderId).not.toBe(tpId);
    });
  });
});
