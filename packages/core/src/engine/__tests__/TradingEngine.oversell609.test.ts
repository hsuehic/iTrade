import { EventEmitter } from 'events';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Decimal from 'decimal.js';
import { TradingEngine } from '../TradingEngine';
import { EventBus } from '../../events';
import type {
  IExchange,
  IRiskManager,
  IPortfolioManager,
  ILogger,
  IStrategy,
} from '../../interfaces';
import {
  Order,
  OrderStatus,
  OrderSide,
  OrderType,
  TimeInForce,
  StrategyConfig,
  StrategyParameters,
  RiskLimits,
  createEmptyPerformance,
  SignalType,
  SignalMetaData,
  StrategyOrderResult,
  StrategyUpdateOrderResult,
} from '../../types';

/**
 * Regression tests for the Strategy 609 oversell — engine side
 * (2026-09-23, `2026-09-WLD-L-9`, WLDUSDC perp → net position -15000).
 *
 *  - Fix 2: before placing an EXIT order, the engine reconciles against the
 *    exchange and cancels this strategy's own still-live orders on the same
 *    symbol+side, so a TP that lost its local reference can never sit in the
 *    book next to its replacement.
 *    NOTE (2026-10-01, strategy 631): the gate is exit intent, NOT the exchange
 *    `reduceOnly` flag. No strategy sets that flag any more (a reduceOnly SELL is
 *    rejected with -2022 when it would not purely reduce the account net
 *    position), so gating this reconciliation on it would have made the guard
 *    dead code and reopened the 609 window. The tests below therefore cover
 *    BOTH entry points: an explicit `dedupeExit` param and a TP signal whose
 *    metadata carries `signalType: TakeProfit` with no reduceOnly.
 *  - Fix 5: a failed cancel must never rewrite an already-executed order as
 *    REJECTED (that is how the second, genuinely filled TP ended up stored as
 *    REJECTED while keeping executedQuantity=15000).
 */

class TestExchange extends EventEmitter {
  name = 'mockExchange';
  isConnected = true;
  openOrders: Order[] = [];
  createOrderSpy = vi.fn();
  cancelOrderSpy = vi.fn();
  cancelOrderError: Error | null = null;

  async connect() {
    return;
  }
  async disconnect() {
    return;
  }
  async getOpenOrders(_symbol?: string) {
    return this.openOrders;
  }
  async getSymbolInfo(symbol: string) {
    return {
      symbol,
      nativeSymbol: 'BTCUSDT',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      minQuantity: new Decimal(0.001),
      maxQuantity: new Decimal(1_000_000),
      stepSize: new Decimal(0.001),
      tickSize: new Decimal(0.0001),
      minNotional: new Decimal(1),
      pricePrecision: 4,
      quantityPrecision: 3,
      status: 'active' as const,
      market: 'spot' as const,
    };
  }
  async getOrder(symbol: string, orderId: string, clientOrderId?: string) {
    // Return the REAL live order when we have it: the cancel+replace path reads
    // `side` (and the reconciliation compares quantity/price against it).
    const live = this.openOrders.find(
      (order) =>
        order.id === orderId ||
        (clientOrderId !== undefined && order.clientOrderId === clientOrderId),
    );
    return (live ??
      createOrder({ id: orderId, clientOrderId, symbol })) as unknown as Order;
  }
  async createOrder(
    symbol: string,
    side: OrderSide,
    type: OrderType,
    quantity: Decimal,
    price?: Decimal,
    timeInForce?: TimeInForce,
    clientOrderId?: string,
    options?: Record<string, unknown>,
  ): Promise<Order> {
    this.createOrderSpy(
      symbol,
      side,
      type,
      quantity,
      price,
      timeInForce,
      clientOrderId,
      options,
    );
    return {
      id: `order-${clientOrderId ?? Date.now()}`,
      clientOrderId: clientOrderId ?? `client-${Date.now()}`,
      symbol,
      side,
      type,
      quantity,
      price,
      status: OrderStatus.NEW,
      timeInForce: timeInForce ?? TimeInForce.GTC,
      timestamp: new Date(),
      exchange: this.name,
    };
  }
  async cancelOrder(symbol: string, orderId: string, clientOrderId?: string) {
    this.cancelOrderSpy(symbol, orderId, clientOrderId);
    if (this.cancelOrderError) {
      throw this.cancelOrderError;
    }
    return {
      id: orderId,
      clientOrderId,
      symbol,
      side: OrderSide.SELL,
      type: OrderType.LIMIT,
      quantity: new Decimal(0),
      status: OrderStatus.CANCELED,
      timeInForce: TimeInForce.GTC,
      timestamp: new Date(),
      exchange: this.name,
    } as Order;
  }
}

class TestStrategy implements Partial<IStrategy> {
  strategyType = 'TestStrategy';
  config: StrategyConfig<StrategyParameters>;
  strategyName = 'test-strategy';

  constructor(strategyId = 1) {
    this.config = {
      type: this.strategyType,
      parameters: {},
      symbol: 'BTC/USDT',
      exchange: 'mockExchange',
      strategyId,
      strategyName: 'test-strategy',
      performance: createEmptyPerformance(
        'BTC/USDT',
        'mockExchange',
        strategyId,
        'test-strategy',
      ),
    };
  }

  async analyze() {
    return { action: 'hold' } as const;
  }
  getStrategyId() {
    return this.config.strategyId;
  }
}

function createLogger(): ILogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    logTrade: vi.fn(),
    logStrategy: vi.fn(),
    logOrder: vi.fn(),
    logRisk: vi.fn(),
  } as unknown as ILogger;
}

function createOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    clientOrderId: `T1D1790172796407`,
    symbol: 'BTC/USDT',
    side: OrderSide.SELL,
    type: OrderType.LIMIT,
    quantity: new Decimal(15000),
    price: new Decimal(0.4202),
    status: OrderStatus.NEW,
    timeInForce: TimeInForce.GTC,
    timestamp: new Date(),
    updateTime: new Date(),
    exchange: 'mockExchange',
    strategyId: 1,
    ...overrides,
  };
}

