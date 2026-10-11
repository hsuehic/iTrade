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
 * Regression pin for the 2026-10-11 strategy-646 incident (JCT/USDT).
 *
 * Proven shape (exchange userTrades + engine log + DB):
 *   - A TP that was still LIVE when the ladder was reset was *forgotten*:
 *     `resetLadder()` nulled `tpClientOrderId`, cleared `this.orders`, and moved
 *     every tracked TP id into `previousCycleOrderIds` (blacklist) while
 *     clearing `_trackedTpIds`.
 *   - The next `refreshTakeProfit()` therefore saw no TP to cancel and placed a
 *     brand-new TP. Result: two live sells (428830 + 700000 against 700000
 *     held) and NO cancel signal ever emitted — matching a production log that
 *     contained only "Order placed" lines, no cancel/update.
 *
 * Invariant pinned here: ids of TPs that are NOT known-terminal at reset time
 * must survive in `_trackedTpIds` (so the pre-placement tracked-TP loop cancels
 * them before any replacement), and must NOT be blacklisted. Ids that are known
 * terminal are still blacklisted.
 */

function createStrategyConfig(): StrategyConfig<LadderEntrySingleTPParameters> {
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
    },
    symbol: 'BTC/USDT',
    exchange: 'okx',
    strategyId: 646,
    strategyName: 'Strategy 646 reset-with-live-TP pin',
    performance: createEmptyPerformance(
      'BTC/USDT',
      'okx',
      646,
      'Strategy 646 reset-with-live-TP pin',
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

function findTpSignals(result: StrategyAnalyzeResult): StrategyOrderResult[] {
  return toSignals(result).filter(
    (s): s is StrategyOrderResult =>
      (s.action === 'buy' || s.action === 'sell') &&
      s.metadata?.signalType === SignalType.TakeProfit,
  );
}

/**
 * Drive the strategy to the "one live tracked TP" state and return its id.
 *
 * `pushNew = false` models the 646 timing exactly: the TP place signal has gone
 * out but the engine's NEW push has NOT been delivered yet (the incident window
 * was ~220 ms wide), so the TP exists only in `_trackedTpIds` /
 * `pendingClientOrderIds` / `tpClientOrderId` — not in `this.orders`.
 */
async function reachLiveTrackedTp(
  strategy: LadderEntrySingleTPStrategy,
  pushNew = true,
): Promise<string> {
  const init = await strategy.processInitialData(createInitialData());
  const entry = toSignals(init).find(
    (s): s is StrategyOrderResult =>
      s.action === 'buy' && s.metadata?.signalType === SignalType.Entry,
  );
  expect(entry).toBeDefined();

  const fillPass = await strategy.analyze(
    createDataUpdate([
      createOrder(
        entry!.clientOrderId,
        OrderSide.BUY,
        OrderStatus.FILLED,
        entry!.price!.toNumber(),
        entry!.quantity!.toNumber(),
      ),
    ]),
  );
  const tpPlaces = findTpSignals(fillPass);
  expect(tpPlaces.length).toBe(1);
  const tpId = tpPlaces[0].clientOrderId;

  // The engine pushes the strategy's own TP back → it becomes a LIVE order in
  // `this.orders` (status NEW), which is what makes it "not known terminal".
  if (pushNew) {
    await strategy.analyze(
      createDataUpdate([
        createOrder(
          tpId,
          OrderSide.SELL,
          OrderStatus.NEW,
          tpPlaces[0].price!.toNumber(),
          tpPlaces[0].quantity!.toNumber(),
        ),
      ]),
    );
  }
  return tpId;
}

describe('LadderEntrySingleTPStrategy — reset must not forget a LIVE TP (strategy 646)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps a still-live TP tracked across resetLadder() instead of blacklisting it', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-11T08:48:00.000Z'));
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
    const tpId = await reachLiveTrackedTp(strategy);

    // Precondition: live TP is tracked and not blacklisted.
    expect(
      (strategy as unknown as { _trackedTpIds: Set<string> })._trackedTpIds.has(tpId),
    ).toBe(true);
    expect(
      (
        strategy as unknown as { previousCycleOrderIds: Set<string> }
      ).previousCycleOrderIds.has(tpId),
    ).toBe(false);

    // The ladder resets while that TP is still live on the venue.
    (strategy as unknown as { resetLadder: () => void }).resetLadder();

    const tracked = (strategy as unknown as { _trackedTpIds: Set<string> })._trackedTpIds;
    const blacklisted = (strategy as unknown as { previousCycleOrderIds: Set<string> })
      .previousCycleOrderIds;

    // The fix: it stays tracked (the pre-placement loop cancels + retries it)...
    expect(tracked.has(tpId)).toBe(true);
    // ...and is NOT treated as belonging to the ended cycle.
    expect(blacklisted.has(tpId)).toBe(false);

    // Behavioural consequence — the signal the 646 production log never had.
    // With inventory present again (as the reinit recovery restores it), the
    // next TP refresh must emit a CANCEL for the carried-over live TP. Before
    // the fix this pass placed a second TP with no cancel at all.
    const internals = strategy as unknown as {
      inventoryQty: Decimal;
      vwap: Decimal;
      refreshTakeProfit: () => StrategyResult[];
    };
    internals.inventoryQty = new Decimal(0.3);
    internals.vwap = new Decimal(101);
    const refresh = internals.refreshTakeProfit();
    const cancels = refresh
      .filter((s) => (s as unknown as { action?: string }).action === 'cancel')
      .map((s) => (s as unknown as { clientOrderId?: string }).clientOrderId);
    expect(cancels).toContain(tpId);
  });

  it('does NOT resurrect a TP that was already terminal at reset time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-11T08:48:00.000Z'));
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
    const tpId = await reachLiveTrackedTp(strategy);

    // The venue confirms the cancel before the reset.
    await strategy.analyze(
      createDataUpdate([
        createOrder(tpId, OrderSide.SELL, OrderStatus.CANCELED, 102, 0.1, 0),
      ]),
    );

    (strategy as unknown as { resetLadder: () => void }).resetLadder();

    const tracked = (strategy as unknown as { _trackedTpIds: Set<string> })._trackedTpIds;
    const blacklisted = (strategy as unknown as { previousCycleOrderIds: Set<string> })
      .previousCycleOrderIds;

    // A terminal TP was already dropped from tracking when its push arrived,
    // so resetLadder has nothing to carry over — it must not be resurrected.
    expect(tracked.has(tpId)).toBe(false);
  });

  it('protects a TP whose place signal went out but NEW push never arrived (646 timing)', async () => {
    vi.useFakeTimers();
    // 08:48:44.877 — the debounce TP place signal has just been emitted; the
    // engine's NEW push is still in flight (the incident window was ~220 ms).
    vi.setSystemTime(new Date('2026-10-11T08:48:44.877Z'));
    const strategy = new LadderEntrySingleTPStrategy(createStrategyConfig());
    const tpId = await reachLiveTrackedTp(strategy, false);

    const internals = strategy as unknown as {
      _trackedTpIds: Set<string>;
      previousCycleOrderIds: Set<string>;
      orders: Map<string, unknown>;
      inventoryQty: Decimal;
      vwap: Decimal;
      resetLadder: () => void;
      refreshTakeProfit: () => StrategyResult[];
    };

    // Tracked from the moment the place signal is emitted, but NOT yet known in
    // `this.orders` — so the status check must treat it as live, not terminal.
    expect(internals._trackedTpIds.has(tpId)).toBe(true);
    expect(internals.orders.has(tpId)).toBe(false);

    internals.resetLadder();

    expect(internals._trackedTpIds.has(tpId)).toBe(true);
    expect(internals.previousCycleOrderIds.has(tpId)).toBe(false);

    internals.inventoryQty = new Decimal(0.3);
    internals.vwap = new Decimal(101);
    const cancels = internals
      .refreshTakeProfit()
      .filter((s) => (s as unknown as { action?: string }).action === 'cancel')
      .map((s) => (s as unknown as { clientOrderId?: string }).clientOrderId);
    expect(cancels).toContain(tpId);
  });
});
