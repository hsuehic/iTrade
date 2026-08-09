import { beforeEach, describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import {
  Kline,
  KlineInterval,
  normalizeAnalyzeResult,
  Order,
  OrderBook,
  OrderSide,
  OrderStatus,
  OrderType,
  Position,
  SignalType,
  StrategyCancelOrderResult,
  StrategyConfig,
  StrategyOrderResult,
  TimeInForce,
} from '@itrade/core';
import {
  MarketMakerGridParameters,
  MarketMakerGridStrategy,
} from '../strategies/MarketMakerGridStrategy';

const SYMBOL = 'ETH/USDC:USDC';

function createOrder(params: {
  clientOrderId: string;
  side: OrderSide;
  price: number;
  quantity: number | Decimal;
  status: OrderStatus;
  executedQuantity?: number | Decimal;
  strategyId?: number;
}): Order {
  const now = new Date();
  return {
    id: `order-${params.clientOrderId}`,
    clientOrderId: params.clientOrderId,
    symbol: SYMBOL,
    exchange: 'binance',
    strategyId: params.strategyId,
    side: params.side,
    type: OrderType.LIMIT,
    quantity: new Decimal(params.quantity),
    price: new Decimal(params.price),
    status: params.status,
    timeInForce: TimeInForce.GTC,
    timestamp: now,
    updateTime: now,
    executedQuantity: new Decimal(params.executedQuantity ?? 0),
    averagePrice: new Decimal(params.price),
  };
}

function createPosition(params: { quantity: number; avgPrice: number }): Position {
  return {
    symbol: SYMBOL,
    side: 'long',
    quantity: new Decimal(params.quantity),
    avgPrice: new Decimal(params.avgPrice),
    markPrice: new Decimal(params.avgPrice),
    unrealizedPnl: new Decimal(0),
    leverage: new Decimal(1),
    timestamp: new Date(),
    exchange: 'binance',
  };
}

function createOrderBook(params: { bid: number; ask: number }): OrderBook {
  return {
    symbol: SYMBOL,
    timestamp: new Date(),
    bids: [[new Decimal(params.bid), new Decimal(1)]],
    asks: [[new Decimal(params.ask), new Decimal(1)]],
  };
}

let klineCounter = 0;

function createKline(params: {
  high: number;
  low: number;
  open?: number;
  close?: number;
  interval?: string;
  isClosed?: boolean;
}): Kline {
  klineCounter += 1;
  const openTime = new Date(Date.now() - 15 * 60 * 1000 + klineCounter * 1000);
  return {
    symbol: SYMBOL,
    interval: (params.interval ?? '15m') as KlineInterval,
    openTime,
    closeTime: new Date(openTime.getTime() + 15 * 60 * 1000),
    open: new Decimal(params.open ?? params.low),
    high: new Decimal(params.high),
    low: new Decimal(params.low),
    close: new Decimal(params.close ?? params.high),
    volume: new Decimal(100),
    quoteVolume: new Decimal(10000),
    trades: 100,
    isClosed: params.isClosed ?? true,
  };
}

function buySignals(result: Awaited<ReturnType<MarketMakerGridStrategy['analyze']>>) {
  return normalizeAnalyzeResult(result).filter(
    (s): s is StrategyOrderResult => s.action === 'buy',
  );
}

function sellSignals(result: Awaited<ReturnType<MarketMakerGridStrategy['analyze']>>) {
  return normalizeAnalyzeResult(result).filter(
    (s): s is StrategyOrderResult => s.action === 'sell',
  );
}

function cancelSignals(result: Awaited<ReturnType<MarketMakerGridStrategy['analyze']>>) {
  return normalizeAnalyzeResult(result).filter(
    (s): s is StrategyCancelOrderResult => s.action === 'cancel',
  );
}

function createStrategy(
  overrides: Partial<MarketMakerGridParameters> = {},
): MarketMakerGridStrategy {
  const config: StrategyConfig<MarketMakerGridParameters> = {
    type: 'MarketMakerGridStrategy',
    strategyId: 1,
    strategyName: 'mm-grid-test',
    symbol: SYMBOL,
    exchange: 'binance',
    parameters: {
      klineInterval: '15m',
      minRangePercent: 0.8,
      levelGapsPercent: '1,5,25',
      levelAllocationsPercent: '50,30,20',
      levelTakeProfitGapsPercent: '',
      takeProfitGapPercent: 0,
      maxInvestment: 1000,
      maxInventory: 100,
      // leverage 1 keeps buying power == maxInvestment for simple size assertions
      leverage: 1,
      ...overrides,
    },
  };
  return new MarketMakerGridStrategy(config);
}

async function initWithOrderBook(
  strategy: MarketMakerGridStrategy,
  params: { bid: number; ask: number },
) {
  return strategy.processInitialData({
    symbol: SYMBOL,
    exchange: 'binance',
    timestamp: new Date(),
    orderBook: createOrderBook(params),
  });
}

describe('MarketMakerGridStrategy', () => {
  let strategy: MarketMakerGridStrategy;

  beforeEach(() => {
    strategy = createStrategy();
  });

  it('places one BUY entry per level when kline range exceeds threshold', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    // Range = (101 - 100) / 100 = 1% >= 0.8% threshold
    const result = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(result);

    expect(buys).toHaveLength(3);

    // Level 0: gap 1% -> price 99, allocation 50% -> 500 quote
    expect(buys[0].price!.toNumber()).toBeCloseTo(99, 8);
    expect(buys[0].quantity!.toNumber()).toBeCloseTo(500 / 99, 8);
    // Level 1: gap 5% -> price 95, allocation 30% -> 300 quote
    expect(buys[1].price!.toNumber()).toBeCloseTo(95, 8);
    expect(buys[1].quantity!.toNumber()).toBeCloseTo(300 / 95, 8);
    // Level 2: gap 25% -> price 75, allocation 20% -> 200 quote
    expect(buys[2].price!.toNumber()).toBeCloseTo(75, 8);
    expect(buys[2].quantity!.toNumber()).toBeCloseTo(200 / 75, 8);

    for (const buy of buys) {
      expect(buy.metadata?.signalType).toBe(SignalType.Entry);
    }
  });

  it('does nothing when kline range is below threshold and no orders are open', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    // Range = 0.5% < 0.8%
    const result = await strategy.analyze({
      klines: [createKline({ high: 100.5, low: 100 })],
    });

    expect(buySignals(result)).toHaveLength(0);
    expect(cancelSignals(result)).toHaveLength(0);
  });

  it('keeps open entries untouched when the signal turns inactive', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const triggerResult = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(triggerResult);
    expect(buys).toHaveLength(3);

    // Exchange confirms the three entry orders
    await strategy.analyze({
      orders: buys.map((buy) =>
        createOrder({
          clientOrderId: buy.clientOrderId,
          side: OrderSide.BUY,
          price: buy.price!.toNumber(),
          quantity: buy.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ),
    });

    // Quiet kline: range 0.2% < 0.8%. Previously this cancelled all three
    // entries; the new behaviour keeps them so wide grid levels (whose
    // prices are far from bid) actually have a chance to fill later.
    const quietResult = await strategy.analyze({
      klines: [createKline({ high: 100.2, low: 100 })],
    });

    expect(cancelSignals(quietResult)).toHaveLength(0);
    expect(buySignals(quietResult)).toHaveLength(0);

    // Entries must still be open - the strategy state retains them.
    const state = strategy.getStrategyState();
    for (const lvl of state.levels) {
      expect(lvl.entryClientOrderId).not.toBeNull();
    }
  });

  it('keeps every entry untouched when any entry partially filled and next kline is quiet', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    // Trigger the grid.
    const triggerResult = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(triggerResult);
    expect(buys).toHaveLength(3);
    const level0Buy = buys[0];

    // Exchange confirms all three entries as NEW.
    await strategy.analyze({
      orders: buys.map((buy) =>
        createOrder({
          clientOrderId: buy.clientOrderId,
          side: OrderSide.BUY,
          price: buy.price!.toNumber(),
          quantity: buy.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ),
    });

    // Level 0 partially fills (half). The other two entries remain untouched.
    const halfQty = level0Buy.quantity!.div(2);
    await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: level0Buy.price!.toNumber(),
          quantity: level0Buy.quantity!,
          executedQuantity: halfQty,
          status: OrderStatus.PARTIALLY_FILLED,
          strategyId: 1,
        }),
      ],
    });

    // Quiet kline arrives while L0 is still PARTIALLY_FILLED with inventory
    // held. The new rule: do not cancel ANY entry (not even L1/L2 which are
    // still NEW). Lifecycle of the partial fill continues via handleOrderUpdates.
    const quietResult = await strategy.analyze({
      klines: [createKline({ high: 100.2, low: 100 })],
    });

    expect(cancelSignals(quietResult)).toHaveLength(0);
    expect(buySignals(quietResult)).toHaveLength(0);
  });

  it('keeps every entry untouched when any entry partially filled and next kline is active', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const triggerResult = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(triggerResult);
    const level0Buy = buys[0];

    // Exchange confirms all three entries.
    await strategy.analyze({
      orders: buys.map((buy) =>
        createOrder({
          clientOrderId: buy.clientOrderId,
          side: OrderSide.BUY,
          price: buy.price!.toNumber(),
          quantity: buy.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ),
    });

    // Level 0 partially fills -> hasActiveCycle() must hold.
    const halfQty = level0Buy.quantity!.div(2);
    await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: level0Buy.price!.toNumber(),
          quantity: level0Buy.quantity!,
          executedQuantity: halfQty,
          status: OrderStatus.PARTIALLY_FILLED,
          strategyId: 1,
        }),
      ],
    });

    // ACTIVE kline (range >= 0.8%) with a moved bid: reprice=false branch must
    // not touch L0 (still partially filled, in-flight inventory) nor L1/L2
    // (their fills could arrive any moment).
    const activeResult = await strategy.analyze({
      orderbook: createOrderBook({ bid: 99, ask: 99.1 }),
      klines: [createKline({ high: 100.5, low: 99.5 })],
    });

    expect(cancelSignals(activeResult)).toHaveLength(0);
    // No new buys either: L0 busy, L1/L2 already have entries open.
    expect(buySignals(activeResult)).toHaveLength(0);
  });

  it('places a take-profit above ask1 after an entry fill', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const triggerResult = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const level0Buy = buySignals(triggerResult)[0];

    const fillResult = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: 99,
          quantity: level0Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level0Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });
    const tps = sellSignals(fillResult);

    expect(tps).toHaveLength(1);
    expect(tps[0].metadata?.signalType).toBe(SignalType.TakeProfit);
    expect(tps[0].quantity!.toNumber()).toBeCloseTo(level0Buy.quantity!.toNumber(), 8);
    // ask1 (100.1) > entry (99), so TP = 100.1 * (1 + 1%) = 101.101
    expect(tps[0].price!.toNumber()).toBeCloseTo(100.1 * 1.01, 8);
  });

  it('floors the take-profit at entry price when ask has dropped below entry', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const triggerResult = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const level0Buy = buySignals(triggerResult)[0];

    // Market dropped: ask now below the 99 entry price
    const fillResult = await strategy.analyze({
      orderbook: createOrderBook({ bid: 98, ask: 98.1 }),
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: 99,
          quantity: level0Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level0Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });
    const tps = sellSignals(fillResult);

    expect(tps).toHaveLength(1);
    // Floored at entryPrice * (1 + 1%) = 99.99, not 98.1 * 1.01
    expect(tps[0].price!.toNumber()).toBeCloseTo(99 * 1.01, 8);
  });

  it('re-enters the level after its take-profit fills while the signal is active', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const triggerResult = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const level0Buy = buySignals(triggerResult)[0];

    const fillResult = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: 99,
          quantity: level0Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level0Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });
    const tp = sellSignals(fillResult)[0];

    const tpFillResult = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: tp.clientOrderId,
          side: OrderSide.SELL,
          price: tp.price!.toNumber(),
          quantity: tp.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: tp.quantity!,
          strategyId: 1,
        }),
      ],
    });
    const reentries = buySignals(tpFillResult);

    // Only level 0 is idle again (levels 1/2 still have their original entries open)
    expect(reentries).toHaveLength(1);
    expect(reentries[0].price!.toNumber()).toBeCloseTo(99, 8);

    const state = strategy.getStrategyState();
    expect(new Decimal(state.inventoryQty).toNumber()).toBeCloseTo(0, 8);
  });

  it('leaves other levels untouched when a TP fills, even if bid moved', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const triggerResult = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(triggerResult);
    const level0Buy = buys[0];

    // Confirm all three entries, then fill level 0's entry
    await strategy.analyze({
      orders: buys.map((buy) =>
        createOrder({
          clientOrderId: buy.clientOrderId,
          side: OrderSide.BUY,
          price: buy.price!.toNumber(),
          quantity: buy.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ),
    });
    const fillResult = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: 99,
          quantity: level0Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level0Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });
    const tp = sellSignals(fillResult)[0];

    // TP fills while the bid has moved down to 99: only level 0 re-enters at the
    // new bid; levels 1/2 keep their original entries (no cancels).
    const tpFillResult = await strategy.analyze({
      orderbook: createOrderBook({ bid: 99, ask: 99.1 }),
      orders: [
        createOrder({
          clientOrderId: tp.clientOrderId,
          side: OrderSide.SELL,
          price: tp.price!.toNumber(),
          quantity: tp.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: tp.quantity!,
          strategyId: 1,
        }),
      ],
    });

    const reentries = buySignals(tpFillResult);
    expect(reentries).toHaveLength(1);
    // The re-entry rides the SAME price L0 filled at earlier (level.lastEntryFillPrice),
    // not the latest bid; that's the conservative "buy the dip back" anchor.
    // A deeper level (L1 or L2) still has an untraded entry on the book, so we
    // re-list L0 at its original fill price 99.
    expect(reentries[0].price!.toNumber()).toBeCloseTo(99, 8);
    expect(cancelSignals(tpFillResult)).toHaveLength(0);
  });

  it('re-anchors all entries at kline close when the grid is clean', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const first = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const firstBuys = buySignals(first);
    await strategy.analyze({
      orders: firstBuys.map((buy) =>
        createOrder({
          clientOrderId: buy.clientOrderId,
          side: OrderSide.BUY,
          price: buy.price!.toNumber(),
          quantity: buy.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ),
    });

    // No fills, no TPs -> clean grid: next kline close re-prices everything
    const second = await strategy.analyze({
      orderbook: createOrderBook({ bid: 99, ask: 99.1 }),
      klines: [createKline({ high: 100, low: 99 })],
    });

    expect(cancelSignals(second)).toHaveLength(3);
    const newBuys = buySignals(second);
    expect(newBuys).toHaveLength(3);
    expect(newBuys[0].price!.toNumber()).toBeCloseTo(99 * 0.99, 8);
    expect(newBuys[1].price!.toNumber()).toBeCloseTo(99 * 0.95, 8);
    expect(newBuys[2].price!.toNumber()).toBeCloseTo(99 * 0.75, 8);
  });

  it('does not touch open entries at kline close while a TP is outstanding', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const first = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const firstBuys = buySignals(first);
    await strategy.analyze({
      orders: firstBuys.map((buy) =>
        createOrder({
          clientOrderId: buy.clientOrderId,
          side: OrderSide.BUY,
          price: buy.price!.toNumber(),
          quantity: buy.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ),
    });

    // Level 0 fills -> TP is now outstanding (active cycle)
    await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: firstBuys[0].clientOrderId,
          side: OrderSide.BUY,
          price: 99,
          quantity: firstBuys[0].quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: firstBuys[0].quantity!,
          strategyId: 1,
        }),
      ],
    });

    // Next kline closes above threshold with a moved bid: levels 1/2 entries
    // must remain untouched (no cancels, no replacements).
    const second = await strategy.analyze({
      orderbook: createOrderBook({ bid: 99, ask: 99.1 }),
      klines: [createKline({ high: 100, low: 99 })],
    });

    expect(cancelSignals(second)).toHaveLength(0);
    expect(buySignals(second)).toHaveLength(0);
  });

  it('still fills an empty level at kline close during an active cycle', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const first = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const firstBuys = buySignals(first);
    await strategy.analyze({
      orders: firstBuys.map((buy) =>
        createOrder({
          clientOrderId: buy.clientOrderId,
          side: OrderSide.BUY,
          price: buy.price!.toNumber(),
          quantity: buy.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ),
    });

    // Level 0 fills (TP outstanding), and level 1's entry is canceled externally
    await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: firstBuys[0].clientOrderId,
          side: OrderSide.BUY,
          price: 99,
          quantity: firstBuys[0].quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: firstBuys[0].quantity!,
          strategyId: 1,
        }),
        createOrder({
          clientOrderId: firstBuys[1].clientOrderId,
          side: OrderSide.BUY,
          price: 95,
          quantity: firstBuys[1].quantity!,
          status: OrderStatus.CANCELED,
          strategyId: 1,
        }),
      ],
    });

    // Next kline: level 1 (no entry) gets a fresh one at the current bid;
    // level 2's entry stays untouched.
    const second = await strategy.analyze({
      orderbook: createOrderBook({ bid: 99, ask: 99.1 }),
      klines: [createKline({ high: 100, low: 99 })],
    });

    expect(cancelSignals(second)).toHaveLength(0);
    const newBuys = buySignals(second);
    expect(newBuys).toHaveLength(1);
    expect(newBuys[0].price!.toNumber()).toBeCloseTo(99 * 0.95, 8);
  });

  it('ignores orderbook events from other symbols', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    // A foreign symbol's orderbook (engine fans out all events to all strategies)
    await strategy.analyze({
      symbol: 'BTC/USDC:USDC',
      orderbook: {
        symbol: 'BTC/USDC:USDC',
        timestamp: new Date(),
        bids: [[new Decimal(50000), new Decimal(1)]],
        asks: [[new Decimal(50001), new Decimal(1)]],
      },
    });

    const result = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(result);

    // Entries must still be anchored on OUR bid (100), not BTC's 50000
    expect(buys).toHaveLength(3);
    expect(buys[0].price!.toNumber()).toBeCloseTo(99, 8);
  });

  it('anchors entries on the kline close when no orderbook stream exists', async () => {
    // No orderbook at all (e.g. subscription misconfigured in production)
    await strategy.processInitialData({
      symbol: SYMBOL,
      exchange: 'binance',
      timestamp: new Date(),
    });

    const result = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100, close: 100.4 })],
    });
    const buys = buySignals(result);

    expect(buys).toHaveLength(3);
    expect(buys[0].price!.toNumber()).toBeCloseTo(100.4 * 0.99, 8);
    expect(buys[1].price!.toNumber()).toBeCloseTo(100.4 * 0.95, 8);
    expect(buys[2].price!.toNumber()).toBeCloseTo(100.4 * 0.75, 8);
  });

  it('re-enters after a TP fill using the fill price when the orderbook is stale', async () => {
    await strategy.processInitialData({
      symbol: SYMBOL,
      exchange: 'binance',
      timestamp: new Date(),
    });

    const triggerResult = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100, close: 100.4 })],
    });
    const level0Buy = buySignals(triggerResult)[0];

    const fillResult = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: level0Buy.price!.toNumber(),
          quantity: level0Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level0Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });
    const tp = sellSignals(fillResult)[0];
    expect(tp).toBeDefined();

    const tpFillResult = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: tp.clientOrderId,
          side: OrderSide.SELL,
          price: tp.price!.toNumber(),
          quantity: tp.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: tp.quantity!,
          strategyId: 1,
        }),
      ],
    });
    const reentries = buySignals(tpFillResult);

    // Anchored on the LEVEL's last entry fill price (= 99.396 here), not on
    // the TP fill price. Deeper levels (L1/L2) still have entries on the book
    // (they were placed in the trigger step and never touched in the test), so
    // the strategy re-lists L0 at its original BUY price.
    expect(reentries).toHaveLength(1);
    expect(reentries[0].price!.toNumber()).toBeCloseTo(99.396, 6);
  });

  it('enforces maxInventory including open BUY orders', async () => {
    strategy = createStrategy({ maxInventory: 6 });
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const result = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(result);

    // L0 target = 500/99 ≈ 5.0505 fits; L1 target = 300/95 ≈ 3.158 gets clamped
    // to remaining capacity; L2 has no capacity left.
    expect(buys.length).toBeLessThanOrEqual(3);
    const totalQty = buys.reduce((acc, b) => acc.add(b.quantity!), new Decimal(0));
    expect(totalQty.toNumber()).toBeLessThanOrEqual(6 + 1e-9);
    expect(buys[0].quantity!.toNumber()).toBeCloseTo(500 / 99, 8);
    expect(buys[1].quantity!.toNumber()).toBeCloseTo(6 - 500 / 99, 8);
  });

  it('encodes the level index in generated clientOrderIds', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });
    const result = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(result);
    expect(buys.map((b) => b.clientOrderId.slice(-2))).toEqual(['L0', 'L1', 'L2']);
  });

  it('re-attaches suffixed TP orders and keeps suffixed entries across a restart', async () => {
    // L1's TP (level suffix L1) and L2's entry (suffix L2) survive the restart
    const openTp = createOrder({
      clientOrderId: 'T1D8D1710000000L1',
      side: OrderSide.SELL,
      price: 105,
      quantity: 3,
      status: OrderStatus.NEW,
      strategyId: 1,
    });
    const openEntry = createOrder({
      clientOrderId: 'E1D7D1710000000L2',
      side: OrderSide.BUY,
      price: 75,
      quantity: 2.6,
      status: OrderStatus.NEW,
      strategyId: 1,
    });

    const initResult = await strategy.processInitialData({
      symbol: SYMBOL,
      exchange: 'binance',
      timestamp: new Date(),
      openOrders: [openTp, openEntry],
      orderBook: createOrderBook({ bid: 100, ask: 100.1 }),
      strategyNetPosition: new Decimal(3),
    });

    // Nothing canceled, no recovery TP needed (TP covers the inventory)
    expect(cancelSignals(initResult)).toHaveLength(0);
    expect(
      normalizeAnalyzeResult(initResult).filter((s) => s.action === 'sell'),
    ).toHaveLength(0);

    const state = strategy.getStrategyState();
    expect(state.levels[1].tpClientOrderId).toBe(openTp.clientOrderId);
    expect(new Decimal(state.levels[1].inventoryQty).toNumber()).toBeCloseTo(3, 8);
    // Cost basis derived from TP price / (1 + 5% level gap) = 105 / 1.05 = 100
    expect(new Decimal(state.levels[1].avgEntryPrice!).toNumber()).toBeCloseTo(100, 8);
    expect(state.levels[2].entryClientOrderId).toBe(openEntry.clientOrderId);

    // Next trigger: only L0 gets a fresh entry. L1 is blocked by its attached TP,
    // L2's kept entry stays untouched (active cycle -> no repricing).
    const triggerResult = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(triggerResult);
    expect(buys).toHaveLength(1);
    expect(buys[0].clientOrderId.endsWith('L0')).toBe(true);
    expect(buys[0].price!.toNumber()).toBeCloseTo(99, 8);
    expect(cancelSignals(triggerResult)).toHaveLength(0);
  });

  it('cancels stale entries and adopts take-profit orders on restart', async () => {
    const staleEntry = createOrder({
      clientOrderId: 'E1D7D1710000000',
      side: OrderSide.BUY,
      price: 95,
      quantity: 2,
      status: OrderStatus.NEW,
      strategyId: 1,
    });
    const openTp = createOrder({
      clientOrderId: 'T1D8D1710000000',
      side: OrderSide.SELL,
      price: 105,
      quantity: 1.5,
      status: OrderStatus.NEW,
      strategyId: 1,
    });

    const result = await strategy.processInitialData({
      symbol: SYMBOL,
      exchange: 'binance',
      timestamp: new Date(),
      openOrders: [staleEntry, openTp],
      orderBook: createOrderBook({ bid: 100, ask: 100.1 }),
      strategyNetPosition: new Decimal(1.5),
    });

    const cancels = cancelSignals(result);
    expect(cancels).toHaveLength(1);
    expect(cancels[0].clientOrderId).toBe(staleEntry.clientOrderId);

    const state = strategy.getStrategyState();
    expect(new Decimal(state.inventoryQty).toNumber()).toBeCloseTo(1.5, 8);
  });

  it('multiplies buying power by leverage when sizing entries', async () => {
    strategy = createStrategy({ leverage: 5, maxInventory: 1000 });
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const result = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(result);

    expect(buys).toHaveLength(3);
    // Buying power = 1000 * 5 = 5000; level 0 gets 50% = 2500 quote at price 99
    expect(buys[0].quantity!.toNumber()).toBeCloseTo(2500 / 99, 8);
    expect(buys[1].quantity!.toNumber()).toBeCloseTo(1500 / 95, 8);
    expect(buys[2].quantity!.toNumber()).toBeCloseTo(1000 / 75, 8);
  });

  it('uses per-level take-profit gaps when levelTakeProfitGapsPercent is set', async () => {
    strategy = createStrategy({ levelTakeProfitGapsPercent: '0.2,0.5,2' });
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const triggerResult = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const level0Buy = buySignals(triggerResult)[0];

    const fillResult = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: 99,
          quantity: level0Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level0Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });
    const tps = sellSignals(fillResult);

    expect(tps).toHaveLength(1);
    // Level 0 TP gap is 0.2% (not the 1% entry gap): 100.1 * 1.002
    expect(tps[0].price!.toNumber()).toBeCloseTo(100.1 * 1.002, 8);

    const state = strategy.getStrategyState();
    expect(state.levels.map((l) => l.tpGapPercent)).toEqual(['0.2', '0.5', '2']);
  });

  it('applies a single levelTakeProfitGapsPercent value to all levels', async () => {
    strategy = createStrategy({ levelTakeProfitGapsPercent: '0.3' });
    const state = strategy.getStrategyState();
    expect(state.levels.map((l) => l.tpGapPercent)).toEqual(['0.3', '0.3', '0.3']);
  });

  it('rejects a levelTakeProfitGapsPercent count that does not match the levels', () => {
    expect(() => createStrategy({ levelTakeProfitGapsPercent: '0.2,0.5' })).toThrow(
      /levelTakeProfitGapsPercent/,
    );
  });

  it('prefers per-level TP gap over the global takeProfitGapPercent', async () => {
    strategy = createStrategy({
      levelTakeProfitGapsPercent: '0.2,0.5,2',
      takeProfitGapPercent: 9,
    });
    const state = strategy.getStrategyState();
    expect(state.levels.map((l) => l.tpGapPercent)).toEqual(['0.2', '0.5', '2']);
  });

  it('places a recovery TP for inventory not covered by adopted TP orders on restart', async () => {
    // Net position 2.0 but only 1.5 is covered by an open TP:
    // 0.5 filled while the strategy was down and must be re-listed.
    const openTp = createOrder({
      clientOrderId: 'T1D8D1710000000',
      side: OrderSide.SELL,
      price: 105,
      quantity: 1.5,
      status: OrderStatus.NEW,
      strategyId: 1,
    });

    const result = await strategy.processInitialData({
      symbol: SYMBOL,
      exchange: 'binance',
      timestamp: new Date(),
      openOrders: [openTp],
      orderBook: createOrderBook({ bid: 100, ask: 100.1 }),
      strategyNetPosition: new Decimal(2),
    });

    const tps = normalizeAnalyzeResult(result).filter(
      (s): s is StrategyOrderResult => s.action === 'sell',
    );
    expect(tps).toHaveLength(1);
    expect(tps[0].quantity!.toNumber()).toBeCloseTo(0.5, 8);
    // Entry price unknown -> priced off ask1 with level 0's TP gap (1%)
    expect(tps[0].price!.toNumber()).toBeCloseTo(100.1 * 1.01, 8);

    const state = strategy.getStrategyState();
    expect(new Decimal(state.levels[0].inventoryQty).toNumber()).toBeCloseTo(0.5, 8);
  });

  it('prices the recovery TP from the exchange position avgPrice when above ask', async () => {
    // Position basis 102 > ask 100.1: TP must be floored at 102 * (1 + 1%)
    const result = await strategy.processInitialData({
      symbol: SYMBOL,
      exchange: 'binance',
      timestamp: new Date(),
      openOrders: [],
      positions: [createPosition({ quantity: 2, avgPrice: 102 })],
      orderBook: createOrderBook({ bid: 100, ask: 100.1 }),
      strategyNetPosition: new Decimal(2),
    });

    const tps = normalizeAnalyzeResult(result).filter(
      (s): s is StrategyOrderResult => s.action === 'sell',
    );
    expect(tps).toHaveLength(1);
    expect(tps[0].quantity!.toNumber()).toBeCloseTo(2, 8);
    expect(tps[0].price!.toNumber()).toBeCloseTo(102 * 1.01, 8);
  });

  it('drops phantom inventory when the exchange reports no open position', async () => {
    // SQL says 2 units, but position data is present and shows no position:
    // the position was closed externally. Selling would open a short -> drop.
    const result = await strategy.processInitialData({
      symbol: SYMBOL,
      exchange: 'binance',
      timestamp: new Date(),
      openOrders: [],
      positions: [],
      orderBook: createOrderBook({ bid: 100, ask: 100.1 }),
      strategyNetPosition: new Decimal(2),
    });

    const tps = normalizeAnalyzeResult(result).filter(
      (s): s is StrategyOrderResult => s.action === 'sell',
    );
    expect(tps).toHaveLength(0);

    const state = strategy.getStrategyState();
    expect(new Decimal(state.inventoryQty).toNumber()).toBeCloseTo(0, 8);
    expect(new Decimal(state.levels[0].inventoryQty).toNumber()).toBeCloseTo(0, 8);
  });

  it('clamps the recovery TP to the sellable excess of the exchange position', async () => {
    // SQL says 2, exchange holds 1.8, and 1.5 is already covered by an adopted TP:
    // only 0.3 is sellable; the phantom 0.2 is dropped.
    const openTp = createOrder({
      clientOrderId: 'T1D8D1710000000',
      side: OrderSide.SELL,
      price: 105,
      quantity: 1.5,
      status: OrderStatus.NEW,
      strategyId: 1,
    });

    const result = await strategy.processInitialData({
      symbol: SYMBOL,
      exchange: 'binance',
      timestamp: new Date(),
      openOrders: [openTp],
      positions: [createPosition({ quantity: 1.8, avgPrice: 102 })],
      orderBook: createOrderBook({ bid: 100, ask: 100.1 }),
      strategyNetPosition: new Decimal(2),
    });

    const tps = normalizeAnalyzeResult(result).filter(
      (s): s is StrategyOrderResult => s.action === 'sell',
    );
    expect(tps).toHaveLength(1);
    expect(tps[0].quantity!.toNumber()).toBeCloseTo(0.3, 8);
    expect(tps[0].price!.toNumber()).toBeCloseTo(102 * 1.01, 8);

    const state = strategy.getStrategyState();
    expect(new Decimal(state.inventoryQty).toNumber()).toBeCloseTo(1.8, 8);
  });

  it('falls back to the latest entry order price for the recovery cost basis', async () => {
    // No position data; a stale entry order at 101 provides the basis.
    const staleEntry = createOrder({
      clientOrderId: 'E1D7D1710000000',
      side: OrderSide.BUY,
      price: 101,
      quantity: 2,
      status: OrderStatus.NEW,
      strategyId: 1,
    });

    const result = await strategy.processInitialData({
      symbol: SYMBOL,
      exchange: 'binance',
      timestamp: new Date(),
      openOrders: [staleEntry],
      orderBook: createOrderBook({ bid: 100, ask: 100.1 }),
      strategyNetPosition: new Decimal(1),
    });

    const tps = normalizeAnalyzeResult(result).filter(
      (s): s is StrategyOrderResult => s.action === 'sell',
    );
    expect(tps).toHaveLength(1);
    // basis 101 > ask 100.1 -> TP = 101 * (1 + 1%)
    expect(tps[0].price!.toNumber()).toBeCloseTo(101 * 1.01, 8);
    // The stale entry is still canceled
    expect(cancelSignals(result)).toHaveLength(1);
  });

  it('re-lists a canceled adopted TP no lower than its original price', async () => {
    const openTp = createOrder({
      clientOrderId: 'T1D8D1710000000',
      side: OrderSide.SELL,
      price: 105,
      quantity: 1.5,
      status: OrderStatus.NEW,
      strategyId: 1,
    });

    await strategy.processInitialData({
      symbol: SYMBOL,
      exchange: 'binance',
      timestamp: new Date(),
      openOrders: [openTp],
      orderBook: createOrderBook({ bid: 100, ask: 100.1 }),
      strategyNetPosition: new Decimal(1.5),
    });

    // The adopted TP is canceled externally (e.g. by the user on the exchange)
    const result = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: openTp.clientOrderId!,
          side: OrderSide.SELL,
          price: 105,
          quantity: 1.5,
          status: OrderStatus.CANCELED,
          strategyId: 1,
        }),
      ],
    });

    const tps = sellSignals(result);
    expect(tps).toHaveLength(1);
    expect(tps[0].quantity!.toNumber()).toBeCloseTo(1.5, 8);
    // Derived basis = 105 / 1.01, so the new TP is back at ~105, not ask*(1+1%)
    expect(tps[0].price!.toNumber()).toBeCloseTo(105, 6);
  });

  it('deducts adopted TP notional from buying power when placing new entries', async () => {
    // Adopted TP: 4 units @ 105 = 420 quote already deployed.
    const openTp = createOrder({
      clientOrderId: 'T1D8D1710000000',
      side: OrderSide.SELL,
      price: 105,
      quantity: 4,
      status: OrderStatus.NEW,
      strategyId: 1,
    });

    await strategy.processInitialData({
      symbol: SYMBOL,
      exchange: 'binance',
      timestamp: new Date(),
      openOrders: [openTp],
      orderBook: createOrderBook({ bid: 100, ask: 100.1 }),
      strategyNetPosition: new Decimal(4),
    });

    const result = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(result);

    // Budget = 1000 - 420 = 580: L0 gets its full 500, L1 is clamped to 80, L2 skipped
    expect(buys).toHaveLength(2);
    expect(buys[0].quantity!.mul(buys[0].price!).toNumber()).toBeCloseTo(500, 6);
    expect(buys[1].quantity!.mul(buys[1].price!).toNumber()).toBeCloseTo(80, 6);
  });

  it('captures fills carried on a cancel acknowledgment and places a TP for them', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const triggerResult = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const level0Buy = buySignals(triggerResult)[0];

    // No PARTIALLY_FILLED update was ever received; the cancel carries the fill.
    const cancelResult = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: 99,
          quantity: level0Buy.quantity!,
          status: OrderStatus.CANCELED,
          executedQuantity: 1,
          strategyId: 1,
        }),
      ],
    });
    const tps = sellSignals(cancelResult);

    expect(tps).toHaveLength(1);
    expect(tps[0].quantity!.toNumber()).toBeCloseTo(1, 8);

    const state = strategy.getStrategyState();
    expect(new Decimal(state.inventoryQty).toNumber()).toBeCloseTo(1, 8);
  });

  it('ignores a stale PARTIALLY_FILLED replay after the entry already reached CANCELED', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const triggerResult = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const level0Buy = buySignals(triggerResult)[0];

    // 1) Exchange reports a partial fill of 0.5
    await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: 99,
          quantity: level0Buy.quantity!,
          status: OrderStatus.PARTIALLY_FILLED,
          executedQuantity: 0.5,
          strategyId: 1,
        }),
      ],
    });
    let state = strategy.getStrategyState();
    expect(new Decimal(state.inventoryQty).toNumber()).toBeCloseTo(0.5, 8);

    // 2) Entry is canceled; the cancel ack carries the same executedQuantity=0.5
    await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: 99,
          quantity: level0Buy.quantity!,
          status: OrderStatus.CANCELED,
          executedQuantity: 0.5,
          strategyId: 1,
        }),
      ],
    });
    state = strategy.getStrategyState();
    expect(new Decimal(state.inventoryQty).toNumber()).toBeCloseTo(0.5, 8);

    // 3) Stale replay of the earlier PARTIALLY_FILLED update must be ignored
    const replayResult = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: 99,
          quantity: level0Buy.quantity!,
          status: OrderStatus.PARTIALLY_FILLED,
          executedQuantity: 0.5,
          strategyId: 1,
        }),
      ],
    });

    state = strategy.getStrategyState();
    expect(new Decimal(state.inventoryQty).toNumber()).toBeCloseTo(0.5, 8);
    // No additional TP should be generated for the replayed fill
    expect(sellSignals(replayResult)).toHaveLength(0);
  });

  it('supports single-level configuration matching the classic 0.2% market maker', async () => {
    strategy = createStrategy({
      levelGapsPercent: '0.2',
      levelAllocationsPercent: '',
      maxInvestment: 990,
    });
    await initWithOrderBook(strategy, { bid: 1000, ask: 1000.5 });

    const result = await strategy.analyze({
      klines: [createKline({ high: 1010, low: 1000 })],
    });
    const buys = buySignals(result);

    expect(buys).toHaveLength(1);
    // bid1 * (1 - 0.2%) = 998
    expect(buys[0].price!.toNumber()).toBeCloseTo(998, 8);
    expect(buys[0].quantity!.toNumber()).toBeCloseTo(990 / 998, 8);
  });

  it('does NOT re-list L0 after TP fill when every deeper entry already FILLED (deepest chain exhausted)', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    // Trigger: places L0/L1/L2 entry BUYs
    const triggerResult = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(triggerResult);
    expect(buys).toHaveLength(3);
    const level0Buy = buys[0];
    const level1Buy = buys[1];
    const level2Buy = buys[2];

    // Exchange acknowledges all three as NEW.
    await strategy.analyze({
      orders: buys.map((buy) =>
        createOrder({
          clientOrderId: buy.clientOrderId,
          side: OrderSide.BUY,
          price: buy.price!.toNumber(),
          quantity: buy.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ),
    });

    // L0 fills -> TP placed
    const fill0 = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: level0Buy.price!.toNumber(),
          quantity: level0Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level0Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });
    const tp0 = sellSignals(fill0)[0];
    expect(tp0).toBeDefined();

    // Deeper levels fill: L1 -> TP
    const fill1 = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level1Buy.clientOrderId,
          side: OrderSide.BUY,
          price: level1Buy.price!.toNumber(),
          quantity: level1Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level1Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });
    expect(sellSignals(fill1)[0]).toBeDefined();

    // L2 (deepest) also fills -> TP. Now NO level has an unfilled entry left;
    // every level has either an outstanding TP or nothing.
    const fill2 = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level2Buy.clientOrderId,
          side: OrderSide.BUY,
          price: level2Buy.price!.toNumber(),
          quantity: level2Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level2Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });
    expect(sellSignals(fill2)[0]).toBeDefined();

    // Now L0's TP fills. With every deeper level's entry already filled (i.e.
    // nothing deeper still has an OPEN entry hanging), the new rule says: do
    // NOT re-list L0. The cycle is meant to exhaust itself when the deeper
    // chains unwind.
    const tp0FillResult = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: tp0.clientOrderId,
          side: OrderSide.SELL,
          price: tp0.price!.toNumber(),
          quantity: tp0.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: tp0.quantity!,
          strategyId: 1,
        }),
      ],
    });

    expect(buySignals(tp0FillResult)).toHaveLength(0);
    expect(cancelSignals(tp0FillResult)).toHaveLength(0);
  });

  it('re-lists L0 at its ORIGINAL entry price after TP fill while deeper entries are still NEW', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const triggerResult = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(triggerResult);
    const level0Buy = buys[0];
    const level0Price = level0Buy.price!.toNumber(); // 99

    await strategy.analyze({
      orders: buys.map((buy) =>
        createOrder({
          clientOrderId: buy.clientOrderId,
          side: OrderSide.BUY,
          price: buy.price!.toNumber(),
          quantity: buy.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ),
    });

    // L0 fills -> TP placed
    const fillResult = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level0Buy.clientOrderId,
          side: OrderSide.BUY,
          price: level0Price,
          quantity: level0Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level0Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });
    const tp = sellSignals(fillResult)[0];

    // Market has moved on: bid now 97.5 (far below L0's original 99 fill).
    // L1 / L2 entries are still NEW (never touched).
    const tpFillResult = await strategy.analyze({
      orderbook: createOrderBook({ bid: 97.5, ask: 97.6 }),
      orders: [
        createOrder({
          clientOrderId: tp.clientOrderId,
          side: OrderSide.SELL,
          price: tp.price!.toNumber(),
          quantity: tp.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: tp.quantity!,
          strategyId: 1,
        }),
      ],
    });

    const reentries = buySignals(tpFillResult);
    expect(reentries).toHaveLength(1);
    // Re-entry anchored at the ORIGINAL L0 entry fill price 99, NOT at the
    // latest bid (97.5). That's the "buy the dip back" semantics.
    expect(reentries[0].price!.toNumber()).toBeCloseTo(level0Price, 8);
    expect(cancelSignals(tpFillResult)).toHaveLength(0);
  });

  it('deepest level (L2) never re-enters via TP unwind, allowing the cycle to terminate', async () => {
    await initWithOrderBook(strategy, { bid: 100, ask: 100.1 });

    const triggerResult = await strategy.analyze({
      klines: [createKline({ high: 101, low: 100 })],
    });
    const buys = buySignals(triggerResult);
    const level2Buy = buys[2];

    await strategy.analyze({
      orders: buys.map((buy) =>
        createOrder({
          clientOrderId: buy.clientOrderId,
          side: OrderSide.BUY,
          price: buy.price!.toNumber(),
          quantity: buy.quantity!,
          status: OrderStatus.NEW,
          strategyId: 1,
        }),
      ),
    });

    // L2 fills -> TP
    const fillResult = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: level2Buy.clientOrderId,
          side: OrderSide.BUY,
          price: level2Buy.price!.toNumber(),
          quantity: level2Buy.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: level2Buy.quantity!,
          strategyId: 1,
        }),
      ],
    });
    const tp = sellSignals(fillResult)[0];

    // L2 TP fills. L0/L1 entries are still NEW on the book, but L2 itself has
    // nothing deeper, so hasDeeperOpenEntry(L2) must be false -> no re-list.
    const tpFillResult = await strategy.analyze({
      orders: [
        createOrder({
          clientOrderId: tp.clientOrderId,
          side: OrderSide.SELL,
          price: tp.price!.toNumber(),
          quantity: tp.quantity!,
          status: OrderStatus.FILLED,
          executedQuantity: tp.quantity!,
          strategyId: 1,
        }),
      ],
    });

    expect(buySignals(tpFillResult)).toHaveLength(0);
    // L0 / L1 entries must remain untouched (no cancels).
    expect(cancelSignals(tpFillResult)).toHaveLength(0);

    // Level 2 state has cleaned up (inventory zeroed after TP fill).
    const state = strategy.getStrategyState();
    expect(state.levels[2].entryClientOrderId).toBeNull();
    expect(state.levels[2].tpClientOrderId).toBeNull();
    expect(state.levels[2].inventoryQty).toBe('0');
  });
});