describe('TradingEngine — Strategy 609 oversell guards', () => {
  let engine: TradingEngine;
  let exchange: TestExchange;
  let logger: ILogger;
  let eventBus: EventBus;

  beforeEach(async () => {
    exchange = new TestExchange();
    logger = createLogger();
    eventBus = EventBus.getInstance();

    const riskManager = {
      limits: {
        maxPositionSize: new Decimal(1e9),
        maxDailyLoss: new Decimal(1e9),
        maxDrawdown: new Decimal(1),
        maxOpenPositions: 100,
        maxLeverage: new Decimal(100),
      } as RiskLimits,
      checkOrderRisk: vi.fn().mockResolvedValue(true),
      checkPositionRisk: vi.fn().mockResolvedValue(true),
    } as unknown as IRiskManager;

    const portfolioManager = {
      getPositions: vi.fn().mockResolvedValue([]),
      getBalances: vi.fn().mockResolvedValue([]),
    } as unknown as IPortfolioManager;

    engine = new TradingEngine(riskManager, portfolioManager, logger);
    await engine.addExchange('mockExchange', exchange as unknown as IExchange);
    await engine.addStrategy(
      'test-strategy',
      new TestStrategy(1) as unknown as IStrategy,
    );
    await engine.start();
  });

  describe('Fix 2: reconcile duplicate exits against the exchange', () => {
    it("cancels this strategy's own live SELL orders before placing a reduceOnly exit", async () => {
      exchange.openOrders = [
        createOrder({
          id: 'dup-1',
          clientOrderId: 'T1D1790172796407',
          side: OrderSide.SELL,
        }),
        // Another strategy on the same account/symbol — must NOT be touched.
        createOrder({
          id: 'other-strategy',
          clientOrderId: 'T2D1790172796407',
          side: OrderSide.SELL,
        }),
        // Same strategy, but a BUY entry — must NOT be cancelled either.
        createOrder({
          id: 'entry-1',
          clientOrderId: 'E1D1790172796407',
          side: OrderSide.BUY,
        }),
      ];

      await engine.executeOrder({
        strategyName: 'test-strategy',
        symbol: 'BTC/USDT',
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        quantity: new Decimal(15000),
        price: new Decimal(0.4202),
        clientOrderId: 'T1D1790172800589',
        reduceOnly: true,
      });

      expect(exchange.cancelOrderSpy).toHaveBeenCalledTimes(1);
      expect(exchange.cancelOrderSpy).toHaveBeenCalledWith(
        'BTC/USDT',
        'dup-1',
        'T1D1790172796407',
      );
    });

    it('does NOT cancel a same-side strategy order of a different size (legit concurrent exit)', async () => {
      // Review must-fix: same-side alone is too broad. A ladder may keep a
      // second live exit (another level / stop-loss) — cancelling it would
      // delete the position's only way out.
      exchange.openOrders = [
        createOrder({
          id: 'other-leg',
          clientOrderId: 'T1D1790172700000',
          quantity: new Decimal(8000),
        }),
      ];

      await engine.executeOrder({
        strategyName: 'test-strategy',
        symbol: 'BTC/USDT',
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        quantity: new Decimal(15000),
        price: new Decimal(0.4202),
        clientOrderId: 'T1D1790172800589',
        reduceOnly: true,
      });

      expect(exchange.cancelOrderSpy).not.toHaveBeenCalled();
    });

    it('does NOT cancel a same-side, same-size strategy order at a different price', async () => {
      exchange.openOrders = [
        createOrder({
          id: 'other-price',
          clientOrderId: 'T1D1790172700001',
          price: new Decimal(0.51),
        }),
      ];

      await engine.executeOrder({
        strategyName: 'test-strategy',
        symbol: 'BTC/USDT',
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        quantity: new Decimal(15000),
        price: new Decimal(0.4202),
        clientOrderId: 'T1D1790172800589',
        reduceOnly: true,
      });

      expect(exchange.cancelOrderSpy).not.toHaveBeenCalled();
    });

    it('does NOT cancel when the live order is on a different symbol', async () => {
      // Defence in depth for connectors whose getOpenOrders ignores the symbol
      // filter (Coinbase returns the whole account).
      exchange.openOrders = [
        createOrder({
          id: 'other-symbol',
          clientOrderId: 'T1D1790172700002',
          symbol: 'ETH/USDT',
        }),
      ];

      await engine.executeOrder({
        strategyName: 'test-strategy',
        symbol: 'BTC/USDT',
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        quantity: new Decimal(15000),
        price: new Decimal(0.4202),
        clientOrderId: 'T1D1790172800589',
        reduceOnly: true,
      });

      expect(exchange.cancelOrderSpy).not.toHaveBeenCalled();
    });

    it('passes reduceOnly through to the exchange for risk-reducing orders', async () => {
      await engine.executeOrder({
        strategyName: 'test-strategy',
        symbol: 'BTC/USDT',
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        quantity: new Decimal(15000),
        price: new Decimal(0.4202),
        clientOrderId: 'T1D1790172800589',
        reduceOnly: true,
      });

      const options = exchange.createOrderSpy.mock.calls[0][7] as Record<string, unknown>;
      expect(options.reduceOnly).toBe(true);
    });

    it('does not reconcile when the order is not risk-reducing', async () => {
      exchange.openOrders = [
        createOrder({ id: 'dup-1', clientOrderId: 'T1D1790172796407' }),
      ];

      await engine.executeOrder({
        strategyName: 'test-strategy',
        symbol: 'BTC/USDT',
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        quantity: new Decimal(15000),
        price: new Decimal(0.4202),
        clientOrderId: 'T1D1790172800589',
      });

      expect(exchange.cancelOrderSpy).not.toHaveBeenCalled();
    });

    it('reconciles an exit order that carries dedupeExit WITHOUT reduceOnly (631 re-key)', async () => {
      // Strategy 631: TPs no longer send reduceOnly (the exchange rejected them
      // with -2022), so the duplicate-exit guard must be armed by exit intent.
      // On the pre-2026-10-01 gate (`if (reduceOnly)`) this assertion fails:
      // no cancel is issued at all.
      exchange.openOrders = [
        createOrder({
          id: 'dup-1',
          clientOrderId: 'T1D1790172796407',
          side: OrderSide.SELL,
        }),
      ];

      await engine.executeOrder({
        strategyName: 'test-strategy',
        symbol: 'BTC/USDT',
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        quantity: new Decimal(15000),
        price: new Decimal(0.4202),
        clientOrderId: 'T1D1790172800589',
        dedupeExit: true,
      });

      expect(exchange.cancelOrderSpy).toHaveBeenCalledTimes(1);
      expect(exchange.cancelOrderSpy).toHaveBeenCalledWith(
        'BTC/USDT',
        'dup-1',
        'T1D1790172796407',
      );
    });

    it('derives dedupeExit from a TakeProfit signal (no reduceOnly on the wire)', async () => {
      // The production path: a strategy TP signal. Its metadata.signalType is
      // TakeProfit and it carries no reduceOnly — the engine must still
      // reconcile, and must NOT send reduceOnly to the exchange.
      exchange.openOrders = [
        createOrder({
          id: 'dup-1',
          clientOrderId: 'T1D1790172796407',
          side: OrderSide.SELL,
        }),
      ];

      const signal: StrategyOrderResult = {
        action: 'sell',
        symbol: 'BTC/USDT',
        quantity: new Decimal(15000),
        price: new Decimal(0.4202),
        type: OrderType.LIMIT,
        clientOrderId: 'T1D1790172800589',
        metadata: { signalType: SignalType.TakeProfit } as SignalMetaData,
      };

      await (
        engine as unknown as {
          executeStrategySignal: (
            strategyName: string,
            symbol: string,
            signal: StrategyOrderResult,
          ) => Promise<void>;
        }
      ).executeStrategySignal('test-strategy', 'BTC/USDT', signal);

      expect(exchange.cancelOrderSpy).toHaveBeenCalledTimes(1);
      // The cancel must happen BEFORE the replacement is placed.
      expect(exchange.cancelOrderSpy.mock.invocationCallOrder[0]).toBeLessThan(
        exchange.createOrderSpy.mock.invocationCallOrder[0],
      );
      const options = exchange.createOrderSpy.mock.calls[0][7] as Record<string, unknown>;
      expect(options.reduceOnly).toBeUndefined();
      // `dedupeExit` is an engine-only flag (like strategyName) and must not
      // leak into the exchange call's options (review R3 glm NIT-2).
      expect(options.dedupeExit).toBeUndefined();
    });

    it('does NOT arm the reconciliation for an Entry signal', async () => {
      // Entry orders legitimately sit next to each other in a ladder — arming
      // the guard for them would cancel live ladder levels.
      exchange.openOrders = [
        createOrder({
          id: 'same-entry-size',
          clientOrderId: 'E1D1790172796407',
          side: OrderSide.SELL,
        }),
      ];

      const signal: StrategyOrderResult = {
        action: 'sell',
        symbol: 'BTC/USDT',
        quantity: new Decimal(15000),
        price: new Decimal(0.4202),
        type: OrderType.LIMIT,
        clientOrderId: 'E1D1790172800589',
        metadata: { signalType: SignalType.Entry } as SignalMetaData,
      };

      await (
        engine as unknown as {
          executeStrategySignal: (
            strategyName: string,
            symbol: string,
            signal: StrategyOrderResult,
          ) => Promise<void>;
        }
      ).executeStrategySignal('test-strategy', 'BTC/USDT', signal);

      expect(exchange.cancelOrderSpy).not.toHaveBeenCalled();
    });

    it('does not send reduceOnly to the exchange when it is not set', async () => {
      // Closes the adapter-level question for the 631 fix: the engine must not
      // synthesise the flag for a plain sell.
      await engine.executeOrder({
        strategyName: 'test-strategy',
        symbol: 'BTC/USDT',
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        quantity: new Decimal(15000),
        price: new Decimal(0.4202),
        clientOrderId: 'T1D1790172800589',
        dedupeExit: true,
      });

      const options = exchange.createOrderSpy.mock.calls[0][7] as Record<string, unknown>;
      expect(options.reduceOnly).toBeUndefined();
    });

    it('stays UNARMED when metadata has no signalType (fail closed)', async () => {
      // R2 review M1: the guard cancels live orders, so an unrecognised signal
      // must not arm it. On the earlier rule (`!== Entry`) this assertion fails.
      exchange.openOrders = [
        createOrder({
          id: 'dup-1',
          clientOrderId: 'T1D1790172796407',
          side: OrderSide.SELL,
        }),
      ];

      const signal: StrategyOrderResult = {
        action: 'sell',
        symbol: 'BTC/USDT',
        quantity: new Decimal(15000),
        price: new Decimal(0.4202),
        type: OrderType.LIMIT,
        clientOrderId: 'T1D1790172800589',
        metadata: {} as SignalMetaData,
      };

      await (
        engine as unknown as {
          executeStrategySignal: (
            strategyName: string,
            symbol: string,
            signal: StrategyOrderResult,
          ) => Promise<void>;
        }
      ).executeStrategySignal('test-strategy', 'BTC/USDT', signal);

      expect(exchange.cancelOrderSpy).not.toHaveBeenCalled();
    });

    it('does NOT cancel a same-size order when our own price is unknown (market exit)', async () => {
      // R2 review m4: two same-size market exits have no price to compare, so a
      // duplicate cannot be PROVEN. Unprovable must mean untouched.
      const getOpenOrdersSpy = vi.spyOn(exchange, 'getOpenOrders');
      exchange.openOrders = [
        createOrder({
          id: 'no-price',
          clientOrderId: 'T1D1790172796407',
          side: OrderSide.SELL,
          quantity: new Decimal(15000),
          price: undefined,
        }),
      ];

      await engine.executeOrder({
        strategyName: 'test-strategy',
        symbol: 'BTC/USDT',
        side: OrderSide.SELL,
        type: OrderType.MARKET,
        quantity: new Decimal(15000),
        clientOrderId: 'T1D1790172800589',
        dedupeExit: true,
      });

      expect(exchange.cancelOrderSpy).not.toHaveBeenCalled();
      // R3 review M1: not even a REST round-trip — with no price the filter can
      // never match, so the reconciliation is skipped outright (no 3s wait).
      expect(getOpenOrdersSpy).not.toHaveBeenCalled();
    });

    it('does NOT cancel from a snapshot that arrives after the bounded wait expired', async () => {
      // R3 review B1: the timeout only stops the WAIT. If the late snapshot were
      // acted upon, it could cancel the exit we already placed (a stale
      // snapshot, or the order we just placed ourselves) leaving the position
      // with no exit — "a wrong cancel is unrecoverable".
      const engineCtor = TradingEngine as unknown as {
        DUPLICATE_EXIT_RECONCILE_TIMEOUT_MS: number;
      };
      const originalTimeout = engineCtor.DUPLICATE_EXIT_RECONCILE_TIMEOUT_MS;
      engineCtor.DUPLICATE_EXIT_RECONCILE_TIMEOUT_MS = 20;

      let releaseSnapshot: ((orders: Order[]) => void) | undefined;
      exchange.getOpenOrders = () =>
        new Promise<Order[]>((resolve) => {
          releaseSnapshot = resolve;
        });

      try {
        await engine.executeOrder({
          strategyName: 'test-strategy',
          symbol: 'BTC/USDT',
          side: OrderSide.SELL,
          type: OrderType.LIMIT,
          quantity: new Decimal(15000),
          price: new Decimal(0.4202),
          clientOrderId: 'T1D1790172800589',
          dedupeExit: true,
        });

        // The exit is on the exchange now; the abandoned reconciliation then
        // receives an identical live order and MUST NOT touch it.
        expect(exchange.createOrderSpy).toHaveBeenCalledTimes(1);
        releaseSnapshot!([
          createOrder({
            id: 'just-placed',
            clientOrderId: 'T1D1790172800589',
            side: OrderSide.SELL,
            quantity: new Decimal(15000),
            price: new Decimal(0.4202),
          }),
          createOrder({
            id: 'stale-twin',
            clientOrderId: 'T1D1790172800300',
            side: OrderSide.SELL,
            quantity: new Decimal(15000),
            price: new Decimal(0.4202),
          }),
        ]);
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(exchange.cancelOrderSpy).not.toHaveBeenCalled();
        // The snapshot is rejected before the filter even runs (not merely
        // skipped loop-by-loop), so the specific message is pinned here.
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('no cancels performed'),
        );
      } finally {
        engineCtor.DUPLICATE_EXIT_RECONCILE_TIMEOUT_MS = originalTimeout;
      }
    });

    it('stops cancelling mid-list once the bounded wait expired', async () => {
      // The other half of R3-B1: abandonment can happen BETWEEN cancels (the
      // snapshot arrived in time, the first cancel is slow). The remaining
      // cancels must be skipped — any of them could be the exit we just placed.
      const engineCtor = TradingEngine as unknown as {
        DUPLICATE_EXIT_RECONCILE_TIMEOUT_MS: number;
      };
      const originalTimeout = engineCtor.DUPLICATE_EXIT_RECONCILE_TIMEOUT_MS;
      engineCtor.DUPLICATE_EXIT_RECONCILE_TIMEOUT_MS = 20;

      exchange.openOrders = [
        createOrder({
          id: 'twin-1',
          clientOrderId: 'T1D1790172790300',
          side: OrderSide.SELL,
          quantity: new Decimal(15000),
          price: new Decimal(0.4202),
        }),
        createOrder({
          id: 'twin-2',
          clientOrderId: 'T1D1790172790301',
          side: OrderSide.SELL,
          quantity: new Decimal(15000),
          price: new Decimal(0.4202),
        }),
      ];
      // Each cancel resolves AFTER the 20ms bounded wait elapses.
      exchange.cancelOrder = (symbol, orderId, clientOrderId) => {
        exchange.cancelOrderSpy(symbol, orderId, clientOrderId);
        return new Promise<Order>((resolve) =>
          setTimeout(
            () =>
              resolve({
                id: orderId,
                clientOrderId,
                symbol,
              } as unknown as Order),
            60,
          ),
        );
      };

      try {
        await engine.executeOrder({
          strategyName: 'test-strategy',
          symbol: 'BTC/USDT',
          side: OrderSide.SELL,
          type: OrderType.LIMIT,
          quantity: new Decimal(15000),
          price: new Decimal(0.4202),
          clientOrderId: 'T1D1790172800589',
          dedupeExit: true,
        });
        await new Promise((resolve) => setTimeout(resolve, 150));

        // Only the first cancel was issued; the second was abandoned.
        expect(exchange.cancelOrderSpy).toHaveBeenCalledTimes(1);
      } finally {
        engineCtor.DUPLICATE_EXIT_RECONCILE_TIMEOUT_MS = originalTimeout;
      }
    });

    it('never delays the exit when the reconciliation hangs (bounded wait)', async () => {
      // R2 review m4: the guard now runs ahead of EVERY exit, stop-losses
      // included, so a hung REST call must not hold the exit hostage.
      const engineCtor = TradingEngine as unknown as {
        DUPLICATE_EXIT_RECONCILE_TIMEOUT_MS: number;
      };
      const originalTimeout = engineCtor.DUPLICATE_EXIT_RECONCILE_TIMEOUT_MS;
      engineCtor.DUPLICATE_EXIT_RECONCILE_TIMEOUT_MS = 20;
      exchange.getOpenOrders = () => new Promise(() => {});

      try {
        await engine.executeOrder({
          strategyName: 'test-strategy',
          symbol: 'BTC/USDT',
          side: OrderSide.SELL,
          type: OrderType.LIMIT,
          quantity: new Decimal(15000),
          price: new Decimal(0.4202),
          clientOrderId: 'T1D1790172800589',
          dedupeExit: true,
        });
      } finally {
        engineCtor.DUPLICATE_EXIT_RECONCILE_TIMEOUT_MS = originalTimeout;
      }

      // The exit was placed anyway, and the timeout was logged.
      expect(exchange.createOrderSpy).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('reconciliation still running after 20ms'),
      );
    });

    it('reconciles the cancel+replace (update) path — the 609 root cause', async () => {
      // R2 review M3: every TP refresh goes through this path, and it is where
      // 609 lost its guard ("every TP refresh dropped it"). Deleting the
      // `dedupeExit` mapping at the update call site must fail here.
      const stale = createOrder({
        id: 'stale-dup',
        clientOrderId: 'T1D1790172796407',
        side: OrderSide.SELL,
        quantity: new Decimal(15000),
        price: new Decimal(0.43),
      });
      const existing = createOrder({
        id: 'existing-tp',
        clientOrderId: 'T1D1790172790001',
        side: OrderSide.SELL,
        quantity: new Decimal(15000),
        price: new Decimal(0.42),
      });
      exchange.openOrders = [stale, existing];

      // Engine learns about the order it is about to replace.
      exchange.emit('orderUpdate', 'BTC/USDT', existing);
      await new Promise((resolve) => setTimeout(resolve, 100));
      exchange.cancelOrderSpy.mockClear();
      exchange.createOrderSpy.mockClear();

      await (
        engine as unknown as {
          executeUpdateOrder: (
            strategyName: string,
            symbol: string,
            signal: StrategyUpdateOrderResult,
          ) => Promise<void>;
        }
      ).executeUpdateOrder('test-strategy', 'BTC/USDT', {
        action: 'update',
        clientOrderId: 'T1D1790172790001',
        newClientOrderId: 'T1D1790172800589',
        symbol: 'BTC/USDT',
        quantity: new Decimal(15000),
        price: new Decimal(0.43),
        metadata: { signalType: SignalType.TakeProfit } as SignalMetaData,
      });

      // The PROVABLE duplicate (identical size AND price to the replacement)
      // is cancelled; the replacement keeps its own id.
      expect(exchange.cancelOrderSpy).toHaveBeenCalledWith(
        'BTC/USDT',
        'stale-dup',
        'T1D1790172796407',
      );
      const replacementCall = exchange.createOrderSpy.mock.calls.at(-1)!;
      expect(replacementCall[6]).toBe('T1D1790172800589');
      const options = replacementCall[7] as Record<string, unknown>;
      expect(options.reduceOnly).toBeUndefined();
    });
  });

  describe('Fix 5: a failed cancel must not downgrade an executed order', () => {
    it('keeps a FILLED order FILLED when the cancel fails (-2011)', async () => {
      const rejectedSpy = vi.fn();
      eventBus.onOrderRejected(rejectedSpy);

      const filledSell = createOrder({
        id: 'order-4743137639',
        clientOrderId: 'T1D1790172800589',
        status: OrderStatus.FILLED,
        executedQuantity: new Decimal(15000),
      });

      // Engine learns about the fill (tracks the order in its cache).
      exchange.emit('orderUpdate', 'BTC/USDT', filledSell);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // The exchange rejects the cancel exactly like Binance does for an
      // already-filled order.
      exchange.cancelOrderError = new Error(
        'Binance API error: -2011 Unknown order sent.',
      );

      await (
        engine as unknown as {
          executeCancelOrder: (
            strategyName: string,
            symbol: string,
            signal: { action: 'cancel'; clientOrderId: string; symbol: string },
          ) => Promise<void>;
        }
      ).executeCancelOrder('test-strategy', 'BTC/USDT', {
        action: 'cancel',
        clientOrderId: 'T1D1790172800589',
        symbol: 'BTC/USDT',
      });

      expect(rejectedSpy).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('already recorded as'),
      );
    });

    it('still reports a genuine rejection when the order was never filled', async () => {
      const rejectedSpy = vi.fn();
      eventBus.onOrderRejected(rejectedSpy);

      const liveSell = createOrder({
        id: 'order-live',
        clientOrderId: 'T1D1790172800000',
        status: OrderStatus.NEW,
        executedQuantity: new Decimal(0),
      });

      exchange.emit('orderUpdate', 'BTC/USDT', liveSell);
      await new Promise((resolve) => setTimeout(resolve, 100));

      exchange.cancelOrderError = new Error(
        'Binance API error: -2011 Unknown order sent.',
      );

      await (
        engine as unknown as {
          executeCancelOrder: (
            strategyName: string,
            symbol: string,
            signal: { action: 'cancel'; clientOrderId: string; symbol: string },
          ) => Promise<void>;
        }
      ).executeCancelOrder('test-strategy', 'BTC/USDT', {
        action: 'cancel',
        clientOrderId: 'T1D1790172800000',
        symbol: 'BTC/USDT',
      });

      expect(rejectedSpy).toHaveBeenCalledTimes(1);
    });

    it('keeps a PARTIALLY filled order out of REJECTED when the cancel fails', async () => {
      // Review must-fix: broadening isOrderAlreadyExecuted to any execution.
      // Inventory really did move, so REJECTED would hide it (609 wrote a real
      // 15000 fill as REJECTED and the oversell stayed invisible).
      const rejectedSpy = vi.fn();
      eventBus.onOrderRejected(rejectedSpy);

      const partialSell = createOrder({
        id: 'partial-1',
        clientOrderId: 'T1D1790172800111',
        status: OrderStatus.PARTIALLY_FILLED,
        quantity: new Decimal(15000),
        executedQuantity: new Decimal(6000),
      });

      exchange.emit('orderUpdate', 'BTC/USDT', partialSell);
      await new Promise((resolve) => setTimeout(resolve, 100));

      exchange.cancelOrderError = new Error(
        'Binance API error: -2011 Unknown order sent.',
      );

      await (
        engine as unknown as {
          executeCancelOrder: (
            strategyName: string,
            symbol: string,
            signal: { action: 'cancel'; clientOrderId: string; symbol: string },
          ) => Promise<void>;
        }
      ).executeCancelOrder('test-strategy', 'BTC/USDT', {
        action: 'cancel',
        clientOrderId: 'T1D1790172800111',
        symbol: 'BTC/USDT',
      });

      expect(rejectedSpy).not.toHaveBeenCalled();
    });
  });

  describe('Fix 6: a failed cancel reports the venue state (strategy 633)', () => {
    // 2026-10-01, `2026-10-ZAMA-L-2` (strategy 633): the entry order
    // E633D1D1790828287920 was already dead at Binance while the strategy still
    // held it as LIVE, so the unclaimed-entry sweep re-issued the cancel every
    // 60 s for 3 183 s and every retry pushed `Order Failed — Request failed
    // with status code 400` to the user. Three defects: the blanket REJECTED
    // verdict (a lie — the order was CANCELED, not rejected), the axios-generic
    // message hiding the exchange's own reason, and no feedback to the strategy,
    // which therefore never dropped the stray and stayed blocked.

    /** An axios-shaped Binance failure: the reason lives in `response.data`. */
    function exchangeError(code: number | string, msg: string, status = 400): Error {
      const error = new Error(`Request failed with status code ${status}`) as Error & {
        response: { status: number; data: { code: number | string; msg: string } };
      };
      error.response = { status, data: { code, msg } };
      return error;
    }

    const binanceError = (code: number | string, msg: string) => exchangeError(code, msg);

    const engineInternals = () =>
      engine as unknown as {
        executeCancelOrder: (
          strategyName: string,
          symbol: string,
          signal: { action: 'cancel'; clientOrderId: string; symbol: string },
        ) => Promise<void>;
        onAccountUpdate: (data: {
          orders?: Order[];
          exchangeName?: string;
        }) => Promise<void>;
        notifyStrategiesOrderFilled: (
          order: Order,
          exchangeName: string,
        ) => Promise<void>;
        notifyStrategiesTradeExecuted: (
          trade: unknown,
          exchangeName: string,
        ) => Promise<void>;
        _orders: Map<string, Order[]>;
        formatOrderErrorMessage: (error: unknown) => string;
        applyExchangeOrderUpdate: (
          exchangeName: string,
          symbol: string,
          order: Order,
        ) => Promise<void>;
      };

    async function cancel(clientOrderId: string) {
      await engineInternals().executeCancelOrder('test-strategy', 'BTC/USDT', {
        action: 'cancel',
        clientOrderId,
        symbol: 'BTC/USDT',
      });
    }

    /** Make the engine track an order, like a websocket push would. */
    async function track(order: Order) {
      exchange.emit('orderUpdate', 'BTC/USDT', order);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    /** The entry the strategy still believes is LIVE (executed 0 of 10000). */
    function staleEntry(overrides: Partial<Order> = {}): Order {
      return createOrder({
        id: 'order-748929329',
        clientOrderId: 'E1D1790828287920',
        side: OrderSide.BUY,
        quantity: new Decimal(10000),
        price: new Decimal(0.075),
        status: OrderStatus.NEW,
        executedQuantity: new Decimal(0),
        ...overrides,
      });
    }

    /** What `exchange.getOrder` reports for it. */
    function venueOrder(overrides: Partial<Order> = {}): Order {
      return staleEntry(overrides);
    }

    /** The engine's own view of the order. */
    function trackedOrder(): Order | undefined {
      return engineInternals()
        ._orders.get('mockExchange')
        ?.find((order) => order.clientOrderId === 'E1D1790828287920');
    }

    it('reports CANCELED — not REJECTED — when the venue no longer knows the order', async () => {
      const cancelledSpy = vi.fn();
      const rejectedSpy = vi.fn();
      const getOrder = vi.fn(async () => venueOrder({ status: OrderStatus.CANCELED }));
      eventBus.onOrderCancelled(cancelledSpy);
      eventBus.onOrderRejected(rejectedSpy);

      await track(staleEntry());

      // Binance: -2011 Unknown order sent. — the entry is gone from the venue.
      exchange.cancelOrderError = binanceError(-2011, 'Unknown order sent.');
      exchange.getOrder = getOrder;

      await cancel('E1D1790828287920');

      // Asked about the right order, on the right symbol.
      expect(getOrder).toHaveBeenCalledWith(
        'BTC/USDT',
        'order-748929329',
        'E1D1790828287920',
      );
      expect(rejectedSpy).not.toHaveBeenCalled();
      expect(cancelledSpy).toHaveBeenCalledTimes(1);
      const reported = cancelledSpy.mock.calls[0][0].order as Order;
      expect(reported.status).toBe(OrderStatus.CANCELED);
      expect(reported.clientOrderId).toBe('E1D1790828287920');
      // The venue's own fields win over our stale ones.
      expect(reported.quantity.toString()).toBe('10000');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('the venue reports CANCELED'),
      );
    });

    it('books the recovered state the same way a websocket push does, so the strategy drops the stray', async () => {
      // This is what actually unblocked 633: the order map becomes terminal and
      // the strategy is told, so the sweep stops re-issuing the cancel.
      const accountUpdateSpy = vi.spyOn(engineInternals(), 'onAccountUpdate');

      await track(staleEntry());
      accountUpdateSpy.mockClear();
      exchange.cancelOrderError = binanceError(-2011, 'Unknown order sent.');
      exchange.getOrder = async (symbol, orderId, clientOrderId) =>
        createOrder({
          id: orderId,
          clientOrderId,
          symbol,
          side: OrderSide.BUY,
          status: OrderStatus.CANCELED,
        });

      await cancel('E1D1790828287920');

      expect(trackedOrder()?.status).toBe(OrderStatus.CANCELED);
      const fedBack = accountUpdateSpy.mock.calls
        .map((call) => call[0])
        .filter((data) =>
          (data.orders ?? []).some((order) => order.clientOrderId === 'E1D1790828287920'),
        );
      expect(fedBack).toHaveLength(1);
      expect(fedBack[0].orders?.[0].status).toBe(OrderStatus.CANCELED);
    });

    it('converges: cancelling the same order again reports nothing new', async () => {
      // A duplicate cancel must not push a second notification (the sweep drops
      // the order on the first terminal event, but the engine cannot rely on it).
      const cancelledSpy = vi.fn();
      const getOrder = vi.fn(async () => venueOrder({ status: OrderStatus.CANCELED }));
      eventBus.onOrderCancelled(cancelledSpy);

      await track(staleEntry());
      exchange.cancelOrderError = binanceError(-2011, 'Unknown order sent.');
      exchange.getOrder = getOrder;

      await cancel('E1D1790828287920');
      await cancel('E1D1790828287920');

      expect(cancelledSpy).toHaveBeenCalledTimes(1);
      expect(getOrder).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('already recorded as CANCELED'),
      );
    });

    it('reports FILLED and books the execution we missed', async () => {
      // The cancel failed because the order filled while we still showed it as
      // NEW: the venue's executed quantity has to reach the trade path, exactly
      // as a pushed fill would.
      const filledSpy = vi.fn();
      const rejectedSpy = vi.fn();
      const filledNotify = vi.spyOn(engineInternals(), 'notifyStrategiesOrderFilled');
      const tradeNotify = vi.spyOn(engineInternals(), 'notifyStrategiesTradeExecuted');
      eventBus.onOrderFilled(filledSpy);
      eventBus.onOrderRejected(rejectedSpy);

      await track(staleEntry());
      exchange.cancelOrderError = binanceError(-2011, 'Unknown order sent.');
      exchange.getOrder = async () =>
        venueOrder({
          status: OrderStatus.FILLED,
          executedQuantity: new Decimal(10000),
          cummulativeQuoteQuantity: new Decimal(750),
        });

      await cancel('E1D1790828287920');

      expect(rejectedSpy).not.toHaveBeenCalled();
      expect(filledSpy).toHaveBeenCalledTimes(1);
      const reported = filledSpy.mock.calls[0][0].order as Order;
      expect(reported.status).toBe(OrderStatus.FILLED);
      expect(reported.executedQuantity?.toString()).toBe('10000');
      expect(filledNotify).toHaveBeenCalledTimes(1);
      expect(tradeNotify).toHaveBeenCalledTimes(1);
    });

    it('books the execution of a partially filled order that was then cancelled', async () => {
      // CANCELED with executedQuantity > 0: inventory really moved, so the
      // recovered event has to carry it into the trade path — reporting the
      // order as dead without booking the fill is the 609 oversell shape.
      const cancelledSpy = vi.fn();
      const rejectedSpy = vi.fn();
      const tradeNotify = vi.spyOn(engineInternals(), 'notifyStrategiesTradeExecuted');
      eventBus.onOrderCancelled(cancelledSpy);
      eventBus.onOrderRejected(rejectedSpy);

      await track(staleEntry());
      tradeNotify.mockClear();
      exchange.cancelOrderError = binanceError(-2011, 'Unknown order sent.');
      exchange.getOrder = async () =>
        venueOrder({
          status: OrderStatus.CANCELED,
          executedQuantity: new Decimal(3000),
          cummulativeQuoteQuantity: new Decimal(225),
        });

      await cancel('E1D1790828287920');

      expect(rejectedSpy).not.toHaveBeenCalled();
      expect(cancelledSpy).toHaveBeenCalledTimes(1);
      const reported = cancelledSpy.mock.calls[0][0].order as Order;
      expect(reported.status).toBe(OrderStatus.CANCELED);
      expect(reported.executedQuantity?.toString()).toBe('3000');
      expect(tradeNotify).toHaveBeenCalledTimes(1);
      expect(trackedOrder()?.executedQuantity?.toString()).toBe('3000');
    });

    it('does not double-count the fill when the delayed websocket push arrives', async () => {
      const filledSpy = vi.fn();
      const filledNotify = vi.spyOn(engineInternals(), 'notifyStrategiesOrderFilled');
      const tradeNotify = vi.spyOn(engineInternals(), 'notifyStrategiesTradeExecuted');
      eventBus.onOrderFilled(filledSpy);

      await track(staleEntry());
      exchange.cancelOrderError = binanceError(-2011, 'Unknown order sent.');
      exchange.getOrder = async () =>
        venueOrder({
          status: OrderStatus.FILLED,
          executedQuantity: new Decimal(10000),
          cummulativeQuoteQuantity: new Decimal(750),
        });

      await cancel('E1D1790828287920');
      expect(tradeNotify).toHaveBeenCalledTimes(1);

      // The terminal push we thought was lost finally arrives.
      await track(
        venueOrder({
          status: OrderStatus.FILLED,
          executedQuantity: new Decimal(10000),
          cummulativeQuoteQuantity: new Decimal(750),
        }),
      );

      // One execution, reported once.
      expect(tradeNotify).toHaveBeenCalledTimes(1);
      expect(filledSpy).toHaveBeenCalledTimes(1);
      expect(filledNotify).toHaveBeenCalledTimes(1);
    });

    it('applies EXPIRED without inventing a status event', async () => {
      // The shared handler deliberately emits nothing for EXPIRED (see its
      // switch), and a recovered state must behave like a pushed one. The order
      // still becomes terminal in the engine's map and still reaches the
      // strategies, which is what stops the stray from blocking.
      const cancelledSpy = vi.fn();
      const rejectedSpy = vi.fn();
      const accountUpdateSpy = vi.spyOn(engineInternals(), 'onAccountUpdate');
      eventBus.onOrderCancelled(cancelledSpy);
      eventBus.onOrderRejected(rejectedSpy);

      await track(staleEntry());
      accountUpdateSpy.mockClear();
      exchange.cancelOrderError = binanceError(-2011, 'Unknown order sent.');
      exchange.getOrder = async () => venueOrder({ status: OrderStatus.EXPIRED });

      await cancel('E1D1790828287920');

      expect(rejectedSpy).not.toHaveBeenCalled();
      expect(cancelledSpy).not.toHaveBeenCalled();
      expect(trackedOrder()?.status).toBe(OrderStatus.EXPIRED);
      expect(
        accountUpdateSpy.mock.calls
          .map((call) => call[0])
          .filter((data) =>
            (data.orders ?? []).some(
              (order) => order.clientOrderId === 'E1D1790828287920',
            ),
          ),
      ).toHaveLength(1);
    });

    it('reports CANCELED when the lookup has no record of the order either', async () => {
      // Both the cancel and the lookup answer "unknown": the order is gone.
      const cancelledSpy = vi.fn();
      const rejectedSpy = vi.fn();
      eventBus.onOrderCancelled(cancelledSpy);
      eventBus.onOrderRejected(rejectedSpy);

      await track(staleEntry());
      exchange.cancelOrderError = exchangeError('-2011', 'Unknown order sent.');
      exchange.getOrder = async () => {
        throw binanceError(-2011, 'Unknown order sent.');
      };

      await cancel('E1D1790828287920');

      expect(rejectedSpy).not.toHaveBeenCalled();
      expect(cancelledSpy).toHaveBeenCalledTimes(1);
      const reported = cancelledSpy.mock.calls[0][0].order as Order;
      expect(reported.status).toBe(OrderStatus.CANCELED);
      // Real fields from our own record — nothing synthesised.
      expect(reported.quantity.toString()).toBe('10000');
      expect(reported.side).toBe(OrderSide.BUY);
    });

    it('does not treat an unknown lookup alone as proof the order is dead', async () => {
      // A cancel that failed for an unrelated reason plus a lookup miss is not
      // enough: a stale/mismatched id answers "unknown" for a live order.
      const cancelledSpy = vi.fn();
      const rejectedSpy = vi.fn();
      eventBus.onOrderCancelled(cancelledSpy);
      eventBus.onOrderRejected(rejectedSpy);

      await track(staleEntry());
      exchange.cancelOrderError = binanceError(-1102, 'Mandatory parameter missing');
      exchange.getOrder = async () => {
        throw binanceError(-2011, 'Unknown order sent.');
      };

      await cancel('E1D1790828287920');

      expect(cancelledSpy).not.toHaveBeenCalled();
      expect(rejectedSpy).toHaveBeenCalledTimes(1);
    });

    it('keeps REJECTED when the venue still reports the order as live (fail closed)', async () => {
      const cancelledSpy = vi.fn();
      const rejectedSpy = vi.fn();
      const getOrder = vi.fn(async () =>
        venueOrder({ status: OrderStatus.NEW, executedQuantity: new Decimal(0) }),
      );
      eventBus.onOrderCancelled(cancelledSpy);
      eventBus.onOrderRejected(rejectedSpy);

      await track(staleEntry());
      exchange.cancelOrderError = binanceError(-1102, 'Mandatory parameter missing');
      exchange.getOrder = getOrder;

      await cancel('E1D1790828287920');

      expect(getOrder).toHaveBeenCalledTimes(1);
      expect(cancelledSpy).not.toHaveBeenCalled();
      expect(rejectedSpy).toHaveBeenCalledTimes(1);
      expect(trackedOrder()?.status).not.toBe(OrderStatus.CANCELED);
    });

    it('keeps REJECTED when the venue returns no usable status', async () => {
      // A payload we cannot read is not evidence that the order died.
      const cancelledSpy = vi.fn();
      const rejectedSpy = vi.fn();
      eventBus.onOrderCancelled(cancelledSpy);
      eventBus.onOrderRejected(rejectedSpy);

      await track(staleEntry());
      exchange.cancelOrderError = binanceError(-2011, 'Unknown order sent.');
      exchange.getOrder = async () =>
        ({ ...venueOrder(), status: undefined }) as unknown as Order;

      await cancel('E1D1790828287920');

      expect(cancelledSpy).not.toHaveBeenCalled();
      expect(rejectedSpy).toHaveBeenCalledTimes(1);
    });

    it('keeps REJECTED when we have no local record of the order', async () => {
      const cancelledSpy = vi.fn();
      const rejectedSpy = vi.fn();
      const getOrder = vi.fn();
      eventBus.onOrderCancelled(cancelledSpy);
      eventBus.onOrderRejected(rejectedSpy);

      exchange.cancelOrderError = binanceError(-2011, 'Unknown order sent.');
      exchange.getOrder = getOrder;

      // Never tracked: nothing trustworthy to report, so do not even ask.
      await cancel('E1D9999999999999999');

      expect(getOrder).not.toHaveBeenCalled();
      expect(cancelledSpy).not.toHaveBeenCalled();
      expect(rejectedSpy).toHaveBeenCalledTimes(1);
    });

    it('keeps REJECTED when the state cannot be verified at all', async () => {
      const cancelledSpy = vi.fn();
      const rejectedSpy = vi.fn();
      eventBus.onOrderCancelled(cancelledSpy);
      eventBus.onOrderRejected(rejectedSpy);

      await track(staleEntry());
      exchange.cancelOrderError = binanceError(-1001, 'Internal error');
      exchange.getOrder = async () => {
        throw new Error('ECONNRESET');
      };

      await cancel('E1D1790828287920');

      expect(cancelledSpy).not.toHaveBeenCalled();
      expect(rejectedSpy).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Could not verify the state'),
      );
    });

    it('does not reconcile while the venue is throttling us', async () => {
      // One more REST call on a 429 is how a rate limit becomes an IP ban.
      const cancelledSpy = vi.fn();
      const rejectedSpy = vi.fn();
      const getOrder = vi.fn();
      eventBus.onOrderCancelled(cancelledSpy);
      eventBus.onOrderRejected(rejectedSpy);

      await track(staleEntry());
      exchange.cancelOrderError = exchangeError(-1003, 'Too many requests', 429);
      exchange.getOrder = getOrder;

      await cancel('E1D1790828287920');

      expect(getOrder).not.toHaveBeenCalled();
      expect(cancelledSpy).not.toHaveBeenCalled();
      expect(rejectedSpy).toHaveBeenCalledTimes(1);
      // The reason is the exchange's own, not the axios generic one.
      expect((rejectedSpy.mock.calls[0][0].order as Order).errorMessage).toBe(
        'Too many requests (code -1003)',
      );
    });

    it('recognises an unknown-order reason given only as text', async () => {
      const cancelledSpy = vi.fn();
      eventBus.onOrderCancelled(cancelledSpy);

      await track(staleEntry());
      // No `code` anywhere: only the exchange's WORDING identifies the case, and
      // BOTH the cancel and the lookup have to be recognised for the order to be
      // treated as gone — a single `unknown` is not proof (a stale orderId looks
      // unknown while the order is still live). This is what makes the text
      // matcher load-bearing rather than decorative (kimi R5 Minor).
      const textOnlyUnknown = () =>
        ({
          ...new Error('Request failed with status code 400'),
          response: { status: 400, data: { msg: 'Order does not exist.' } },
        }) as unknown as Error;
      exchange.cancelOrderError = textOnlyUnknown();
      exchange.getOrder = async () => {
        throw textOnlyUnknown();
      };

      await cancel('E1D1790828287920');

      expect(cancelledSpy).toHaveBeenCalledTimes(1);
      expect((cancelledSpy.mock.calls[0][0].order as Order).status).toBe(
        OrderStatus.CANCELED,
      );
    });

    it('will not call an order dead when only the lookup says so', async () => {
      // The other side of the same rule: a cancel failure we cannot attribute to
      // a missing order plus an `unknown` lookup is not proof, so the state must
      // stay untouched (fail closed) rather than being reported CANCELED.
      const cancelledSpy = vi.fn();
      const rejectedSpy = vi.fn();
      eventBus.onOrderCancelled(cancelledSpy);
      eventBus.onOrderRejected(rejectedSpy);

      await track(staleEntry());
      exchange.cancelOrderError = new Error('socket hang up');
      exchange.getOrder = async () => {
        throw {
          ...new Error('Request failed with status code 400'),
          response: { status: 400, data: { code: -2011, msg: 'Unknown order sent.' } },
        } as unknown as Error;
      };

      await cancel('E1D1790828287920');

      expect(cancelledSpy).not.toHaveBeenCalled();
      expect(trackedOrder()?.status).toBe(OrderStatus.NEW);
      // …and the engine says so out loud: exactly one fail-closed report.
      expect(rejectedSpy).toHaveBeenCalledTimes(1);
    });

    it('emits a terminal event once, even when the same push is replayed', async () => {
      const filledSpy = vi.fn();
      const filledNotify = vi.spyOn(engineInternals(), 'notifyStrategiesOrderFilled');
      eventBus.onOrderFilled(filledSpy);

      await track(staleEntry());
      filledSpy.mockClear();
      filledNotify.mockClear();

      await track(
        venueOrder({
          status: OrderStatus.FILLED,
          executedQuantity: new Decimal(10000),
          cummulativeQuoteQuantity: new Decimal(750),
        }),
      );
      // The same payload again, as an independent object: a replayed push. It
      // must be the DUPLICATE branch that swallows it, not the stale one — a
      // FILLED → FILLED update carrying an execution is a legal correction.
      await track(
        venueOrder({
          status: OrderStatus.FILLED,
          executedQuantity: new Decimal(10000),
          cummulativeQuoteQuantity: new Decimal(750),
        }),
      );

      expect(filledSpy).toHaveBeenCalledTimes(1);
      expect(filledNotify).toHaveBeenCalledTimes(1);
      expect(logger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('Ignoring a stale'),
      );
    });

    it('ignores a stale update that would resurrect a finished order', async () => {
      const filledSpy = vi.fn();
      const partialSpy = vi.fn();
      eventBus.onOrderFilled(filledSpy);
      eventBus.onOrderPartiallyFilled(partialSpy);

      await track(staleEntry());
      await track(
        venueOrder({
          status: OrderStatus.FILLED,
          executedQuantity: new Decimal(10000),
          cummulativeQuoteQuantity: new Decimal(750),
        }),
      );
      expect(filledSpy).toHaveBeenCalledTimes(1);

      // A delayed push for an earlier state must not roll the order back.
      await track(
        venueOrder({
          status: OrderStatus.PARTIALLY_FILLED,
          executedQuantity: new Decimal(3000),
          cummulativeQuoteQuantity: new Decimal(225),
        }),
      );

      expect(partialSpy).not.toHaveBeenCalled();
      expect(filledSpy).toHaveBeenCalledTimes(1);
      expect(trackedOrder()?.status).toBe(OrderStatus.FILLED);
      expect(trackedOrder()?.executedQuantity?.toString()).toBe('10000');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('recorded as FILLED'),
      );
    });

    it('drops a stale snapshot whole, so it cannot re-count a fill at the wrong price', async () => {
      const tradeNotify = vi.spyOn(engineInternals(), 'notifyStrategiesTradeExecuted');

      await track(staleEntry());
      tradeNotify.mockClear();
      await track(
        venueOrder({
          status: OrderStatus.PARTIALLY_FILLED,
          executedQuantity: new Decimal(5000),
          cummulativeQuoteQuantity: new Decimal(375),
        }),
      );
      expect(tradeNotify).toHaveBeenCalledTimes(1);

      // A snapshot older than the push that just landed. Applying it would roll
      // executed (and quote) back; the next update would then re-count the
      // difference as a fresh fill priced off the stale quote.
      await track(
        venueOrder({
          status: OrderStatus.PARTIALLY_FILLED,
          executedQuantity: new Decimal(1000),
          cummulativeQuoteQuantity: new Decimal(75),
        }),
      );

      expect(tradeNotify).toHaveBeenCalledTimes(1);
      expect(trackedOrder()?.executedQuantity?.toString()).toBe('5000');
      expect(trackedOrder()?.cummulativeQuoteQuantity?.toString()).toBe('375');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Ignoring a stale PARTIALLY_FILLED update'),
      );

      // The tail fills on the correct basis: 0.075, not the stale 0.135.
      await track(
        venueOrder({
          status: OrderStatus.FILLED,
          executedQuantity: new Decimal(10000),
          cummulativeQuoteQuantity: new Decimal(750),
        }),
      );
      const bookedTrade = tradeNotify.mock.calls[1][0] as { price: Decimal };
      expect(bookedTrade.price.toString()).toBe('0.075');
    });

    it('keeps a single record when the venue reports a different order id', async () => {
      // Our records are keyed on the identity the strategies use, so a renamed
      // id must not fork the order into a second entry (which would start from
      // executed 0 and re-count the fill as a fresh trade).
      await track(staleEntry());
      exchange.cancelOrderError = binanceError(-2011, 'Unknown order sent.');
      exchange.getOrder = async () =>
        venueOrder({ id: 'venue-renamed-999', status: OrderStatus.CANCELED });

      await cancel('E1D1790828287920');

      const recorded = engineInternals()._orders.get('mockExchange') ?? [];
      expect(recorded.filter((o) => o.clientOrderId === 'E1D1790828287920')).toHaveLength(
        1,
      );
      expect(trackedOrder()?.id).toBe('order-748929329');
      expect(trackedOrder()?.status).toBe(OrderStatus.CANCELED);
    });

    it('does not fail the cancel when a strategy callback throws', async () => {
      const filledNotify = vi
        .spyOn(engineInternals(), 'notifyStrategiesOrderFilled')
        .mockRejectedValue(new Error('strategy blew up'));

      await track(staleEntry());
      exchange.cancelOrderError = binanceError(-2011, 'Unknown order sent.');
      exchange.getOrder = async () =>
        venueOrder({
          status: OrderStatus.FILLED,
          executedQuantity: new Decimal(10000),
          cummulativeQuoteQuantity: new Decimal(750),
        });

      await expect(cancel('E1D1790828287920')).resolves.toBeUndefined();

      // The recovered state is still booked; only the notification failed, and
      // it is logged rather than propagated to the caller.
      expect(trackedOrder()?.status).toBe(OrderStatus.FILLED);
      expect(filledNotify).toHaveBeenCalled();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to notify strategies of an order fill'),
        expect.anything(),
      );
    });

    it('keeps our clientOrderId when the venue echoes a different one', async () => {
      // The strategies key their state on the clientOrderId this engine
      // generated: a venue echo must not rename the order under them.
      await track(staleEntry());
      exchange.cancelOrderError = binanceError(-2011, 'Unknown order sent.');
      exchange.getOrder = async () =>
        venueOrder({ status: OrderStatus.CANCELED, clientOrderId: 'VENUE-REWRITTEN' });

      await cancel('E1D1790828287920');

      expect(trackedOrder()?.clientOrderId).toBe('E1D1790828287920');
      expect(trackedOrder()?.status).toBe(OrderStatus.CANCELED);
    });

    it('tracks a new order that reuses the clientOrderId of an ended one', async () => {
      await track(staleEntry());
      exchange.cancelOrderError = binanceError(-2011, 'Unknown order sent.');
      exchange.getOrder = async () => venueOrder({ status: OrderStatus.CANCELED });

      await cancel('E1D1790828287920');
      expect(trackedOrder()?.status).toBe(OrderStatus.CANCELED);

      // The venue accepts a brand-new order under the same key. Folding it into
      // the ended record would hide it — its fills would never be booked.
      await track(venueOrder({ id: 'order-reused-4242', status: OrderStatus.NEW }));

      const recorded = (engineInternals()._orders.get('mockExchange') ?? []).filter(
        (o) => o.clientOrderId === 'E1D1790828287920',
      );
      expect(recorded).toHaveLength(1);
      expect(recorded[0].id).toBe('order-reused-4242');
      expect(recorded[0].status).toBe(OrderStatus.NEW);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('reuses the clientOrderId of the ended order'),
      );
    });

    it("reports the exchange's own reason and code instead of the generic axios message", async () => {
      // The incident's row said only `Request failed with status code 400`,
      // which is why the cause was invisible for an hour.
      const rejectedSpy = vi.fn();
      eventBus.onOrderRejected(rejectedSpy);

      await track(staleEntry());
      exchange.cancelOrderError = binanceError(-1102, 'Mandatory parameter missing');
      exchange.getOrder = async () => {
        throw new Error('ECONNRESET');
      };

      await cancel('E1D1790828287920');

      const reported = rejectedSpy.mock.calls[0][0].order as Order;
      expect(reported.errorMessage).toBe('Mandatory parameter missing (code -1102)');
    });

    it('books a tail execution that only a later FILLED update carries', async () => {
      const tradeNotify = vi.spyOn(engineInternals(), 'notifyStrategiesTradeExecuted');

      await track(staleEntry());
      tradeNotify.mockClear();

      // The venue reports FILLED but the adapter gave us no execution numbers:
      // the recovery can only stop the order, it cannot invent a fill.
      exchange.cancelOrderError = binanceError(-2011, 'Unknown order sent.');
      exchange.getOrder = async () => venueOrder({ status: OrderStatus.FILLED });
      await cancel('E1D1790828287920');

      expect(trackedOrder()?.status).toBe(OrderStatus.FILLED);
      expect(tradeNotify).not.toHaveBeenCalled();

      // The push carrying the actual execution must still book it — exactly
      // once, at the right price. (A FILLED → FILLED update is a legal
      // correction, not a stale replay.)
      await track(
        venueOrder({
          status: OrderStatus.FILLED,
          executedQuantity: new Decimal(10000),
          cummulativeQuoteQuantity: new Decimal(750),
        }),
      );

      expect(tradeNotify).toHaveBeenCalledTimes(1);
      const trade = tradeNotify.mock.calls[0][0] as unknown as {
        quantity: Decimal;
        price: Decimal;
      };
      expect(trade.quantity.toString()).toBe('10000');
      expect(trade.price.toString()).toBe('0.075');
    });

    it('keeps one record and one fill when the adapter echoes the same order under its own id', async () => {
      const tradeNotify = vi.spyOn(engineInternals(), 'notifyStrategiesTradeExecuted');
      const filledNotify = vi.spyOn(engineInternals(), 'notifyStrategiesOrderFilled');

      await track(staleEntry());
      exchange.cancelOrderError = binanceError(-2011, 'Unknown order sent.');
      exchange.getOrder = async () =>
        venueOrder({
          status: OrderStatus.FILLED,
          executedQuantity: new Decimal(10000),
          cummulativeQuoteQuantity: new Decimal(750),
        });
      await cancel('E1D1790828287920');
      tradeNotify.mockClear();
      filledNotify.mockClear();

      // The adapter's own push for that very fill, with a differently formatted
      // id: it is the SAME order, so it must not be mistaken for a new order
      // under the reused key (which would restart at executed 0 and book the
      // whole fill a second time).
      await track(
        venueOrder({
          id: '748929329',
          status: OrderStatus.FILLED,
          executedQuantity: new Decimal(10000),
          cummulativeQuoteQuantity: new Decimal(750),
        }),
      );

      expect(tradeNotify).not.toHaveBeenCalled();
      expect(filledNotify).not.toHaveBeenCalled();
      const recorded = (engineInternals()._orders.get('mockExchange') ?? []).filter(
        (o) => o.clientOrderId === 'E1D1790828287920',
      );
      expect(recorded).toHaveLength(1);
      expect(recorded[0].id).toBe('order-748929329');
    });

    it('announces a new order that reuses the ended key', async () => {
      const createdSpy = vi.fn();
      eventBus.onOrderCreated(createdSpy);

      await track(staleEntry());
      exchange.cancelOrderError = binanceError(-2011, 'Unknown order sent.');
      exchange.getOrder = async () => venueOrder({ status: OrderStatus.CANCELED });
      await cancel('E1D1790828287920');
      createdSpy.mockClear();

      await track(venueOrder({ id: 'order-reused-4242', status: OrderStatus.NEW }));

      // The reused key's "already announced" marker has to go with the ended
      // record, otherwise the new order is invisible to the console.
      expect(createdSpy).toHaveBeenCalledTimes(1);
      expect((createdSpy.mock.calls[0][0].order as Order).id).toBe('order-reused-4242');
    });

    it('re-delivers a FILLED order when its cancel fails, without re-firing the fill event', async () => {
      const filledSpy = vi.fn();
      const accountUpdateSpy = vi.spyOn(engineInternals(), 'onAccountUpdate');
      eventBus.onOrderFilled(filledSpy);

      await track(staleEntry());
      await track(
        venueOrder({
          status: OrderStatus.FILLED,
          executedQuantity: new Decimal(10000),
          cummulativeQuoteQuantity: new Decimal(750),
        }),
      );
      const fillsAnnounced = filledSpy.mock.calls.length;
      accountUpdateSpy.mockClear();

      // The strategy is out of sync and keeps cancelling an order the engine
      // already holds as FILLED.
      exchange.cancelOrderError = binanceError(-2011, 'Unknown order sent.');
      exchange.getOrder = async () =>
        venueOrder({
          status: OrderStatus.FILLED,
          executedQuantity: new Decimal(10000),
          cummulativeQuoteQuantity: new Decimal(750),
        });
      await cancel('E1D1790828287920');

      // It must hear the state it needs to stop sweeping…
      expect(accountUpdateSpy).toHaveBeenCalledTimes(1);
      // …and the fill must not be announced a second time.
      expect(filledSpy.mock.calls.length).toBe(fillsAnnounced);
    });

    it('holds a terminal order whose fill was never booked, even when the lookup fails', async () => {
      const rejectedSpy = vi.fn();
      const accountUpdateSpy = vi.spyOn(engineInternals(), 'onAccountUpdate');
      eventBus.onOrderRejected(rejectedSpy);

      await track(staleEntry());
      // The venue confirmed FILLED but never said how much, so the record
      // carries no execution (zero). A terminal order needs no verification —
      // the reconcile below it must not run (it used to, spending a REST call
      // and then possibly reporting REJECTED over a closed order).
      await track(venueOrder({ status: OrderStatus.FILLED }));
      expect(trackedOrder()?.status).toBe(OrderStatus.FILLED);
      expect((trackedOrder()?.executedQuantity ?? new Decimal(0)).toString()).toBe('0');
      accountUpdateSpy.mockClear();

      // A cancel that fails for an unrelated reason, on an order we know is
      // closed: there is nothing to verify.
      const getOrder = vi.fn(async () => venueOrder({ status: OrderStatus.FILLED }));
      exchange.getOrder = getOrder;
      exchange.cancelOrderError = binanceError(-1102, 'Mandatory parameter missing.');
      await cancel('E1D1790828287920');

      expect(getOrder).not.toHaveBeenCalled();
      expect(trackedOrder()?.status).toBe(OrderStatus.FILLED);
      expect(rejectedSpy).not.toHaveBeenCalled();
      expect(accountUpdateSpy).toHaveBeenCalledTimes(1);
    });

    it('still hands the state over when an event listener throws', async () => {
      const accountUpdateSpy = vi.spyOn(engineInternals(), 'onAccountUpdate');
      const boom = vi.fn(() => {
        throw new Error('listener boom');
      });
      eventBus.onOrderFilled(boom);

      await track(staleEntry());
      accountUpdateSpy.mockClear();

      exchange.cancelOrderError = binanceError(-2011, 'Unknown order sent.');
      exchange.getOrder = async () =>
        venueOrder({
          status: OrderStatus.FILLED,
          executedQuantity: new Decimal(10000),
          cummulativeQuoteQuantity: new Decimal(750),
        });
      await cancel('E1D1790828287920');

      // A subscriber blowing up must not cost the strategy its state update.
      expect(boom).toHaveBeenCalled();
      expect(trackedOrder()?.status).toBe(OrderStatus.FILLED);
      expect(accountUpdateSpy).toHaveBeenCalled();
    });

    it('never reports an order dead when a fill lands while the lookup is in flight', async () => {
      const rejectedSpy = vi.fn();
      const accountUpdateSpy = vi.spyOn(engineInternals(), 'onAccountUpdate');
      eventBus.onOrderRejected(rejectedSpy);

      await track(staleEntry());
      accountUpdateSpy.mockClear();

      let releaseLookup: (order: Order) => void = () => undefined;
      exchange.getOrder = () =>
        new Promise<Order>((resolve) => {
          releaseLookup = resolve;
        });
      exchange.cancelOrderError = binanceError(-1007, 'Timeout waiting for response.');

      // The cancel is stuck waiting for the venue…
      const cancelling = cancel('E1D1790828287920');
      // …a fill arrives on the websocket in the meantime…
      await track(
        venueOrder({
          status: OrderStatus.FILLED,
          executedQuantity: new Decimal(10000),
          cummulativeQuoteQuantity: new Decimal(750),
        }),
      );
      // …and the REST snapshot that finally comes back is the stale one.
      releaseLookup(venueOrder({ status: OrderStatus.NEW }));
      await cancelling;

      // The fill must not be written over with REJECTED, and the strategy must
      // hear the state the engine now holds.
      expect(rejectedSpy).not.toHaveBeenCalled();
      expect(trackedOrder()?.status).toBe(OrderStatus.FILLED);
      expect(accountUpdateSpy).toHaveBeenCalled();
    });

    it.each([
      ['lookup fails', 'reject' as const],
      ['lookup returns a stale snapshot', 'stale' as const],
    ])(
      'keeps a zero-execution terminal that landed during the lookup (%s)',
      async (_label, mode) => {
        const rejectedSpy = vi.fn();
        eventBus.onOrderRejected(rejectedSpy);

        await track(staleEntry());

        let releaseLookup: () => void = () => undefined;
        exchange.cancelOrderError = binanceError(-1007, 'Timeout waiting for response.');
        exchange.getOrder = () =>
          new Promise<Order>((resolve, reject) => {
            releaseLookup = () =>
              mode === 'reject'
                ? reject(new Error('read ECONNRESET'))
                : resolve(venueOrder({ status: OrderStatus.NEW }));
          });

        const cancelling = cancel('E1D1790828287920');
        // A terminal state with nothing executed lands while the lookup is in
        // flight: the engine holds a fact the venue agreed with, so the cancel
        // path must not overwrite it with REJECTED just because the lookup could
        // not confirm it too.
        await track(
          venueOrder({ status: OrderStatus.CANCELED, executedQuantity: new Decimal(0) }),
        );
        releaseLookup();
        await cancelling;

        expect(rejectedSpy).not.toHaveBeenCalled();
        expect(trackedOrder()?.status).toBe(OrderStatus.CANCELED);
      },
    );

    it('lets the venue close an order whose numbers look like a rollback', async () => {
      const rejectedSpy = vi.fn();
      const cancelledSpy = vi.fn();
      const tradeNotify = vi.spyOn(engineInternals(), 'notifyStrategiesTradeExecuted');
      eventBus.onOrderRejected(rejectedSpy);
      eventBus.onOrderCancelled(cancelledSpy);

      await track(staleEntry());
      // 3000 of the entry really has traded.
      await track(
        venueOrder({
          status: OrderStatus.PARTIALLY_FILLED,
          executedQuantity: new Decimal(3000),
          cummulativeQuoteQuantity: new Decimal(225),
        }),
      );

      // The venue closes it while reporting no execution: an adapter that
      // defaults a missing executedQuantity to 0, or a snapshot taken inside a
      // settlement window. The terminal state is still the truth the strategy
      // needs to stop sweeping.
      exchange.cancelOrderError = binanceError(-1007, 'Timeout waiting for response.');
      exchange.getOrder = async () =>
        venueOrder({ status: OrderStatus.CANCELED, executedQuantity: new Decimal(0) });
      tradeNotify.mockClear();
      await cancel('E1D1790828287920');

      // The rollback is clamped, so it books no second trade for the same fill.
      expect(tradeNotify).not.toHaveBeenCalled();

      expect(trackedOrder()?.status).toBe(OrderStatus.CANCELED);
      // …but the fill we booked is not rolled back along with it.
      expect(trackedOrder()?.executedQuantity?.toString()).toBe('3000');
      expect(cancelledSpy).toHaveBeenCalledTimes(1);
      expect(rejectedSpy).not.toHaveBeenCalled();
    });

    it('delivers a correction that lands during the cancel call, not the stale terminal', async () => {
      const rejectedSpy = vi.fn();
      const accountUpdateSpy = vi.spyOn(engineInternals(), 'onAccountUpdate');
      eventBus.onOrderRejected(rejectedSpy);

      // The engine already recorded the order as CANCELED, but the strategy
      // missed that delivery — which is why the sweep is still cancelling it.
      await track(
        venueOrder({ status: OrderStatus.CANCELED, executedQuantity: new Decimal(0) }),
      );
      accountUpdateSpy.mockClear();

      let releaseCancel: () => void = () => undefined;
      exchange.cancelOrder = () =>
        new Promise((_resolve, reject) => {
          releaseCancel = () => reject(binanceError(-2011, 'Unknown order sent.'));
        });

      const cancelling = cancel('E1D1790828287920');
      // …a real fill lands while the cancel call is in flight.
      await track(
        venueOrder({
          status: OrderStatus.FILLED,
          executedQuantity: new Decimal(10000),
          cummulativeQuoteQuantity: new Decimal(750),
        }),
      );
      releaseCancel();
      await cancelling;

      // The strategy has to end on the fill, not on the state the cancel call
      // was resolved against.
      const delivered = accountUpdateSpy.mock.calls
        .map((call) => call[0] as { orders?: Order[] })
        .flatMap((payload) => payload.orders ?? [])
        .filter((o) => o.clientOrderId === 'E1D1790828287920');
      expect(delivered.length).toBeGreaterThan(0);
      expect(delivered[delivered.length - 1]?.status).toBe(OrderStatus.FILLED);
      expect(trackedOrder()?.status).toBe(OrderStatus.FILLED);
      expect(rejectedSpy).not.toHaveBeenCalled();
    });

    it('lets a terminal correction land even when it carries no executions', async () => {
      await track(staleEntry());
      // The venue closed the entry after 3000 of it traded.
      await track(
        venueOrder({
          status: OrderStatus.CANCELED,
          executedQuantity: new Decimal(3000),
          cummulativeQuoteQuantity: new Decimal(225),
        }),
      );

      // A correction to FILLED arrives carrying no executions of its own (an
      // adapter that defaults the missing field to 0). The status is still the
      // venue's answer and the two are not contradictory — a fill is what a
      // closed order sometimes turns out to have been — so it lands, and the
      // 3000 already booked stays booked.
      await track(
        venueOrder({ status: OrderStatus.FILLED, executedQuantity: new Decimal(0) }),
      );

      expect(trackedOrder()?.status).toBe(OrderStatus.FILLED);
      expect(trackedOrder()?.executedQuantity?.toString()).toBe('3000');
    });

    it('hands over the venue answer when a live state cannot be recorded', async () => {
      const rejectedSpy = vi.fn();
      const accountUpdateSpy = vi.spyOn(engineInternals(), 'onAccountUpdate');
      eventBus.onOrderRejected(rejectedSpy);

      await track(staleEntry());
      vi.spyOn(engineInternals(), 'applyExchangeOrderUpdate').mockRejectedValue(
        new Error('apply boom'),
      );
      // A genuine cancel failure (not an unknown-order error, so the reconcile is
      // allowed to run) on an order the venue says is still live — with a fill.
      exchange.cancelOrderError = binanceError(-1007, 'Timeout waiting for response.');
      exchange.getOrder = async () =>
        venueOrder({
          status: OrderStatus.PARTIALLY_FILLED,
          executedQuantity: new Decimal(3000),
          cummulativeQuoteQuantity: new Decimal(225),
        });
      accountUpdateSpy.mockClear();

      await cancel('E1D1790828287920');

      // Nothing could be recorded, so the map still holds the entry as NEW — but
      // the venue's answer must still reach the strategy, and never as REJECTED.
      expect(rejectedSpy).not.toHaveBeenCalled();
      expect(trackedOrder()?.status).toBe(OrderStatus.NEW);
      const handedOver = accountUpdateSpy.mock.calls
        .map((call) => call[0] as { orders?: Order[] })
        .flatMap((payload) => payload.orders ?? []);
      expect(handedOver.some((o) => o.status === OrderStatus.PARTIALLY_FILLED)).toBe(
        true,
      );
    });

    it('reads a zero-padded venue id as the same order', async () => {
      await track(staleEntry());
      exchange.cancelOrderError = binanceError(-2011, 'Unknown order sent.');
      exchange.getOrder = async () =>
        venueOrder({
          status: OrderStatus.FILLED,
          executedQuantity: new Decimal(10000),
          cummulativeQuoteQuantity: new Decimal(750),
        });
      await cancel('E1D1790828287920');

      // Same order, same digits, different padding (and no clientOrderId on the
      // push, so the id is all the engine has to match on).
      await track(
        venueOrder({
          id: '00748929329',
          clientOrderId: undefined,
          status: OrderStatus.NEW,
        }),
      );

      expect(engineInternals()._orders.get('mockExchange') ?? []).toHaveLength(1);
      expect(trackedOrder()?.id).toBe('order-748929329');
    });

    it('hands over the state it holds when a fill absorbs the recovered one', async () => {
      const rejectedSpy = vi.fn();
      const accountUpdateSpy = vi.spyOn(engineInternals(), 'onAccountUpdate');
      eventBus.onOrderRejected(rejectedSpy);

      await track(staleEntry());
      accountUpdateSpy.mockClear();

      let releaseLookup: () => void = () => undefined;
      const unknown = binanceError(-2011, 'Unknown order sent.');
      exchange.cancelOrderError = unknown;
      exchange.getOrder = () =>
        new Promise<Order>((_resolve, reject) => {
          releaseLookup = () => reject(unknown);
        });

      const cancelling = cancel('E1D1790828287920');
      // A fill lands while the lookup is in flight, so the CANCELED the engine
      // is about to recover is absorbed by the FILLED record it now holds.
      await track(
        venueOrder({
          status: OrderStatus.FILLED,
          executedQuantity: new Decimal(10000),
          cummulativeQuoteQuantity: new Decimal(750),
        }),
      );
      releaseLookup();
      await cancelling;

      // The strategy still has to hear a terminal state, or it sweeps forever.
      expect(rejectedSpy).not.toHaveBeenCalled();
      expect(trackedOrder()?.status).toBe(OrderStatus.FILLED);
      const handedOver = accountUpdateSpy.mock.calls
        .map((call) => call[0] as { orders?: Order[] })
        .flatMap((payload) => payload.orders ?? []);
      expect(handedOver.some((o) => o.status === OrderStatus.FILLED)).toBe(true);
    });

    it('adopts what the venue holds when a real cancel failure hides a fill', async () => {
      const rejectedSpy = vi.fn();
      const tradeNotify = vi.spyOn(engineInternals(), 'notifyStrategiesTradeExecuted');
      eventBus.onOrderRejected(rejectedSpy);

      await track(staleEntry());
      tradeNotify.mockClear();

      // A genuine cancel failure on an order that had not traded yet…
      exchange.cancelOrderError = binanceError(-1007, 'Timeout waiting for response.');
      // …but the venue has since filled part of it.
      exchange.getOrder = async () =>
        venueOrder({
          status: OrderStatus.PARTIALLY_FILLED,
          executedQuantity: new Decimal(3000),
          cummulativeQuoteQuantity: new Decimal(225),
        });
      await cancel('E1D1790828287920');

      // The fill must be booked and the order must not be reported dead.
      expect(tradeNotify).toHaveBeenCalledTimes(1);
      expect(trackedOrder()?.status).toBe(OrderStatus.PARTIALLY_FILLED);
      expect(trackedOrder()?.executedQuantity?.toString()).toBe('3000');
      expect(rejectedSpy).not.toHaveBeenCalled();
    });

    it('reads the raw venue id as the same order, never as a second one', async () => {
      const tradeNotify = vi.spyOn(engineInternals(), 'notifyStrategiesTradeExecuted');

      await track(staleEntry());
      exchange.cancelOrderError = binanceError(-2011, 'Unknown order sent.');
      exchange.getOrder = async () =>
        venueOrder({
          status: OrderStatus.FILLED,
          executedQuantity: new Decimal(10000),
          cummulativeQuoteQuantity: new Decimal(750),
        });
      await cancel('E1D1790828287920');
      tradeNotify.mockClear();

      // A stale NEW/PARTIALLY_FILLED push that the adapter stamps with its own
      // id format. Reading that as a new order would wipe the filled record and
      // re-count the whole fill on the next reconcile.
      await track(
        venueOrder({
          id: '748929329',
          status: OrderStatus.PARTIALLY_FILLED,
          executedQuantity: new Decimal(3000),
          cummulativeQuoteQuantity: new Decimal(225),
        }),
      );
      expect(tradeNotify).not.toHaveBeenCalled();

      await track(
        venueOrder({
          id: '748929329',
          status: OrderStatus.FILLED,
          executedQuantity: new Decimal(10000),
          cummulativeQuoteQuantity: new Decimal(750),
        }),
      );

      // Still exactly one record, still filled, and the fill was booked once.
      const records = (engineInternals()._orders.get('mockExchange') ?? []).filter(
        (o) => o.clientOrderId === 'E1D1790828287920',
      );
      expect(records).toHaveLength(1);
      expect(records[0]?.status).toBe(OrderStatus.FILLED);
      expect((records[0]?.executedQuantity ?? new Decimal(0)).toString()).toBe('10000');
      expect(tradeNotify).not.toHaveBeenCalled();
    });

    it('still reconciles a partially filled order the venue has since closed', async () => {
      // The 633 shape one step earlier: the order really was partly executed,
      // so the executed-guard used to skip the reconcile and leave the strategy
      // believing a live order — sweeping forever.
      const cancelledSpy = vi.fn();
      const rejectedSpy = vi.fn();
      eventBus.onOrderCancelled(cancelledSpy);
      eventBus.onOrderRejected(rejectedSpy);

      await track(staleEntry());
      await track(
        venueOrder({
          status: OrderStatus.PARTIALLY_FILLED,
          executedQuantity: new Decimal(3000),
          cummulativeQuoteQuantity: new Decimal(225),
        }),
      );

      exchange.cancelOrderError = binanceError(-2011, 'Unknown order sent.');
      exchange.getOrder = async () =>
        venueOrder({ status: OrderStatus.CANCELED, executedQuantity: new Decimal(3000) });
      await cancel('E1D1790828287920');

      expect(trackedOrder()?.status).toBe(OrderStatus.CANCELED);
      expect((trackedOrder()?.executedQuantity ?? new Decimal(0)).toString()).toBe(
        '3000',
      );
      expect(cancelledSpy).toHaveBeenCalledTimes(1);
      expect(rejectedSpy).not.toHaveBeenCalled();
    });

    it('keeps a recovered state whose delivery threw after the map was written', async () => {
      const rejectedSpy = vi.fn();
      eventBus.onOrderRejected(rejectedSpy);
      // A subscriber that throws synchronously: the emit propagates through the
      // shared entry point, so `applyExchangeOrderUpdate` rejects AFTER the map
      // write. The map is what matters — reporting REJECTED on top of a filled
      // order would be the very lie this path exists to stop (R5 Minor).
      eventBus.onOrderFilled(() => {
        throw new Error('listener boom');
      });

      await track(staleEntry());
      exchange.cancelOrderError = binanceError(-2011, 'Unknown order sent.');
      exchange.getOrder = async () =>
        venueOrder({
          status: OrderStatus.FILLED,
          executedQuantity: new Decimal(10000),
          cummulativeQuoteQuantity: new Decimal(750),
        });

      await cancel('E1D1790828287920');

      expect(trackedOrder()?.status).toBe(OrderStatus.FILLED);
      expect(rejectedSpy).not.toHaveBeenCalled();
    });

    it('hands over the venue verdict when the recovered state never landed', async () => {
      const rejectedSpy = vi.fn();
      const accountUpdateSpy = vi.spyOn(engineInternals(), 'onAccountUpdate');
      eventBus.onOrderRejected(rejectedSpy);

      await track(staleEntry());
      const applySpy = vi
        .spyOn(engineInternals(), 'applyExchangeOrderUpdate')
        .mockRejectedValue(new Error('apply boom'));
      exchange.cancelOrderError = binanceError(-2011, 'Unknown order sent.');
      exchange.getOrder = async () =>
        venueOrder({
          status: OrderStatus.FILLED,
          executedQuantity: new Decimal(10000),
          cummulativeQuoteQuantity: new Decimal(750),
        });

      await cancel('E1D1790828287920');

      // The map write failed, so the engine still holds the entry as NEW — but
      // it does know what the venue said, and writing REJECTED over a
      // venue-confirmed fill is the lie this whole path exists to stop (609).
      expect(applySpy).toHaveBeenCalled();
      expect(trackedOrder()?.status).toBe(OrderStatus.NEW);
      expect(rejectedSpy).not.toHaveBeenCalled();
      const handedOver = accountUpdateSpy.mock.calls
        .map((call) => call[0] as { orders?: Order[] })
        .flatMap((payload) => payload.orders ?? []);
      expect(handedOver.some((o) => o.status === OrderStatus.FILLED)).toBe(true);
      applySpy.mockRestore();
    });

    it('locks the exchange-error formatting for a message the venue left empty', () => {
      // The code is all we have to grep for, so it must survive on its own.
      expect(engineInternals().formatOrderErrorMessage(binanceError(-2011, ''))).toBe(
        'Exchange error code -2011',
      );
    });
  });
});
