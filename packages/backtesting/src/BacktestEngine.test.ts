/**
 * BacktestEngine comprehensive tests
 *
 * Uses lightweight mock strategies so each test exercises exactly one
 * backtest-engine behaviour and is not coupled to any concrete strategy.
 *
 * Bar processing order (important for test design):
 *   Phase 1 : check fills for pending entries & active exits on THIS bar
 *   Phase 2 : notify strategy of fills → TP signals placed here can only
 *              fill from the NEXT bar onward
 *   Phase 3 : kline analysis → entry signals placed here can fill from NEXT bar
 *
 * Strategy archetypes covered
 * ───────────────────────────
 * A. Signal-driven (MA-style):
 *    kline trigger → entry pending → fills next bar → TP registered → TP hits
 *    OR: entry pending → TTL expires → no trade
 *    OR: entry fills → TP never hits → force-close at end
 *    OR: SL fires → cancels paired TP → single trade
 *
 * B. Order-driven (SpreadGrid-style):
 *    processInitialData → initial entries
 *    fill → cancel sibling + replace → multi-cycle grid
 *    cancelled order → no trade
 *
 * C. General:
 *    Pending order that never fills → no trade
 *    Strategy cancels pending entry before it hits → no trade
 *    Multiple simultaneous fills on same bar
 *    PnL / balance accounting
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import {
  IStrategy,
  IDataManager,
  StrategyAnalyzeResult,
  StrategyResult,
  DataUpdate,
  Kline,
  KlineInterval,
  OrderSide,
  OrderStatus,
  BacktestConfig,
  isCancelOrderResult,
} from '@itrade/core';
import { BacktestEngine } from './BacktestEngine';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

let _seq = 1;
function nextCid(prefix = 'E'): string {
  return `${prefix}1D${_seq++}D${Date.now()}`;
}

let _barTime = 1_700_000_000_000;
function makeKline(
  open: number,
  high: number,
  low: number,
  close: number,
  symbol = 'BTC/USDT',
): Kline {
  const openTime = new Date(_barTime);
  _barTime += 3_600_000;
  return {
    symbol,
    interval: '1h' as KlineInterval,
    openTime,
    closeTime: new Date(_barTime - 1),
    open: new Decimal(open),
    high: new Decimal(high),
    low: new Decimal(low),
    close: new Decimal(close),
    volume: new Decimal(1000),
    quoteVolume: new Decimal(100_000),
    trades: 100,
  };
}

function makeDataManager(klines: Kline[]): IDataManager {
  return { getKlines: async () => klines } as unknown as IDataManager;
}

const BASE_CONFIG: BacktestConfig = {
  startDate: new Date('2023-01-01'),
  endDate: new Date('2023-12-31'),
  initialBalance: new Decimal(10_000),
  commission: new Decimal('0.001'),
  slippage: new Decimal(0),
  symbols: ['BTC/USDT'],
  timeframe: '1h',
  entryTtlBars: 10,
  stopLossPercent: 0,
};

const BASE_EXCHANGE = 'binance';
const BASE_CONFIG_OBJ = {
  type: 'MockStrategy',
  strategyId: 99,
  strategyName: 'mock',
  symbol: 'BTC/USDT',
  exchange: BASE_EXCHANGE,
  parameters: {} as Record<string, unknown>,
};

function buildStrategy(overrides: Partial<IStrategy> = {}): IStrategy {
  return {
    config: BASE_CONFIG_OBJ,
    processInitialData: async () => ({ action: 'hold' }),
    analyze: async () => ({ action: 'hold' }),
    onOrderCreated: async () => {},
    onTradeExecuted: async () => {},
    cleanup: async () => {},
    ...overrides,
  } as unknown as IStrategy;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('BacktestEngine', () => {
  let engine: BacktestEngine;

  beforeEach(() => {
    engine = new BacktestEngine();
    _seq = 1;
    _barTime = 1_700_000_000_000;
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Pending orders that never fill
  // ───────────────────────────────────────────────────────────────────────────

  describe('1. Pending entry that never fills', () => {
    it('1a. BUY far below market — no trade, balance unchanged', async () => {
      const cid = nextCid();
      let placed = false;

      const strategy = buildStrategy({
        analyze: async (u: DataUpdate) => {
          if (u.klines && !placed) {
            placed = true;
            return {
              action: 'buy' as const,
              clientOrderId: cid,
              price: new Decimal(10),
              quantity: new Decimal(1),
            };
          }
          return { action: 'hold' as const };
        },
      });

      const klines = [
        makeKline(100, 110, 90, 105), // low=90 — never touches 10
        makeKline(105, 115, 95, 110),
      ];
      const result = await engine.runBacktest(
        () => strategy,
        BASE_CONFIG,
        makeDataManager(klines),
      );

      expect(result.totalTrades).toBe(0);
      expect(result.equity[result.equity.length - 1]?.value.toNumber()).toBeCloseTo(
        10_000,
        0,
      );
    });

    it('1b. SELL far above market — no trade', async () => {
      const cid = nextCid();
      let placed = false;

      const strategy = buildStrategy({
        analyze: async (u: DataUpdate) => {
          if (u.klines && !placed) {
            placed = true;
            return {
              action: 'sell' as const,
              clientOrderId: cid,
              price: new Decimal(999),
              quantity: new Decimal(1),
            };
          }
          return { action: 'hold' as const };
        },
      });

      const klines = [makeKline(100, 110, 90, 105)];
      const result = await engine.runBacktest(
        () => strategy,
        BASE_CONFIG,
        makeDataManager(klines),
      );
      expect(result.totalTrades).toBe(0);
    });

    it('1c. TTL expiry with no replacement — no trade', async () => {
      // Order placed on bar 0, TTL=1 bar, expires on bar 1, strategy holds → 0 trades
      const cid = nextCid();
      let placed = false;

      const strategy = buildStrategy({
        analyze: async (u: DataUpdate) => {
          if (u.klines && !placed) {
            placed = true;
            return {
              action: 'buy' as const,
              clientOrderId: cid,
              price: new Decimal(10),
              quantity: new Decimal(1),
            };
          }
          return { action: 'hold' as const };
        },
      });

      const klines = [
        makeKline(100, 110, 90, 100),
        makeKline(100, 110, 90, 100),
        makeKline(100, 110, 90, 100),
      ];
      const result = await engine.runBacktest(
        () => strategy,
        { ...BASE_CONFIG, entryTtlBars: 1 },
        makeDataManager(klines),
      );
      expect(result.totalTrades).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Strategy-initiated cancellation of pending entry
  // ───────────────────────────────────────────────────────────────────────────

  describe('2. Strategy cancels its own pending entry', () => {
    it('2a. Cancel on kline path — no trade even when price later reaches entry level', async () => {
      // Bar 0: place BUY @80. Bar 1: strategy cancels. Bar 2: low=75 would have filled.
      const cid = nextCid();
      let barCount = 0;

      const strategy = buildStrategy({
        analyze: async (u: DataUpdate): Promise<StrategyAnalyzeResult> => {
          if (u.klines) {
            barCount++;
            if (barCount === 1)
              return {
                action: 'buy',
                clientOrderId: cid,
                price: new Decimal(80),
                quantity: new Decimal(1),
              };
            if (barCount === 2) return { action: 'cancel', clientOrderId: cid };
          }
          return { action: 'hold' };
        },
      });

      const klines = [
        makeKline(100, 110, 90, 100), // bar 0: BUY@80 placed (never fills this bar)
        makeKline(100, 110, 90, 100), // bar 1: cancel sent on kline path
        makeKline(90, 95, 70, 75), // bar 2: low=70, would've filled BUY@80 — but cancelled
      ];
      const result = await engine.runBacktest(
        () => strategy,
        BASE_CONFIG,
        makeDataManager(klines),
      );
      expect(result.totalTrades).toBe(0);
    });

    it('2b. Cancel from fill response — clears sibling before it fills', async () => {
      // processInitialData: place BUY@90 and SELL@95 (sibling)
      // Bar 0: low=85 → BUY@90 fills. Fill response: cancel(SELL@95).
      // Bar 1: high=100 — SELL@95 would have filled but was cancelled → no "SELL entry" trade
      const buyCid = nextCid('E');
      const sellCid = nextCid('E');
      const tpCid = nextCid('T');

      const strategy = buildStrategy({
        processInitialData: async (): Promise<StrategyAnalyzeResult> => [
          {
            action: 'buy',
            clientOrderId: buyCid,
            price: new Decimal(90),
            quantity: new Decimal(1),
          },
          {
            action: 'sell',
            clientOrderId: sellCid,
            price: new Decimal(95),
            quantity: new Decimal(1),
          },
        ],
        analyze: async (u: DataUpdate): Promise<StrategyAnalyzeResult> => {
          if (u.orders) {
            const filled = u.orders.find(
              (o) => o.clientOrderId === buyCid && o.status === OrderStatus.FILLED,
            );
            if (filled) {
              return [
                { action: 'cancel', clientOrderId: sellCid },
                // New TP above market
                {
                  action: 'sell',
                  clientOrderId: tpCid,
                  price: new Decimal(200),
                  quantity: new Decimal(1),
                },
              ];
            }
          }
          return { action: 'hold' };
        },
      });

      const klines = [
        makeKline(100, 105, 85, 95), // BUY@90 fills; cancel of SELL@95 processed
        makeKline(95, 105, 88, 100), // SELL@95 was cancelled — no fill; TP@200 not hit
      ];
      const result = await engine.runBacktest(
        () => strategy,
        BASE_CONFIG,
        makeDataManager(klines),
      );

      // The SELL @95 was cancelled before bar 1 → no sell-entry trade recorded
      const sellEntryTrades = result.trades.filter((t) => t.side === OrderSide.SELL);
      expect(sellEntryTrades).toHaveLength(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. MA-style: full round-trip (entry → TP hits)
  // ───────────────────────────────────────────────────────────────────────────

  describe('3. MA-style: entry fills → TP registered → TP hits → completed trade', () => {
    it('3a. BUY entry fills on bar 1, TP hits on bar 2 — one profitable trade', async () => {
      // Bar 0 (kline): strategy places BUY@95
      // Bar 1: low=90 fills BUY@95 → notify strategy → strategy places SELL TP@110
      // Bar 2: high=115 → TP hits → trade recorded
      const entryCid = nextCid('E');
      const tpCid = nextCid('T');
      let entryPlaced = false;
      let tpPlaced = false;

      const strategy = buildStrategy({
        analyze: async (u: DataUpdate): Promise<StrategyAnalyzeResult> => {
          if (u.klines && !entryPlaced) {
            entryPlaced = true;
            return {
              action: 'buy',
              clientOrderId: entryCid,
              price: new Decimal(95),
              quantity: new Decimal(1),
            };
          }
          if (u.orders && !tpPlaced) {
            const filled = u.orders.find(
              (o) => o.clientOrderId === entryCid && o.status === OrderStatus.FILLED,
            );
            if (filled) {
              tpPlaced = true;
              return {
                action: 'sell',
                clientOrderId: tpCid,
                price: new Decimal(110),
                quantity: new Decimal(1),
              };
            }
          }
          return { action: 'hold' };
        },
      });

      const klines = [
        makeKline(100, 105, 88, 102), // bar 0: entry placed via kline signal
        makeKline(100, 108, 90, 105), // bar 1: low=90 → entry BUY@95 fills; TP@110 registered
        makeKline(108, 115, 105, 112), // bar 2: high=115 → TP @110 fills
      ];
      const result = await engine.runBacktest(
        () => strategy,
        BASE_CONFIG,
        makeDataManager(klines),
      );

      expect(result.totalTrades).toBe(1);
      const trade = result.trades[0];
      expect(trade.side).toBe(OrderSide.BUY);
      expect(trade.entryPrice.toNumber()).toBeCloseTo(95, 1);
      expect(trade.exitPrice.toNumber()).toBeCloseTo(110, 1);
      expect(trade.pnl.gt(0)).toBe(true);
    });

    it('3b. SELL entry (short) fills, TP BUY hits — profitable short trade', async () => {
      const entryCid = nextCid('E');
      const tpCid = nextCid('T');
      let entryPlaced = false;
      let tpPlaced = false;

      const strategy = buildStrategy({
        analyze: async (u: DataUpdate): Promise<StrategyAnalyzeResult> => {
          if (u.klines && !entryPlaced) {
            entryPlaced = true;
            return {
              action: 'sell',
              clientOrderId: entryCid,
              price: new Decimal(110),
              quantity: new Decimal(1),
              leverage: 2,
            };
          }
          if (u.orders && !tpPlaced) {
            const filled = u.orders.find(
              (o) => o.clientOrderId === entryCid && o.status === OrderStatus.FILLED,
            );
            if (filled) {
              tpPlaced = true;
              return {
                action: 'buy',
                clientOrderId: tpCid,
                price: new Decimal(95),
                quantity: new Decimal(1),
              };
            }
          }
          return { action: 'hold' };
        },
      });

      const klines = [
        makeKline(100, 105, 90, 102), // bar 0: SELL entry placed
        makeKline(112, 115, 105, 108), // bar 1: high=115 → SELL@110 fills; TP BUY@95 registered
        makeKline(108, 112, 90, 92), // bar 2: low=90 → TP BUY@95 fills
      ];
      const result = await engine.runBacktest(
        () => strategy,
        BASE_CONFIG,
        makeDataManager(klines),
      );

      expect(result.totalTrades).toBe(1);
      expect(result.trades[0].pnl.gt(0)).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Entry fills but TP never hits → force-closed at end of run
  // ───────────────────────────────────────────────────────────────────────────

  describe('4. Open position force-closed at end of run', () => {
    it('4a. TP unreachable — exactly one force-close trade at last bar close', async () => {
      const entryCid = nextCid('E');
      const tpCid = nextCid('T');
      let entryPlaced = false;
      let tpPlaced = false;

      const strategy = buildStrategy({
        analyze: async (u: DataUpdate): Promise<StrategyAnalyzeResult> => {
          if (u.klines && !entryPlaced) {
            entryPlaced = true;
            return {
              action: 'buy',
              clientOrderId: entryCid,
              price: new Decimal(95),
              quantity: new Decimal(1),
            };
          }
          if (u.orders && !tpPlaced) {
            const filled = u.orders.find(
              (o) => o.clientOrderId === entryCid && o.status === OrderStatus.FILLED,
            );
            if (filled) {
              tpPlaced = true;
              return {
                action: 'sell',
                clientOrderId: tpCid,
                price: new Decimal(300),
                quantity: new Decimal(1),
              };
            }
          }
          return { action: 'hold' };
        },
      });

      const lastClose = 102;
      const klines = [
        makeKline(100, 108, 88, 102), // bar 0: BUY@95 entry placed (kline signal)
        makeKline(100, 108, 90, 105), // bar 1: BUY@95 fills; TP@300 registered
        makeKline(105, 112, 98, lastClose), // bar 2: TP@300 not hit; end of run → force close
      ];
      const result = await engine.runBacktest(
        () => strategy,
        BASE_CONFIG,
        makeDataManager(klines),
      );

      expect(result.totalTrades).toBe(1);
      expect(result.trades[0].exitPrice.toNumber()).toBeCloseTo(lastClose, 1);
    });

    it('4b. No TP placed at all — entry fills → no activeExit → no force-close trade', async () => {
      // The engine only force-closes positions tracked in activeExits.
      // A strategy that places no opposite-side signal after an entry fill leaves
      // nothing in activeExits — so there is no force-close trade at end-of-run.
      // This is correct: the backtest cannot know the position exists without a TP signal.
      // Strategies that want force-close behaviour must place at least a TP signal.
      const entryCid = nextCid('E');
      let placed = false;

      const strategy = buildStrategy({
        analyze: async (u: DataUpdate): Promise<StrategyAnalyzeResult> => {
          if (u.klines && !placed) {
            placed = true;
            return {
              action: 'buy',
              clientOrderId: entryCid,
              price: new Decimal(95),
              quantity: new Decimal(1),
            };
          }
          return { action: 'hold' };
        },
      });

      const klines = [
        makeKline(100, 108, 88, 100), // bar 0: entry placed
        makeKline(100, 108, 90, 100), // bar 1: BUY@95 fills; no TP placed
        makeKline(100, 108, 95, 105), // bar 2: end
      ];
      const result = await engine.runBacktest(
        () => strategy,
        BASE_CONFIG,
        makeDataManager(klines),
      );

      // New behavior: entry fills, stays open, then force-closed at end of run → 1 trade
      expect(result.totalTrades).toBe(1);
    });

    it('4c. Multiple open positions force-closed — all recorded', async () => {
      // processInitialData places two BUY entries; both fill; TPs unreachable; both force-closed
      const cid1 = nextCid('E'),
        tp1 = nextCid('T');
      const cid2 = nextCid('E'),
        tp2 = nextCid('T');
      const tpPlaced = new Set<string>();

      const strategy = buildStrategy({
        processInitialData: async (): Promise<StrategyAnalyzeResult> => [
          {
            action: 'buy',
            clientOrderId: cid1,
            price: new Decimal(92),
            quantity: new Decimal(1),
          },
          {
            action: 'buy',
            clientOrderId: cid2,
            price: new Decimal(95),
            quantity: new Decimal(1),
          },
        ],
        analyze: async (u: DataUpdate): Promise<StrategyAnalyzeResult> => {
          const sigs: StrategyResult[] = [];
          if (u.orders) {
            for (const o of u.orders) {
              if (
                o.clientOrderId === cid1 &&
                o.status === OrderStatus.FILLED &&
                !tpPlaced.has(cid1)
              ) {
                tpPlaced.add(cid1);
                sigs.push({
                  action: 'sell',
                  clientOrderId: tp1,
                  price: new Decimal(500),
                  quantity: new Decimal(1),
                });
              }
              if (
                o.clientOrderId === cid2 &&
                o.status === OrderStatus.FILLED &&
                !tpPlaced.has(cid2)
              ) {
                tpPlaced.add(cid2);
                sigs.push({
                  action: 'sell',
                  clientOrderId: tp2,
                  price: new Decimal(500),
                  quantity: new Decimal(1),
                });
              }
            }
          }
          return sigs.length > 0 ? sigs : { action: 'hold' };
        },
      });

      const klines = [
        makeKline(100, 105, 85, 100), // bar 0: both entries fill (low=85 < 92)
        makeKline(100, 108, 93, 105), // bar 1: TPs@500 not hit; end of run
      ];
      const result = await engine.runBacktest(
        () => strategy,
        BASE_CONFIG,
        makeDataManager(klines),
      );

      expect(result.totalTrades).toBe(2);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. MA-style: SL fires → strategy cancels paired TP
  // ───────────────────────────────────────────────────────────────────────────

  describe('5. MA-style: SL fires → strategy cancels paired TP → single trade', () => {
    it('5a. SL hit → strategy cancels TP → only 1 trade, not 2', async () => {
      // Entry BUY@95; TP SELL@150 (far away); SL at 5% below entry = ~90.25
      // Bar 1: entry fills. Bar 2: low=80 → engine-SL@90.25 triggers.
      // Engine notifies strategy via analyze({orders:[CANCELED(tpCid)]}).
      // Strategy responds with cancel(tpCid) — TP removed from activeExits.
      // Expected: 1 loss trade. No second force-close trade.
      const entryCid = nextCid('E');
      const tpCid = nextCid('T');
      let entryPlaced = false;
      let tpPlaced = false;

      const strategy = buildStrategy({
        analyze: async (u: DataUpdate): Promise<StrategyAnalyzeResult> => {
          const sigs: StrategyResult[] = [];
          if (u.klines && !entryPlaced) {
            entryPlaced = true;
            sigs.push({
              action: 'buy',
              clientOrderId: entryCid,
              price: new Decimal(95),
              quantity: new Decimal(1),
            });
          }
          if (u.orders) {
            for (const o of u.orders) {
              if (
                o.clientOrderId === entryCid &&
                o.status === OrderStatus.FILLED &&
                !tpPlaced
              ) {
                tpPlaced = true;
                sigs.push({
                  action: 'sell',
                  clientOrderId: tpCid,
                  price: new Decimal(150),
                  quantity: new Decimal(1),
                });
              }
              // Engine sends CANCELED to the TP cid when SL fires (using CANCELED status for SL)
              if (o.clientOrderId === tpCid && o.status === OrderStatus.CANCELED) {
                sigs.push({ action: 'cancel', clientOrderId: tpCid });
              }
            }
          }
          return sigs.length > 0 ? sigs : { action: 'hold' };
        },
      });

      const klines = [
        makeKline(100, 108, 88, 102), // bar 0: entry placed (kline)
        makeKline(100, 108, 90, 105), // bar 1: entry BUY@95 fills; TP@150 registered
        makeKline(98, 100, 78, 80), // bar 2: low=78 → engine SL@~90.25 fires (5% below 95)
      ];
      const result = await engine.runBacktest(
        () => strategy,
        { ...BASE_CONFIG, stopLossPercent: 5 },
        makeDataManager(klines),
      );

      expect(result.totalTrades).toBe(1);
      expect(result.trades[0].pnl.lt(0)).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. SpreadGrid-style: cancel + replace cycle
  // ───────────────────────────────────────────────────────────────────────────

  describe('6. SpreadGrid-style: fill → cancel sibling → place replacement orders', () => {
    it('6a. Full grid cycle: BUY fills → cancel SELL sibling → place new BUY+SELL (TP)', async () => {
      // processInitialData: BUY@90, SELL@110 (sibling)
      // Bar 0: BUY@90 fills (low=85).
      //   Fill response: cancel(SELL@110) + new same-dir BUY@85 + new opp-dir SELL@95 (TP)
      // Bar 1: SELL@95 (TP) fills (high=100) → 1 completed round-trip
      //   new BUY@85 still pending (low=88 > 85)
      // Result: 1 trade (BUY@90 → SELL@95 exit), 1 pending entry still open at end
      const buyCid = nextCid('E');
      const sellCid = nextCid('E'); // sibling SELL — gets cancelled
      const newBuyCid = nextCid('E'); // replacement BUY below fill price
      const tpCid = nextCid('T'); // replacement SELL above fill price — acts as TP
      const filledEntry = new Set<string>();

      const strategy = buildStrategy({
        processInitialData: async (): Promise<StrategyAnalyzeResult> => [
          {
            action: 'buy',
            clientOrderId: buyCid,
            price: new Decimal(90),
            quantity: new Decimal(1),
          },
          {
            action: 'sell',
            clientOrderId: sellCid,
            price: new Decimal(110),
            quantity: new Decimal(1),
          },
        ],
        analyze: async (u: DataUpdate): Promise<StrategyAnalyzeResult> => {
          if (u.orders) {
            const buyFill = u.orders.find(
              (o) =>
                o.clientOrderId === buyCid &&
                o.status === OrderStatus.FILLED &&
                !filledEntry.has(buyCid),
            );
            if (buyFill) {
              filledEntry.add(buyCid);
              return [
                { action: 'cancel', clientOrderId: sellCid }, // cancel sibling
                {
                  action: 'buy',
                  clientOrderId: newBuyCid,
                  price: new Decimal(85),
                  quantity: new Decimal(1),
                }, // same-dir → pendingEntries
                {
                  action: 'sell',
                  clientOrderId: tpCid,
                  price: new Decimal(95),
                  quantity: new Decimal(1),
                }, // opp-dir → TP exit
              ];
            }
          }
          return { action: 'hold' };
        },
      });

      const klines = [
        makeKline(100, 115, 85, 95), // bar 0: BUY@90 fills; SELL sibling cancelled; TP@95 registered
        makeKline(95, 100, 88, 98), // bar 1: TP@95 fills (high=100). newBuy@85 still pending (low=88>85).
      ];
      const result = await engine.runBacktest(
        () => strategy,
        BASE_CONFIG,
        makeDataManager(klines),
      );

      // 1 completed trade: BUY@90 → SELL@95
      expect(result.totalTrades).toBe(1);
      expect(result.trades[0].side).toBe(OrderSide.BUY);
      expect(result.trades[0].entryPrice.toNumber()).toBeCloseTo(90, 1);
      expect(result.trades[0].exitPrice.toNumber()).toBeCloseTo(95, 1);
      expect(result.trades[0].pnl.gt(0)).toBe(true);
    });

    it('6b. Cancelled SELL sibling does NOT create a trade record', async () => {
      // Same setup but verify there is no trade with entrySide=SELL that would hint
      // the cancelled SELL was treated as an entry that got filled.
      const buyCid = nextCid('E');
      const sellCid = nextCid('E');
      const tpCid = nextCid('T');
      const filledEntry = new Set<string>();

      const strategy = buildStrategy({
        processInitialData: async (): Promise<StrategyAnalyzeResult> => [
          {
            action: 'buy',
            clientOrderId: buyCid,
            price: new Decimal(90),
            quantity: new Decimal(1),
          },
          {
            action: 'sell',
            clientOrderId: sellCid,
            price: new Decimal(110),
            quantity: new Decimal(1),
          },
        ],
        analyze: async (u: DataUpdate): Promise<StrategyAnalyzeResult> => {
          if (u.orders) {
            const f = u.orders.find(
              (o) =>
                o.clientOrderId === buyCid &&
                o.status === OrderStatus.FILLED &&
                !filledEntry.has(buyCid),
            );
            if (f) {
              filledEntry.add(buyCid);
              return [
                { action: 'cancel', clientOrderId: sellCid },
                {
                  action: 'sell',
                  clientOrderId: tpCid,
                  price: new Decimal(95),
                  quantity: new Decimal(1),
                },
              ];
            }
          }
          return { action: 'hold' };
        },
      });

      const klines = [
        makeKline(100, 115, 85, 95), // BUY fills; SELL cancelled
        makeKline(95, 100, 88, 98), // TP fills
      ];
      const result = await engine.runBacktest(
        () => strategy,
        BASE_CONFIG,
        makeDataManager(klines),
      );

      const sellEntryTrades = result.trades.filter((t) => t.side === OrderSide.SELL);
      expect(sellEntryTrades).toHaveLength(0);
    });

    it('6c. Multi-cycle grid: two round-trips produce two trades', async () => {
      // Cycle 1: processInitialData places BUY@90 (sibling SELL@110 is a pending entry).
      //   Bar 0: BUY@90 fills. Fill response:
      //     - cancel(sell1)       → removes SELL@110 from pendingEntries
      //     - SELL TP@95          → goes to activeExits (opposite-side → TP for BUY)
      //   Bar 1: TP SELL@95 fills. Fill response:
      //     - new BUY entry@90    → pendingEntries (cycle 2 entry)
      //     - new SELL entry@110  → pendingEntries (cycle 2 sibling)
      //   Bar 2: BUY@90 fills (low=88). Fill response:
      //     - cancel(sell cycle2) → removes SELL@110
      //     - SELL TP@95          → activeExits (TP for cycle 2 BUY)
      //   Bar 3: TP SELL@95 fills. → 2nd trade complete.
      const buy1 = nextCid('E'),
        sell1 = nextCid('E'),
        tp1 = nextCid('T');
      const buy2 = nextCid('E'),
        sell2 = nextCid('E'),
        tp2 = nextCid('T');
      const filled = new Set<string>();

      const strategy = buildStrategy({
        processInitialData: async (): Promise<StrategyAnalyzeResult> => [
          {
            action: 'buy',
            clientOrderId: buy1,
            price: new Decimal(90),
            quantity: new Decimal(1),
          },
          {
            action: 'sell',
            clientOrderId: sell1,
            price: new Decimal(110),
            quantity: new Decimal(1),
          },
        ],
        analyze: async (u: DataUpdate): Promise<StrategyAnalyzeResult> => {
          const sigs: StrategyResult[] = [];
          if (u.orders) {
            for (const o of u.orders) {
              if (
                o.clientOrderId === buy1 &&
                o.status === OrderStatus.FILLED &&
                !filled.has(buy1)
              ) {
                filled.add(buy1);
                sigs.push({ action: 'cancel', clientOrderId: sell1 });
                sigs.push({
                  action: 'sell',
                  clientOrderId: tp1,
                  price: new Decimal(95),
                  quantity: new Decimal(1),
                });
              }
              if (
                o.clientOrderId === tp1 &&
                o.status === OrderStatus.FILLED &&
                !filled.has(tp1)
              ) {
                filled.add(tp1);
                // Start cycle 2
                sigs.push({
                  action: 'buy',
                  clientOrderId: buy2,
                  price: new Decimal(90),
                  quantity: new Decimal(1),
                });
                sigs.push({
                  action: 'sell',
                  clientOrderId: sell2,
                  price: new Decimal(110),
                  quantity: new Decimal(1),
                });
              }
              if (
                o.clientOrderId === buy2 &&
                o.status === OrderStatus.FILLED &&
                !filled.has(buy2)
              ) {
                filled.add(buy2);
                sigs.push({ action: 'cancel', clientOrderId: sell2 });
                sigs.push({
                  action: 'sell',
                  clientOrderId: tp2,
                  price: new Decimal(95),
                  quantity: new Decimal(1),
                });
              }
            }
          }
          return sigs.length > 0 ? sigs : { action: 'hold' };
        },
      });

      const klines = [
        makeKline(100, 115, 85, 95), // bar 0: BUY@90 fills; cancel sell1; TP1@95 registered
        makeKline(95, 100, 88, 98), // bar 1: TP1@95 fills; buy2@90 + sell2@110 placed
        makeKline(98, 105, 85, 95), // bar 2: BUY2@90 fills; cancel sell2; TP2@95 registered
        makeKline(95, 100, 88, 98), // bar 3: TP2@95 fills → 2nd trade complete
      ];
      const result = await engine.runBacktest(
        () => strategy,
        BASE_CONFIG,
        makeDataManager(klines),
      );

      expect(result.totalTrades).toBe(2);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. TTL expiry notification
  // ───────────────────────────────────────────────────────────────────────────

  describe('7. TTL expiry strategy notification', () => {
    it('7a. Engine notifies strategy with CANCELED on TTL expiry', async () => {
      const cid = nextCid();
      let placed = false;
      let gotCanceled = false;

      const strategy = buildStrategy({
        analyze: async (u: DataUpdate): Promise<StrategyAnalyzeResult> => {
          if (u.klines && !placed) {
            placed = true;
            return {
              action: 'buy',
              clientOrderId: cid,
              price: new Decimal(10),
              quantity: new Decimal(1),
            };
          }
          if (u.orders) {
            const cancelled = u.orders.find(
              (o) => o.clientOrderId === cid && o.status === OrderStatus.CANCELED,
            );
            if (cancelled) gotCanceled = true;
          }
          return { action: 'hold' };
        },
      });

      const klines = [
        makeKline(100, 110, 90, 100),
        makeKline(100, 110, 90, 100), // TTL=1 → expires here
        makeKline(100, 110, 90, 100),
      ];
      await engine.runBacktest(
        () => strategy,
        { ...BASE_CONFIG, entryTtlBars: 1 },
        makeDataManager(klines),
      );

      expect(gotCanceled).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. Multiple fills on same bar
  // ───────────────────────────────────────────────────────────────────────────

  describe('8. Multiple fills on the same bar', () => {
    it('8a. Two entry fills on same bar → two TPs → both recorded', async () => {
      // processInitialData: BUY@92 and BUY@95
      // Bar 0: low=85 → both fill. Each returns SELL TP@115. Bar 1: high=120 → both TPs hit.
      const cid1 = nextCid('E'),
        tp1 = nextCid('T');
      const cid2 = nextCid('E'),
        tp2 = nextCid('T');
      const tpPlaced = new Set<string>();

      const strategy = buildStrategy({
        processInitialData: async (): Promise<StrategyAnalyzeResult> => [
          {
            action: 'buy',
            clientOrderId: cid1,
            price: new Decimal(92),
            quantity: new Decimal(1),
          },
          {
            action: 'buy',
            clientOrderId: cid2,
            price: new Decimal(95),
            quantity: new Decimal(1),
          },
        ],
        analyze: async (u: DataUpdate): Promise<StrategyAnalyzeResult> => {
          const sigs: StrategyResult[] = [];
          if (u.orders) {
            for (const o of u.orders) {
              if (
                o.clientOrderId === cid1 &&
                o.status === OrderStatus.FILLED &&
                !tpPlaced.has(cid1)
              ) {
                tpPlaced.add(cid1);
                sigs.push({
                  action: 'sell',
                  clientOrderId: tp1,
                  price: new Decimal(115),
                  quantity: new Decimal(1),
                });
              }
              if (
                o.clientOrderId === cid2 &&
                o.status === OrderStatus.FILLED &&
                !tpPlaced.has(cid2)
              ) {
                tpPlaced.add(cid2);
                sigs.push({
                  action: 'sell',
                  clientOrderId: tp2,
                  price: new Decimal(115),
                  quantity: new Decimal(1),
                });
              }
            }
          }
          return sigs.length > 0 ? sigs : { action: 'hold' };
        },
      });

      const klines = [
        makeKline(100, 108, 85, 100), // bar 0: both entries fill
        makeKline(100, 120, 95, 118), // bar 1: both TPs@115 fill (high=120 >= 115)
      ];
      const result = await engine.runBacktest(
        () => strategy,
        BASE_CONFIG,
        makeDataManager(klines),
      );

      expect(result.totalTrades).toBe(2);
      expect(result.trades.every((t) => t.pnl.gt(0))).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. PnL and balance accounting
  // ───────────────────────────────────────────────────────────────────────────

  describe('9. Balance and PnL accounting', () => {
    it('9a. Commission is deducted from PnL', async () => {
      const entryCid = nextCid('E');
      const tpCid = nextCid('T');
      let entryPlaced = false;
      let tpPlaced = false;

      const strategy = buildStrategy({
        analyze: async (u: DataUpdate): Promise<StrategyAnalyzeResult> => {
          if (u.klines && !entryPlaced) {
            entryPlaced = true;
            return {
              action: 'buy',
              clientOrderId: entryCid,
              price: new Decimal(100),
              quantity: new Decimal(1),
            };
          }
          if (u.orders && !tpPlaced) {
            const f = u.orders.find(
              (o) => o.clientOrderId === entryCid && o.status === OrderStatus.FILLED,
            );
            if (f) {
              tpPlaced = true;
              return {
                action: 'sell',
                clientOrderId: tpCid,
                price: new Decimal(110),
                quantity: new Decimal(1),
              };
            }
          }
          return { action: 'hold' };
        },
      });

      const commission = new Decimal('0.001'); // 0.1%
      const klines = [
        makeKline(100, 108, 95, 102), // bar 0: entry placed
        makeKline(102, 112, 98, 110), // bar 1: entry fills; TP@110 registered
        makeKline(110, 115, 105, 112), // bar 2: TP@110 hits
      ];
      const result = await engine.runBacktest(
        () => strategy,
        { ...BASE_CONFIG, commission },
        makeDataManager(klines),
      );

      expect(result.totalTrades).toBe(1);
      const trade = result.trades[0];
      // The engine records pnl = (exitPrice - entryPrice)*qty - exitCommission - entryCommission.
      // Entry commission is deducted from cash and NOW included in the trade.pnl field.
      // gross = (110-100)*1 = 10
      // entry commission = 100*1*0.001 = 0.1
      // exit commission = 110*1*0.001 = 0.11
      // pnl stored in trade ≈ 10 - 0.1 - 0.11 = 9.79
      expect(trade.pnl.toNumber()).toBeCloseTo(9.79, 1);
      expect(trade.commission.toNumber()).toBeCloseTo(0.21, 2);
    });

    it('9b. Final equity increases after profitable trade', async () => {
      const entryCid = nextCid('E');
      const tpCid = nextCid('T');
      let entryPlaced = false;
      let tpPlaced = false;

      const strategy = buildStrategy({
        analyze: async (u: DataUpdate): Promise<StrategyAnalyzeResult> => {
          if (u.klines && !entryPlaced) {
            entryPlaced = true;
            return {
              action: 'buy',
              clientOrderId: entryCid,
              price: new Decimal(95),
              quantity: new Decimal(1),
            };
          }
          if (u.orders && !tpPlaced) {
            const f = u.orders.find(
              (o) => o.clientOrderId === entryCid && o.status === OrderStatus.FILLED,
            );
            if (f) {
              tpPlaced = true;
              return {
                action: 'sell',
                clientOrderId: tpCid,
                price: new Decimal(110),
                quantity: new Decimal(1),
              };
            }
          }
          return { action: 'hold' };
        },
      });

      const klines = [
        makeKline(100, 108, 88, 100),
        makeKline(100, 108, 90, 105), // fills
        makeKline(105, 115, 100, 112), // TP hits
      ];
      const result = await engine.runBacktest(
        () => strategy,
        BASE_CONFIG,
        makeDataManager(klines),
      );
      const finalEquity = result.equity[result.equity.length - 1]?.value;
      expect(finalEquity?.gt(BASE_CONFIG.initialBalance)).toBe(true);
    });

    it('9c. Final equity decreases after force-closed loss', async () => {
      const entryCid = nextCid('E');
      let placed = false;

      const strategy = buildStrategy({
        analyze: async (u: DataUpdate): Promise<StrategyAnalyzeResult> => {
          if (u.klines && !placed) {
            placed = true;
            return {
              action: 'buy',
              clientOrderId: entryCid,
              price: new Decimal(95),
              quantity: new Decimal(1),
            };
          }
          return { action: 'hold' };
        },
      });

      const klines = [
        makeKline(100, 108, 88, 100), // bar 0: entry placed
        makeKline(100, 108, 90, 100), // bar 1: BUY@95 fills
        makeKline(95, 98, 78, 80), // bar 2: force-close at 80 < entry price 95 = loss
      ];
      const result = await engine.runBacktest(
        () => strategy,
        BASE_CONFIG,
        makeDataManager(klines),
      );
      const finalEquity = result.equity[result.equity.length - 1]?.value;
      expect(finalEquity?.lt(BASE_CONFIG.initialBalance)).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 10. No-signal strategy
  // ───────────────────────────────────────────────────────────────────────────

  describe('10. No-signal strategy', () => {
    it('10a. Zero trades, balance unchanged', async () => {
      const strategy = buildStrategy(); // always holds
      const klines = Array.from({ length: 5 }, () => makeKline(100, 110, 90, 105));
      const result = await engine.runBacktest(
        () => strategy,
        BASE_CONFIG,
        makeDataManager(klines),
      );

      expect(result.totalTrades).toBe(0);
      expect(result.winRate.toNumber()).toBe(0);
      const finalEquity = result.equity[result.equity.length - 1]?.value;
      expect(finalEquity?.toNumber()).toBeCloseTo(10_000, 0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 11. isCancelOrderResult type guard
  // ───────────────────────────────────────────────────────────────────────────

  describe('11. isCancelOrderResult type guard', () => {
    it('11a. Correctly identifies cancel, buy, and hold results', () => {
      expect(isCancelOrderResult({ action: 'cancel', clientOrderId: 'X1' })).toBe(true);
      expect(
        isCancelOrderResult({
          action: 'buy',
          clientOrderId: 'X2',
          price: new Decimal(1),
          quantity: new Decimal(1),
        }),
      ).toBe(false);
      expect(isCancelOrderResult({ action: 'hold' })).toBe(false);
    });
  });
});
