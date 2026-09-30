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
        expect.stringContaining('already executed'),
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
});
