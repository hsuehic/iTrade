import { Decimal } from 'decimal.js';
import {
  BacktestConfig,
  BacktestResult,
  BacktestTrade,
  IBacktestEngine,
  IStrategy,
  IDataManager,
  Kline,
  KlineInterval,
  OrderBook,
  OrderSide,
  OrderStatus,
  OrderType,
  TimeInForce,
  normalizeAnalyzeResult,
  isHoldResult,
  isActionableResult,
  isCancelOrderResult,
  isUpdateOrderResult,
} from '@itrade/core';

// ─────────────────────────────────────────────────────────────────────────────
// Internal order state types
// ─────────────────────────────────────────────────────────────────────────────

/** A limit entry order waiting to be filled on a future bar. */
interface PendingEntry {
  clientOrderId: string;
  side: OrderSide; // BUY = long entry, SELL = short entry
  price: Decimal;
  quantity: Decimal;
  barIndex: number; // bar at which the order was placed (for TTL tracking)
  /** Leverage multiplier from the order signal (1 = no leverage). */
  leverage: number;
}

/** A filled entry position whose take-profit (and optional stop-loss) are being tracked. */
interface ActiveExit {
  clientOrderId: string; // TP order's clientOrderId from the strategy signal
  tpPrice: Decimal;
  slPrice: Decimal | null; // null when stopLossPercent is 0
  entrySide: OrderSide; // side of the ENTRY that opened this position
  entryPrice: Decimal;
  quantity: Decimal;
  entryTime: Date;
  /** Cash balance immediately after the entry order filled */
  entryCashBalance: Decimal;
  /** Total open position size immediately after the entry order filled */
  entryPositionSize: Decimal;
  /** Leverage multiplier used when this position was opened (1 = no leverage). */
  leverage: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build a synthetic Order object to feed back to strategy.analyze()
// ─────────────────────────────────────────────────────────────────────────────

let _orderId = 1;
function buildOrder(
  clientOrderId: string,
  symbol: string,
  side: OrderSide,
  price: Decimal,
  quantity: Decimal,
  status: OrderStatus,
  exchange: string,
) {
  return {
    id: String(_orderId++),
    clientOrderId,
    symbol,
    side,
    type: OrderType.LIMIT,
    quantity,
    price,
    averagePrice: price,
    executedQuantity: quantity,
    status,
    timeInForce: TimeInForce.GTC,
    timestamp: new Date(),
    exchange,
  };
}

/** Convert OrderSide enum to the 'buy' | 'sell' literal used in Trade.side. */
function toTradeSide(side: OrderSide): 'buy' | 'sell' {
  return side === OrderSide.BUY ? 'buy' : 'sell';
}

/**
 * Build a minimal synthetic OrderBook centred on `midPrice`.
 *
 * Used to satisfy strategies that gate signals behind a freshness check
 * (e.g. SpreadGridStrategy's `checkMarketPrice` flag). The 0.01% half-spread
 * is tight enough that any reasonable limit-order price will pass the
 * maker-price validation inside the strategy.
 */
function buildSyntheticOrderBook(
  symbol: string,
  exchange: string,
  midPrice: Decimal,
): OrderBook {
  const halfSpread = midPrice.mul(new Decimal('0.0001')); // 0.01%
  return {
    symbol,
    exchange,
    timestamp: new Date(), // always fresh → never stale
    bids: [[midPrice.minus(halfSpread), new Decimal(1000)]],
    asks: [[midPrice.plus(halfSpread), new Decimal(1000)]],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BacktestEngine
// ─────────────────────────────────────────────────────────────────────────────

export class BacktestEngine implements IBacktestEngine {
  // ── Public entry point ─────────────────────────────────────────────────────

  /**
   * Run a backtest for all symbols in `config` using one isolated strategy
   * instance per symbol (created via `strategyFactory`).
   *
   * Simulation loop per bar:
   *   1. Check whether any pending limit entry orders fill on this bar.
   *   2. Check whether any active TP / SL orders are hit on this bar.
   *   3. For each fill, call strategy.analyze({ orders }) + onTradeExecuted()
   *      so the strategy can react (e.g. place a TP order after an entry fill).
   *   4. Call strategy.analyze({ klines: [bar] }) for the MA / signal logic.
   *   5. Queue any new entry / cancel signals from step 4.
   *   6. Record MTM equity snapshot.
   *
   * At end of run, open positions are closed at the last bar's close price.
   */
  public async runBacktest(
    strategyFactory: (symbol: string) => IStrategy,
    config: BacktestConfig,
    dataManager: IDataManager,
  ): Promise<BacktestResult> {
    const entryTtlBars = config.entryTtlBars ?? 16;
    const stopLossPct = config.stopLossPercent ?? 0;

    const allTrades: BacktestTrade[] = [];
    const equityCurve: Array<{ timestamp: Date; value: Decimal }> = [];

    // Start equity at initialBalance; each symbol simulation adjusts the
    // running cash balance independently then we aggregate.
    let runningBalance = new Decimal(config.initialBalance);

    equityCurve.push({ timestamp: config.startDate, value: runningBalance });

    for (const symbol of config.symbols ?? []) {
      const strategy = strategyFactory(symbol);
      const exchange = Array.isArray(strategy.config.exchange)
        ? strategy.config.exchange[0]
        : strategy.config.exchange;

      const klines = await dataManager.getKlines(
        symbol,
        config.timeframe ?? '1h',
        config.startDate,
        config.endDate,
      );

      if (klines.length === 0) continue;

      const { trades, finalBalance, symbolEquity } = await this.simulateSymbol(
        symbol,
        exchange,
        strategy,
        klines,
        runningBalance,
        config.commission,
        config.slippage,
        entryTtlBars,
        stopLossPct,
      );

      allTrades.push(...trades);
      runningBalance = finalBalance;

      // Merge symbol equity snapshots into the global curve.
      for (const point of symbolEquity) {
        equityCurve.push(point);
      }
    }

    // Sort equity curve chronologically.
    equityCurve.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return this.calculateMetrics(
      allTrades,
      new Decimal(config.initialBalance),
      equityCurve,
    );
  }

  // ── Per-symbol simulation ──────────────────────────────────────────────────

  private async simulateSymbol(
    symbol: string,
    exchange: string,
    strategy: IStrategy,
    klines: Kline[],
    initialBalance: Decimal,
    commissionRate: Decimal,
    slippage: Decimal | undefined,
    entryTtlBars: number,
    stopLossPct: number,
  ): Promise<{
    trades: BacktestTrade[];
    finalBalance: Decimal;
    symbolEquity: Array<{ timestamp: Date; value: Decimal }>;
  }> {
    let cash = new Decimal(initialBalance);

    // Pending limit entry orders: clientOrderId → PendingEntry
    const pendingEntries = new Map<string, PendingEntry>();

    // Active exits being tracked: clientOrderId → ActiveExit
    const activeExits = new Map<string, ActiveExit>();

    const trades: BacktestTrade[] = [];
    const symbolEquity: Array<{ timestamp: Date; value: Decimal }> = [];

    const slMultiplierLong =
      stopLossPct > 0 ? new Decimal(1).minus(new Decimal(stopLossPct).div(100)) : null;
    const slMultiplierShort =
      stopLossPct > 0 ? new Decimal(1).plus(new Decimal(stopLossPct).div(100)) : null;

    // ── Helper: register new entry signals as pending limit orders and notify
    //    the strategy via onOrderCreated so it can track openLowerOrder /
    //    openUpperOrder.  This mirrors the live-trading confirmation flow and
    //    prevents strategies from repeatedly regenerating the same orders.
    const registerEntrySigs = async (
      sigs: ReturnType<typeof normalizeAnalyzeResult>,
      barIndex: number,
    ) => {
      for (const sig of sigs) {
        if (isHoldResult(sig) || !isActionableResult(sig)) continue;
        if (isCancelOrderResult(sig) || isUpdateOrderResult(sig)) continue;
        if (!sig.quantity || !sig.price || !sig.clientOrderId) continue;
        if (sig.action !== 'buy' && sig.action !== 'sell') continue;

        const side = sig.action === 'buy' ? OrderSide.BUY : OrderSide.SELL;
        // Leverage priority:
        //   1. Per-signal `leverage` field (set by the strategy in each order signal)
        //   2. Strategy parameters `leverage` key (strategy-level default)
        //   3. 1 (no leverage — spot-like)
        const strategyParamLeverage =
          typeof (strategy.config.parameters as Record<string, unknown>)?.leverage ===
          'number'
            ? ((strategy.config.parameters as Record<string, unknown>).leverage as number)
            : undefined;
        const signalLeverage = sig.leverage ?? strategyParamLeverage ?? 1;
        pendingEntries.set(sig.clientOrderId, {
          clientOrderId: sig.clientOrderId,
          side,
          price: sig.price,
          quantity: sig.quantity,
          barIndex,
          leverage: signalLeverage,
        });

        // Notify strategy that the order has been "confirmed" (NEW status).
        // This keeps openLowerOrder / openUpperOrder in sync and prevents the
        // strategy from treating the order as still-pending-confirmation.
        if (strategy.onOrderCreated) {
          await strategy.onOrderCreated(
            buildOrder(
              sig.clientOrderId,
              symbol,
              side,
              sig.price,
              sig.quantity,
              OrderStatus.NEW,
              exchange,
            ),
          );
        }
      }
    };

    // ── Bootstrap: call processInitialData so order-driven strategies
    //    (e.g. SpreadGridStrategy) can place their initial entry orders.
    //    We synthesise a fresh OrderBook from the first bar's close price so
    //    that strategies gated behind a freshness check can generate signals.
    {
      const initOB = buildSyntheticOrderBook(symbol, exchange, klines[0].close);
      const initSigs = normalizeAnalyzeResult(
        await strategy.processInitialData({
          symbol,
          exchange,
          timestamp: klines[0].openTime,
          orderBook: initOB,
        }),
      );
      await registerEntrySigs(initSigs, 0);
    }

    for (let barIdx = 0; barIdx < klines.length; barIdx++) {
      const bar = klines[barIdx];
      const bullish = bar.close.gte(bar.open);

      // ── Phase 1: Collect fills for this bar ─────────────────────────────────

      const fills: Array<
        | { type: 'entry'; entry: PendingEntry; fillPrice: Decimal }
        | { type: 'tp'; exit: ActiveExit; fillPrice: Decimal }
        | { type: 'sl'; exit: ActiveExit; fillPrice: Decimal }
      > = [];

      // Collect TTL-expired orders first so we can notify the strategy before
      // processing fills.  This keeps strategy state (openLowerOrder etc.) clean
      // and allows order-driven strategies (e.g. SpreadGrid) to regenerate
      // entries after an expiry.
      const ttlExpired: PendingEntry[] = [];
      for (const [cid, entry] of pendingEntries) {
        if (barIdx - entry.barIndex >= entryTtlBars) {
          pendingEntries.delete(cid);
          ttlExpired.push(entry);
        }
      }
      if (ttlExpired.length > 0) {
        const ttlOB = buildSyntheticOrderBook(symbol, exchange, bar.close);
        for (const expired of ttlExpired) {
          const cancelledOrder = buildOrder(
            expired.clientOrderId,
            symbol,
            expired.side,
            expired.price,
            expired.quantity,
            OrderStatus.CANCELED,
            exchange,
          );
          const ttlSigs = normalizeAnalyzeResult(
            await strategy.analyze({
              exchangeName: exchange,
              symbol,
              orders: [cancelledOrder],
              orderbook: ttlOB,
            }),
          );
          // Re-entry signals from TTL cancellation (strategy may decide to
          // replace the expired order with a fresh one at the current price).
          await registerEntrySigs(ttlSigs, barIdx);
        }
      }

      // Pending entry fills
      for (const [cid, entry] of pendingEntries) {
        const hit =
          entry.side === OrderSide.BUY
            ? bar.low.lte(entry.price) // long entry: price dips to or below order price
            : bar.high.gte(entry.price); // short entry: price rises to or above order price

        if (hit) {
          fills.push({
            type: 'entry',
            entry,
            fillPrice: this.applySlippage(entry.price, entry.side, slippage),
          });
          pendingEntries.delete(cid);
        }
      }

      // Active TP / SL fills
      for (const [cid, exit] of activeExits) {
        const isLong = exit.entrySide === OrderSide.BUY;

        const tpHit = isLong
          ? bar.high.gte(exit.tpPrice) // long TP: price rises to TP
          : bar.low.lte(exit.tpPrice); // short TP: price falls to TP
        const slHit =
          exit.slPrice !== null &&
          (isLong
            ? bar.low.lte(exit.slPrice) // long SL: price drops to SL
            : bar.high.gte(exit.slPrice)); // short SL: price rises to SL

        if (tpHit && slHit) {
          // Both hit on same bar — use candle direction as tie-breaker
          const tpWins = isLong ? bullish : !bullish;
          if (tpWins) {
            fills.push({
              type: 'tp',
              exit,
              fillPrice: this.applySlippage(
                exit.tpPrice,
                isLong ? OrderSide.SELL : OrderSide.BUY,
                slippage,
              ),
            });
          } else {
            fills.push({
              type: 'sl',
              exit,
              fillPrice: this.applySlippage(
                exit.slPrice!,
                isLong ? OrderSide.SELL : OrderSide.BUY,
                slippage,
              ),
            });
          }
          activeExits.delete(cid);
        } else if (tpHit) {
          fills.push({
            type: 'tp',
            exit,
            fillPrice: this.applySlippage(
              exit.tpPrice,
              isLong ? OrderSide.SELL : OrderSide.BUY,
              slippage,
            ),
          });
          activeExits.delete(cid);
        } else if (slHit) {
          fills.push({
            type: 'sl',
            exit,
            fillPrice: this.applySlippage(
              exit.slPrice!,
              isLong ? OrderSide.SELL : OrderSide.BUY,
              slippage,
            ),
          });
          activeExits.delete(cid);
        }
      }

      // ── Phase 2: Process fills and notify strategy ───────────────────────────

      for (const fill of fills) {
        if (fill.type === 'entry') {
          const { entry, fillPrice } = fill;
          const isLong = entry.side === OrderSide.BUY;
          const entryLeverage = entry.leverage; // ≥ 1
          const comm = fillPrice.mul(entry.quantity).mul(commissionRate);
          // Margin required = notional / leverage.  At leverage=1 this equals the
          // full notional (spot-like behaviour for longs).  For perpetual futures
          // both sides lock margin; the classic "short receives proceeds" model
          // only applies when leverage=1 AND the side is SELL.
          const margin = fillPrice.mul(entry.quantity).div(entryLeverage);

          if (entryLeverage === 1 && !isLong) {
            // Spot-style short: receive full sale proceeds, deduct commission
            cash = cash.plus(fillPrice.mul(entry.quantity)).minus(comm);
          } else {
            // Futures-style (or leveraged): lock margin, deduct commission
            cash = cash.minus(margin).minus(comm);
          }

          // Snapshot cash immediately after entry fills (before TP registration).
          const entryCashBalance = cash.plus(new Decimal(0));

          // Notify strategy of the entry fill → it should respond with a TP order
          const filledOrder = buildOrder(
            entry.clientOrderId,
            symbol,
            entry.side,
            fillPrice,
            entry.quantity,
            OrderStatus.FILLED,
            exchange,
          );
          // Supply a fresh synthetic orderbook so strategies that gate signals
          // behind a price-freshness check (e.g. SpreadGridStrategy) can
          // generate their next orders.
          const entryFillOB = buildSyntheticOrderBook(symbol, exchange, bar.close);
          const sigs = normalizeAnalyzeResult(
            await strategy.analyze({
              exchangeName: exchange,
              symbol,
              orders: [filledOrder],
              orderbook: entryFillOB,
            }),
          );
          await strategy.onTradeExecuted?.({
            id: entry.clientOrderId,
            side: toTradeSide(entry.side),
            price: fillPrice,
            quantity: entry.quantity,
            symbol,
            exchange,
            timestamp: bar.openTime,
          });

          // Track which new TP order IDs are added by this entry fill so we can
          // back-fill entryPositionSize after all of them have been registered.
          const newExitCids: string[] = [];

          // Register TP exit orders and re-entry orders the strategy returned.
          // Opposite-side signals become take-profit exits; same-side signals
          // are re-entry limit orders (e.g. SpreadGrid places a new lower BUY
          // after a BUY fill via rebuildOrdersAfterFill).
          for (const sig of sigs) {
            if (isHoldResult(sig) || isCancelOrderResult(sig) || isUpdateOrderResult(sig))
              continue;
            if (!isActionableResult(sig)) continue;
            if (!sig.quantity || !sig.price || !sig.clientOrderId) continue;
            if (sig.action === 'sell' && isLong) {
              // Long take-profit order
              activeExits.set(sig.clientOrderId, {
                clientOrderId: sig.clientOrderId,
                tpPrice: sig.price,
                slPrice: slMultiplierLong ? fillPrice.mul(slMultiplierLong) : null,
                entrySide: OrderSide.BUY,
                entryPrice: fillPrice,
                quantity: sig.quantity,
                entryTime: bar.openTime,
                entryCashBalance,
                entryPositionSize: new Decimal(0), // filled in below
                leverage: entryLeverage,
              });
              newExitCids.push(sig.clientOrderId);
            } else if (sig.action === 'buy' && !isLong) {
              // Short take-profit order (cover buy)
              activeExits.set(sig.clientOrderId, {
                clientOrderId: sig.clientOrderId,
                tpPrice: sig.price,
                slPrice: slMultiplierShort ? fillPrice.mul(slMultiplierShort) : null,
                entrySide: OrderSide.SELL,
                entryPrice: fillPrice,
                quantity: sig.quantity,
                entryTime: bar.openTime,
                entryCashBalance,
                entryPositionSize: new Decimal(0), // filled in below
                leverage: entryLeverage,
              });
              newExitCids.push(sig.clientOrderId);
            } else if (sig.action === 'buy' || sig.action === 'sell') {
              // Re-entry order returned by the strategy alongside (or instead of) a TP.
              // Examples: SpreadGrid places a new same-direction entry after each fill.
              // Use registerEntrySigs to also call onOrderCreated.
              await registerEntrySigs([sig], barIdx);
            }
          }

          // Back-fill entryPositionSize for all TP orders just registered.
          // At this point activeExits reflects the total open position after this entry.
          const entryPositionSize = [...activeExits.values()].reduce(
            (sum, ae) => sum.plus(ae.quantity),
            new Decimal(0),
          );
          for (const cid of newExitCids) {
            const ae = activeExits.get(cid);
            if (ae) ae.entryPositionSize = entryPositionSize;
          }
        } else {
          // TP or SL exit fill
          const { exit, fillPrice } = fill;
          const isLong = exit.entrySide === OrderSide.BUY;
          const exitSide = isLong ? OrderSide.SELL : OrderSide.BUY;
          const exitLeverage = exit.leverage;
          const comm = fillPrice.mul(exit.quantity).mul(commissionRate);

          if (exitLeverage === 1 && !isLong) {
            // Spot-style short exit: pay to cover (buy back borrowed)
            cash = cash.minus(fillPrice.mul(exit.quantity)).minus(comm);
          } else {
            // Futures-style exit: return locked margin + realised PnL
            const lockedMargin = exit.entryPrice.mul(exit.quantity).div(exitLeverage);
            const grossPnl = isLong
              ? fillPrice.minus(exit.entryPrice).mul(exit.quantity)
              : exit.entryPrice.minus(fillPrice).mul(exit.quantity);
            cash = cash.plus(lockedMargin).plus(grossPnl).minus(comm);
          }

          const pnl = isLong
            ? fillPrice.minus(exit.entryPrice).mul(exit.quantity).minus(comm)
            : exit.entryPrice.minus(fillPrice).mul(exit.quantity).minus(comm);

          const exitTime = bar.closeTime ?? bar.openTime;
          // Remaining open position size after this trade closes (activeExits already has
          // this exit deleted by Phase 1, so the map reflects the remaining positions).
          const remainingPositionSize = [...activeExits.values()].reduce(
            (sum, ae) => sum.plus(ae.quantity),
            new Decimal(0),
          );
          trades.push({
            symbol,
            side: exit.entrySide,
            entryPrice: exit.entryPrice,
            exitPrice: fillPrice,
            quantity: exit.quantity,
            entryTime: exit.entryTime,
            exitTime,
            pnl,
            commission: comm,
            duration: Math.round((exitTime.getTime() - exit.entryTime.getTime()) / 60000),
            entryCashBalance: exit.entryCashBalance,
            entryPositionSize: exit.entryPositionSize,
            cashBalance: cash,
            positionSize: remainingPositionSize,
          });

          // Notify strategy of exit fill (CANCELED status for SL, FILLED for TP)
          const exitStatus =
            fill.type === 'sl' ? OrderStatus.CANCELED : OrderStatus.FILLED;
          const exitOrder = buildOrder(
            exit.clientOrderId,
            symbol,
            exitSide,
            fillPrice,
            exit.quantity,
            exitStatus,
            exchange,
          );
          const exitFillOB = buildSyntheticOrderBook(symbol, exchange, bar.close);
          const sigs = normalizeAnalyzeResult(
            await strategy.analyze({
              exchangeName: exchange,
              symbol,
              orders: [exitOrder],
              orderbook: exitFillOB,
            }),
          );
          await strategy.onTradeExecuted?.({
            id: exit.clientOrderId,
            side: toTradeSide(exitSide),
            price: fillPrice,
            quantity: exit.quantity,
            symbol,
            exchange,
            timestamp: bar.openTime,
          });

          // The strategy may return the next entry order after a TP/SL
          await registerEntrySigs(
            sigs.filter((s) => !isCancelOrderResult(s)),
            barIdx,
          );
        }
      }

      // ── Phase 3: Kline analysis → new entry signals ──────────────────────────
      // Also supply a fresh synthetic orderbook so that any strategy checking
      // price freshness (e.g. SpreadGridStrategy) can generate signals here too.

      const klineOB = buildSyntheticOrderBook(symbol, exchange, bar.close);
      const klineSigs = normalizeAnalyzeResult(
        await strategy.analyze({
          exchangeName: exchange,
          symbol,
          klines: [bar],
          orderbook: klineOB,
        }),
      );

      // Handle cancellations first, then register new entries.
      for (const sig of klineSigs) {
        if (isCancelOrderResult(sig) && sig.clientOrderId) {
          pendingEntries.delete(sig.clientOrderId);
        }
      }
      await registerEntrySigs(klineSigs, barIdx);

      // ── Phase 4: MTM equity snapshot ─────────────────────────────────────────

      let mtm = new Decimal(cash);
      for (const exit of activeExits.values()) {
        const isLong = exit.entrySide === OrderSide.BUY;
        // MTM equity = locked margin + unrealised PnL
        const lockedMargin = exit.entryPrice.mul(exit.quantity).div(exit.leverage);
        const unrealisedPnl = isLong
          ? bar.close.minus(exit.entryPrice).mul(exit.quantity)
          : exit.entryPrice.minus(bar.close).mul(exit.quantity);
        mtm = mtm.plus(lockedMargin).plus(unrealisedPnl);
      }

      symbolEquity.push({ timestamp: bar.closeTime ?? bar.openTime, value: mtm });
    }

    // ── Close all remaining open positions at last bar's close price ───────────

    const lastClose = klines[klines.length - 1].close;
    const lastTime =
      klines[klines.length - 1].closeTime ?? klines[klines.length - 1].openTime;

    const remainingExits = [...activeExits.values()];
    for (let ri = 0; ri < remainingExits.length; ri++) {
      const exit = remainingExits[ri];
      const isLong = exit.entrySide === OrderSide.BUY;
      const exitLeverage = exit.leverage;
      const comm = lastClose.mul(exit.quantity).mul(commissionRate);

      if (exitLeverage === 1 && !isLong) {
        // Spot-style short: pay to cover
        cash = cash.minus(lastClose.mul(exit.quantity)).minus(comm);
      } else {
        // Futures-style: return locked margin + realised PnL
        const lockedMargin = exit.entryPrice.mul(exit.quantity).div(exitLeverage);
        const grossPnl = isLong
          ? lastClose.minus(exit.entryPrice).mul(exit.quantity)
          : exit.entryPrice.minus(lastClose).mul(exit.quantity);
        cash = cash.plus(lockedMargin).plus(grossPnl).minus(comm);
      }

      const pnl = isLong
        ? lastClose.minus(exit.entryPrice).mul(exit.quantity).minus(comm)
        : exit.entryPrice.minus(lastClose).mul(exit.quantity).minus(comm);

      // Remaining open size = sum of not-yet-closed exits in this loop
      const remainingPositionSize = remainingExits
        .slice(ri + 1)
        .reduce((sum, ae) => sum.plus(ae.quantity), new Decimal(0));

      trades.push({
        symbol,
        side: exit.entrySide,
        entryPrice: exit.entryPrice,
        exitPrice: lastClose,
        quantity: exit.quantity,
        entryTime: exit.entryTime,
        exitTime: lastTime,
        pnl,
        commission: comm,
        duration: Math.round((lastTime.getTime() - exit.entryTime.getTime()) / 60000),
        entryCashBalance: exit.entryCashBalance,
        entryPositionSize: exit.entryPositionSize,
        cashBalance: cash,
        positionSize: remainingPositionSize,
      });
    }

    return { trades, finalBalance: cash, symbolEquity };
  }

  // ── Slippage helper ────────────────────────────────────────────────────────

  private applySlippage(price: Decimal, side: OrderSide, slippage?: Decimal): Decimal {
    if (!slippage || slippage.isZero()) return price;
    return side === OrderSide.BUY
      ? price.mul(new Decimal(1).plus(slippage))
      : price.mul(new Decimal(1).minus(slippage));
  }

  // ── Metrics ────────────────────────────────────────────────────────────────

  public calculateMetrics(
    trades: BacktestTrade[],
    initialBalance: Decimal,
    equityCurve: Array<{ timestamp: Date; value: Decimal }>,
  ): BacktestResult {
    if (trades.length === 0) {
      return {
        totalReturn: new Decimal(0),
        annualizedReturn: new Decimal(0),
        sharpeRatio: new Decimal(0),
        maxDrawdown: new Decimal(0),
        winRate: new Decimal(0),
        profitFactor: new Decimal(0),
        totalTrades: 0,
        avgTradeDuration: 0,
        equity: equityCurve,
        trades: [],
      };
    }

    const finalEquity = equityCurve[equityCurve.length - 1]?.value ?? initialBalance;
    const totalReturn = finalEquity.minus(initialBalance).div(initialBalance);

    // Win rate
    const winners = trades.filter((t) => t.pnl.gt(0));
    const winRate = new Decimal(winners.length).div(trades.length);

    // Profit factor
    const grossProfit = winners.reduce((s, t) => s.plus(t.pnl), new Decimal(0));
    const grossLoss = trades
      .filter((t) => t.pnl.lte(0))
      .reduce((s, t) => s.plus(t.pnl.abs()), new Decimal(0));
    const profitFactor = grossLoss.isZero()
      ? grossProfit.isZero()
        ? new Decimal(0)
        : new Decimal(Infinity)
      : grossProfit.div(grossLoss);

    // Max drawdown
    let maxDrawdown = new Decimal(0);
    let peak = initialBalance;
    for (const pt of equityCurve) {
      if (pt.value.gt(peak)) peak = pt.value;
      const dd = peak.isZero() ? new Decimal(0) : peak.minus(pt.value).div(peak);
      if (dd.gt(maxDrawdown)) maxDrawdown = dd;
    }

    // Annualised return
    const startTime = equityCurve[0]?.timestamp.getTime() ?? Date.now();
    const endTime =
      equityCurve[equityCurve.length - 1]?.timestamp.getTime() ?? Date.now();
    const years = (endTime - startTime) / (1000 * 60 * 60 * 24 * 365.25);
    const annualizedReturn =
      years > 0 ? totalReturn.div(new Decimal(years)) : new Decimal(0);

    // Sharpe ratio (simplified, no risk-free rate)
    const returns: Decimal[] = [];
    for (let i = 1; i < equityCurve.length; i++) {
      const prev = equityCurve[i - 1].value;
      if (!prev.isZero()) {
        returns.push(equityCurve[i].value.minus(prev).div(prev));
      }
    }
    const avgReturn =
      returns.length > 0
        ? returns.reduce((s, r) => s.plus(r), new Decimal(0)).div(returns.length)
        : new Decimal(0);
    const variance =
      returns.length > 1
        ? returns
            .map((r) => r.minus(avgReturn).pow(2))
            .reduce((s, v) => s.plus(v), new Decimal(0))
            .div(returns.length - 1)
        : new Decimal(0);
    const stdDev = variance.sqrt();
    const sharpeRatio = stdDev.isZero() ? new Decimal(0) : avgReturn.div(stdDev);

    // Average trade duration (in minutes)
    const avgTradeDuration = trades.reduce((s, t) => s + t.duration, 0) / trades.length;

    return {
      totalReturn,
      annualizedReturn,
      sharpeRatio,
      maxDrawdown,
      winRate,
      profitFactor,
      totalTrades: trades.length,
      avgTradeDuration,
      equity: equityCurve,
      trades,
    };
  }

  /** @deprecated Use the overload that accepts a strategyFactory. */
  public generateReport(result: BacktestResult): string {
    return [
      '=== BACKTEST RESULTS ===',
      '',
      'Performance Metrics:',
      `- Total Return:       ${result.totalReturn.mul(100).toFixed(2)}%`,
      `- Annualised Return:  ${result.annualizedReturn.mul(100).toFixed(2)}%`,
      `- Sharpe Ratio:       ${result.sharpeRatio.toFixed(3)}`,
      `- Max Drawdown:       ${result.maxDrawdown.mul(100).toFixed(2)}%`,
      '',
      'Trading Statistics:',
      `- Total Trades:       ${result.totalTrades}`,
      `- Win Rate:           ${result.winRate.mul(100).toFixed(2)}%`,
      `- Profit Factor:      ${result.profitFactor.toFixed(3)}`,
      `- Avg Trade Duration: ${result.avgTradeDuration.toFixed(1)} min`,
    ].join('\n');
  }

  public async *simulateMarketData(
    symbol: string,
    startTime: Date,
    endTime: Date,
    timeframe: string,
  ): AsyncGenerator<Kline> {
    // Placeholder — callers should use a real IDataManager.
    const duration = endTime.getTime() - startTime.getTime();
    const intervalMs = 60_000;
    const bars = Math.floor(duration / intervalMs);
    for (let i = 0; i < bars; i++) {
      const ts = new Date(startTime.getTime() + i * intervalMs);
      const price = new Decimal(100);
      yield {
        symbol,
        interval: timeframe as unknown as KlineInterval,
        openTime: ts,
        closeTime: new Date(ts.getTime() + intervalMs),
        open: price,
        high: price.mul('1.001'),
        low: price.mul('0.999'),
        close: price,
        volume: new Decimal(1000),
        quoteVolume: price.mul(1000),
        trades: 10,
      };
    }
  }
}
