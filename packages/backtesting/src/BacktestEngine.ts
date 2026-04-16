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
  Position,
  SignalType,
  Trade,
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
  type: OrderType;
  signalType: SignalType;
}

/** A filled entry position chunk being tracked for matching and MTM. */
interface OpenPosition {
  clientOrderId: string;
  side: OrderSide;
  entryPrice: Decimal;
  quantity: Decimal;
  entryTime: Date;
  /** Leverage multiplier used (1 = no leverage). */
  leverage: number;
  /** Commission paid when the entry order filled */
  entryCommission: Decimal;
  /** MTM Equity immediately after this entry opened */
  entryEquity: Decimal;
  /** Total net position immediately after this entry opened */
  entryNetPosition: Decimal;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build a synthetic Order object to feed back to strategy.analyze()
// ─────────────────────────────────────────────────────────────────────────────

let _orderId = 1;
let _tradeId = 1;
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

function buildTrade(
  symbol: string,
  side: OrderSide,
  price: Decimal,
  quantity: Decimal,
  exchange: string,
  timestamp: Date,
  fee?: Decimal,
): Trade {
  return {
    id: String(_tradeId++),
    symbol,
    price,
    quantity,
    side: side === OrderSide.BUY ? 'buy' : 'sell',
    timestamp,
    exchange,
    fee,
  };
}

/**
 * Build a minimal synthetic OrderBook centred on `midPrice`.
 */
function buildSyntheticOrderBook(
  symbol: string,
  exchange: string,
  midPrice: Decimal,
  timestamp?: Date,
): OrderBook {
  const halfSpread = midPrice.mul(new Decimal('0.0001')); // 0.01%
  return {
    symbol,
    exchange,
    timestamp: timestamp ?? new Date(),
    bids: [[midPrice.minus(halfSpread), new Decimal(1000)]],
    asks: [[midPrice.plus(halfSpread), new Decimal(1000)]],
  };
}

function getIntervalMs(interval: string): number {
  const amount = parseInt(interval);
  const unit = interval.replace(String(amount), '');
  switch (unit) {
    case 'm':
      return amount * 60 * 1000;
    case 'h':
      return amount * 60 * 60 * 1000;
    case 'd':
      return amount * 24 * 60 * 60 * 1000;
    case 'w':
      return amount * 7 * 24 * 60 * 60 * 1000;
    default:
      return 60 * 1000;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BacktestEngine
// ─────────────────────────────────────────────────────────────────────────────

export class BacktestEngine implements IBacktestEngine {
  public async runBacktest(
    strategyFactory: (symbol: string) => IStrategy,
    config: BacktestConfig,
    dataManager: IDataManager,
  ): Promise<BacktestResult> {
    const allTrades: BacktestTrade[] = [];
    const equityCurve: Array<{ timestamp: Date; value: Decimal }> = [];
    let runningBalance = new Decimal(config.initialBalance);

    equityCurve.push({ timestamp: config.startDate, value: runningBalance });

    for (const symbol of config.symbols ?? []) {
      const strategy = strategyFactory(symbol);
      const exchange = Array.isArray(strategy.config.exchange)
        ? strategy.config.exchange[0]
        : strategy.config.exchange;

      const timeframe = config.timeframe ?? '1h';
      const klines = await dataManager.getKlines(
        symbol,
        timeframe,
        config.startDate,
        config.endDate,
      );
      if (klines.length === 0) continue;

      // Warmup fetch
      const initialDataKlines: Partial<Record<KlineInterval, Kline[]>> = {};
      const initConfig = strategy.getInitialDataConfig?.();
      if (initConfig?.klines) {
        for (const [interval, bars] of Object.entries(initConfig.klines)) {
          const durationMs = getIntervalMs(interval) * (bars as number);
          const warmupStart = new Date(config.startDate.getTime() - durationMs);
          const warmupKlines = await dataManager.getKlines(
            symbol,
            interval as string,
            warmupStart,
            config.startDate,
          );
          initialDataKlines[interval as KlineInterval] = warmupKlines;
        }
      }

      await strategy.processInitialData({
        symbol,
        exchange,
        timestamp: klines[0].openTime,
        orderBook: buildSyntheticOrderBook(
          symbol,
          exchange,
          klines[0].close,
          klines[0].openTime,
        ),
        klines: initialDataKlines,
      });

      const { trades, finalBalance, symbolEquity } = await this.simulateSymbol(
        strategy,
        config,
        klines,
        symbol,
        exchange,
        runningBalance,
      );

      allTrades.push(...trades);
      runningBalance = finalBalance;
      equityCurve.push(...symbolEquity);
    }

    equityCurve.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return this.calculateMetrics(
      allTrades,
      new Decimal(config.initialBalance),
      equityCurve,
    );
  }

  private async simulateSymbol(
    strategy: IStrategy,
    config: BacktestConfig,
    klines: Kline[],
    symbol: string,
    exchange: string,
    initialBalance: Decimal,
  ): Promise<{
    trades: BacktestTrade[];
    finalBalance: Decimal;
    symbolEquity: Array<{ timestamp: Date; value: Decimal }>;
  }> {
    if (klines.length === 0) {
      return {
        trades: [],
        finalBalance: new Decimal(initialBalance),
        symbolEquity: [],
      };
    }

    const slippage = config.slippage || new Decimal(0);
    const commissionRate = config.commission || new Decimal(0);
    const stopLossPct = config.stopLossPercent || 0;
    const entryTtlBars = config.entryTtlBars || 100;

    let cash = initialBalance;
    let netPosition = new Decimal(0);
    const pendingEntries = new Map<string, PendingEntry>();
    const trades: BacktestTrade[] = [];
    const symbolEquity: Array<{ timestamp: Date; value: Decimal }> = [];
    const openPositions: OpenPosition[] = [];
    const priceExits = new Map<
      string,
      { tp: Decimal; sl: Decimal | null; parentCid: string }
    >();

    const slMultiplierLong =
      stopLossPct > 0 ? new Decimal(1).minus(new Decimal(stopLossPct).div(100)) : null;
    const slMultiplierShort =
      stopLossPct > 0 ? new Decimal(1).plus(new Decimal(stopLossPct).div(100)) : null;

    const calculateMTM = (currentCash: Decimal, currentPrice: Decimal) => {
      let equity = new Decimal(currentCash);
      for (const pos of openPositions) {
        const isLong = pos.side === OrderSide.BUY;
        if (pos.leverage === 1) {
          // Spot equity: long holds the asset (add value), short owes the asset (subtract liability)
          if (isLong) {
            equity = equity.plus(currentPrice.mul(pos.quantity));
          } else {
            equity = equity.minus(currentPrice.mul(pos.quantity));
          }
        } else {
          // Leveraged equity: margin + unrealized P&L
          const margin = pos.entryPrice.mul(pos.quantity).div(pos.leverage);
          const upnl = isLong
            ? currentPrice.minus(pos.entryPrice).mul(pos.quantity)
            : pos.entryPrice.minus(currentPrice).mul(pos.quantity);
          equity = equity.plus(margin).plus(upnl);
        }
      }
      return equity;
    };

    const notifyPositionUpdate = async (
      price: Decimal,
      leverageValue: number,
      timestamp: Date,
    ) => {
      const onPositionUpdate = (
        strategy as { onPositionUpdate?: (position: Position) => Promise<void> }
      ).onPositionUpdate;
      if (!onPositionUpdate || netPosition.isZero()) return;
      await onPositionUpdate.call(strategy, {
        symbol,
        exchange,
        side: netPosition.gt(0) ? 'long' : 'short',
        quantity: netPosition.abs(),
        avgPrice: price,
        markPrice: price,
        unrealizedPnl: new Decimal(0),
        leverage: new Decimal(leverageValue),
        timestamp,
      });
    };

    const registerEntrySigs = async (sigs: any[], barIndex: number) => {
      const parameters = strategy.config?.parameters as
        | Record<string, unknown>
        | undefined;
      const maxPositionSize =
        typeof parameters?.maxPositionSize === 'number'
          ? new Decimal(parameters.maxPositionSize)
          : null;
      const minPositionSize =
        typeof parameters?.minPositionSize === 'number'
          ? new Decimal(parameters.minPositionSize)
          : null;

      for (const sig of sigs) {
        if (
          !isActionableResult(sig) ||
          isCancelOrderResult(sig) ||
          isUpdateOrderResult(sig)
        )
          continue;
        if (!sig.quantity || !sig.clientOrderId) continue;
        if (sig.type !== OrderType.MARKET && !sig.price) continue;
        const side = sig.action === 'buy' ? OrderSide.BUY : OrderSide.SELL;
        const signalLeverage = sig.leverage ?? 1;
        const signalType =
          (sig.metadata?.signalType as SignalType | undefined) ?? SignalType.Entry;
        const sigQuantity = new Decimal(sig.quantity);
        if ((maxPositionSize || minPositionSize) && signalType === SignalType.Entry) {
          const pendingLong = Array.from(pendingEntries.values())
            .filter(
              (entry) =>
                entry.signalType === SignalType.Entry && entry.side === OrderSide.BUY,
            )
            .reduce((acc, entry) => acc.plus(entry.quantity), new Decimal(0));
          const pendingShort = Array.from(pendingEntries.values())
            .filter(
              (entry) =>
                entry.signalType === SignalType.Entry && entry.side === OrderSide.SELL,
            )
            .reduce((acc, entry) => acc.plus(entry.quantity), new Decimal(0));
          const netCommitted = netPosition.plus(pendingLong).minus(pendingShort);
          if (side === OrderSide.BUY && maxPositionSize) {
            if (netCommitted.plus(sigQuantity).gt(maxPositionSize)) {
              continue;
            }
          }
          if (side === OrderSide.SELL && minPositionSize) {
            if (netCommitted.minus(sigQuantity).lt(minPositionSize)) {
              continue;
            }
          }
        }
        pendingEntries.set(sig.clientOrderId, {
          clientOrderId: sig.clientOrderId,
          side,
          price: sig.price,
          quantity: sigQuantity,
          barIndex,
          leverage: signalLeverage,
          type: sig.type || OrderType.LIMIT,
          signalType,
        } as PendingEntry);
        if (strategy.onOrderCreated) {
          await strategy.onOrderCreated(
            buildOrder(
              sig.clientOrderId,
              symbol,
              side,
              sig.price ?? new Decimal(0),
              sig.quantity,
              OrderStatus.NEW,
              exchange,
            ),
          );
        }
      }
    };

    const processCancelSignals = async (
      sigs: any[],
      barPriceRef: Decimal,
      timestamp: Date,
    ) => {
      for (const sig of sigs) {
        if (!isCancelOrderResult(sig)) continue;
        const targetCid = sig.clientOrderId;
        if (targetCid && pendingEntries.has(targetCid)) {
          const entry = pendingEntries.get(targetCid)!;
          pendingEntries.delete(targetCid);
          await strategy.analyze({
            exchangeName: exchange,
            symbol,
            orders: [
              buildOrder(
                entry.clientOrderId,
                symbol,
                entry.side,
                entry.price,
                entry.quantity,
                OrderStatus.CANCELED,
                exchange,
              ),
            ],
            orderbook: buildSyntheticOrderBook(symbol, exchange, barPriceRef, timestamp),
          });
        } else if (targetCid && priceExits.has(targetCid)) {
          priceExits.delete(targetCid);
        }
      }
    };

    // Initial signals
    if (klines.length > 0) {
      const initSigs = normalizeAnalyzeResult(
        await strategy.processInitialData({
          symbol,
          exchange,
          timestamp: klines[0].openTime,
          orderBook: buildSyntheticOrderBook(
            symbol,
            exchange,
            klines[0].close,
            klines[0].closeTime,
          ),
        }),
      );
      await registerEntrySigs(initSigs, 0);
    }

    for (let barIdx = 0; barIdx < klines.length; barIdx++) {
      const bar = klines[barIdx];
      const bullish = bar.close.gte(bar.open);
      const fills: any[] = [];

      // TTL handling
      const ttlExpired: PendingEntry[] = [];
      for (const [cid, entry] of pendingEntries) {
        if (barIdx - entry.barIndex >= entryTtlBars) {
          pendingEntries.delete(cid);
          ttlExpired.push(entry);
        }
      }
      for (const expired of ttlExpired) {
        const ttlSigs = normalizeAnalyzeResult(
          await strategy.analyze({
            exchangeName: exchange,
            symbol,
            orders: [
              buildOrder(
                expired.clientOrderId,
                symbol,
                expired.side,
                expired.price,
                expired.quantity,
                OrderStatus.CANCELED,
                exchange,
              ),
            ],
            orderbook: buildSyntheticOrderBook(
              symbol,
              exchange,
              bar.close,
              bar.closeTime,
            ),
          }),
        );
        await registerEntrySigs(ttlSigs, barIdx);
      }

      // Pending entry fills
      for (const [cid, entry] of pendingEntries) {
        let hit = false;
        let fillPrice: Decimal | undefined;

        if (entry.type === OrderType.MARKET) {
          hit = true;
          fillPrice = bar.open; // Fill MARKET orders immediately at next available price (bar open)
        } else if (entry.price) {
          hit =
            entry.side === OrderSide.BUY
              ? bar.low.lte(entry.price)
              : bar.high.gte(entry.price);
          if (hit) fillPrice = entry.price;
        }

        if (hit && fillPrice) {
          fills.push({
            type: 'entry',
            entry,
            fillPrice: this.applySlippage(fillPrice, entry.side, slippage),
          });
          pendingEntries.delete(cid);
        }
      }

      // TP/SL fills
      for (const [cid, trigger] of priceExits) {
        const matches = openPositions.filter(
          (p) => p.clientOrderId === trigger.parentCid,
        );
        if (matches.length === 0) {
          priceExits.delete(cid);
          continue;
        }
        const pos = matches[0];
        const isLong = pos.side === OrderSide.BUY;
        const tpHit = isLong ? bar.high.gte(trigger.tp) : bar.low.lte(trigger.tp);
        const slHit =
          trigger.sl !== null &&
          (isLong ? bar.low.lte(trigger.sl) : bar.high.gte(trigger.sl));

        if (tpHit || slHit) {
          const tpWins = tpHit && slHit ? (isLong ? bullish : !bullish) : tpHit;
          const fillPriceOrigin = tpWins ? trigger.tp : trigger.sl!;
          const fillSide = isLong ? OrderSide.SELL : OrderSide.BUY;
          const totalQty = matches.reduce((s, p) => s.plus(p.quantity), new Decimal(0));
          fills.push({
            type: tpWins ? 'tp' : 'sl',
            exit: {
              clientOrderId: cid,
              entrySide: pos.side,
              quantity: totalQty,
              leverage: pos.leverage,
            },
            fillPrice: this.applySlippage(fillPriceOrigin, fillSide, slippage),
          });
          priceExits.delete(cid);
        }
      }

      // Process Fills
      for (const fill of fills) {
        const fillPrice = fill.fillPrice;
        let fillQty = fill.type === 'entry' ? fill.entry.quantity : fill.exit.quantity;
        const fillSide =
          fill.type === 'entry'
            ? fill.entry.side
            : fill.exit.entrySide === OrderSide.BUY
              ? OrderSide.SELL
              : OrderSide.BUY;
        const leverage = fill.type === 'entry' ? fill.entry.leverage : fill.exit.leverage;
        const entryCid =
          fill.type === 'entry'
            ? fill.entry.clientOrderId
            : fill.exit.parentCid || fill.exit.clientOrderId; // This part varies

        while (fillQty.gt(0)) {
          let matchIdx = -1;
          for (let i = openPositions.length - 1; i >= 0; i--) {
            if (openPositions[i].side !== fillSide) {
              matchIdx = i;
              break;
            }
          }

          if (matchIdx !== -1) {
            const match = openPositions[matchIdx];
            const tradeQty = Decimal.min(fillQty, match.quantity);
            const entryComm = match.entryCommission.mul(tradeQty.div(match.quantity));
            const exitComm = fillPrice.mul(tradeQty).mul(commissionRate);

            let margin = new Decimal(0);
            if (match.leverage === 1) {
              // Spot: Sell returns cash, Buy costs cash
              if (match.side === OrderSide.BUY) {
                // We are closing a long (selling)
                cash = cash.plus(fillPrice.mul(tradeQty)).minus(exitComm);
              } else {
                // We are closing a short (buying back)
                cash = cash.minus(fillPrice.mul(tradeQty)).minus(exitComm);
              }
            } else {
              margin = match.entryPrice.mul(tradeQty).div(match.leverage);
              const grossPnl =
                match.side === OrderSide.BUY
                  ? fillPrice.minus(match.entryPrice).mul(tradeQty)
                  : match.entryPrice.minus(fillPrice).mul(tradeQty);
              cash = cash.plus(margin).plus(grossPnl).minus(exitComm);
            }
            netPosition =
              fillSide === OrderSide.BUY
                ? netPosition.plus(tradeQty)
                : netPosition.minus(tradeQty);
            if (strategy.onTradeExecuted) {
              await strategy.onTradeExecuted(
                buildTrade(
                  symbol,
                  fillSide,
                  fillPrice,
                  tradeQty,
                  exchange,
                  bar.closeTime ?? bar.openTime,
                  exitComm,
                ),
              );
            }
            await notifyPositionUpdate(
              fillPrice,
              match.leverage,
              bar.closeTime ?? bar.openTime,
            );

            // Update position BEFORE computing MTM so cashBalance reflects post-close state
            // (avoids double-counting the closed portion in calculateMTM)
            match.quantity = match.quantity.minus(tradeQty);
            match.entryCommission = match.entryCommission.minus(entryComm);
            if (match.quantity.isZero()) openPositions.splice(matchIdx, 1);
            fillQty = fillQty.minus(tradeQty);

            trades.push({
              symbol,
              side: match.side,
              entryPrice: match.entryPrice,
              exitPrice: fillPrice,
              quantity: tradeQty,
              entryTime: match.entryTime,
              exitTime: bar.closeTime ?? bar.openTime,
              pnl: (match.side === OrderSide.BUY
                ? fillPrice.minus(match.entryPrice).mul(tradeQty)
                : match.entryPrice.minus(fillPrice).mul(tradeQty)
              )
                .minus(entryComm)
                .minus(exitComm),
              commission: entryComm.plus(exitComm),
              duration: Math.round(
                ((bar.closeTime ?? bar.openTime).getTime() - match.entryTime.getTime()) /
                  60000,
              ),
              entryCashBalance: match.entryEquity,
              entryPositionSize: match.entryNetPosition,
              cashBalance: calculateMTM(cash, fillPrice),
              positionSize: netPosition,
            });

            // Notify strategy when a fill closes (or partially closes) a position.
            // This is needed for multi-cycle strategies (e.g. SpreadGrid) that place
            // new cycle orders in response to a TP/SL or entry fill.
            if (fillQty.isZero()) {
              const closeNotifyOrder = buildOrder(
                entryCid,
                symbol,
                fillSide,
                fillPrice,
                fill.type === 'entry' ? fill.entry.quantity : fill.exit.quantity,
                OrderStatus.FILLED,
                exchange,
              );
              if (strategy.onOrderFilled) {
                await strategy.onOrderFilled(closeNotifyOrder);
              }
              const closeSigs = normalizeAnalyzeResult(
                await strategy.analyze({
                  exchangeName: exchange,
                  symbol,
                  orders: [closeNotifyOrder],
                  orderbook: buildSyntheticOrderBook(
                    symbol,
                    exchange,
                    bar.close,
                    bar.closeTime,
                  ),
                }),
              );
              for (const closeSig of closeSigs) {
                if (isCancelOrderResult(closeSig)) {
                  await processCancelSignals([closeSig], bar.close, bar.closeTime);
                  const cid =
                    (closeSig as any).clientOrderId || (closeSig as any).orderId;
                  if (cid) {
                    const idx = fills.findIndex(
                      (f: any) =>
                        (f.type === 'entry' && f.entry.clientOrderId === cid) ||
                        (f.type !== 'entry' && f.exit.clientOrderId === cid),
                    );
                    if (idx !== -1) fills.splice(idx, 1);
                  }
                } else if (isActionableResult(closeSig)) {
                  await registerEntrySigs([closeSig], barIdx);
                }
              }
            }
          } else {
            const comm = fillPrice.mul(fillQty).mul(commissionRate);
            if (leverage === 1) {
              // Spot: Buy consumes cash, Sell adds cash
              if (fillSide === OrderSide.BUY) {
                cash = cash.minus(fillPrice.mul(fillQty)).minus(comm);
              } else {
                cash = cash.plus(fillPrice.mul(fillQty)).minus(comm);
              }
            } else {
              const margin = fillPrice.mul(fillQty).div(leverage);
              cash = cash.minus(margin).minus(comm);
            }
            netPosition =
              fillSide === OrderSide.BUY
                ? netPosition.plus(fillQty)
                : netPosition.minus(fillQty);
            if (strategy.onTradeExecuted) {
              await strategy.onTradeExecuted(
                buildTrade(
                  symbol,
                  fillSide,
                  fillPrice,
                  fillQty,
                  exchange,
                  bar.closeTime ?? bar.openTime,
                  comm,
                ),
              );
            }
            await notifyPositionUpdate(
              fillPrice,
              leverage,
              bar.closeTime ?? bar.openTime,
            );
            const newPos: OpenPosition = {
              clientOrderId:
                fill.type === 'entry'
                  ? fill.entry.clientOrderId
                  : fill.exit.clientOrderId,
              side: fillSide,
              entryPrice: fillPrice,
              quantity: fillQty,
              entryTime: bar.openTime,
              leverage,
              entryCommission: comm,
              // Placeholder: set after push so calculateMTM includes this position
              entryEquity: new Decimal(0),
              entryNetPosition: netPosition,
            };
            openPositions.push(newPos);
            // Compute entry equity AFTER pushing so the new position's margin/value is included
            newPos.entryEquity = calculateMTM(cash, fillPrice);

            // 2. Notification: strategy might place a TP/SL or replace orders after a fill
            const filledOrder = buildOrder(
              entryCid,
              symbol,
              fillSide,
              fillPrice,
              fill.type === 'entry' ? fill.entry.quantity : fill.exit.quantity,
              OrderStatus.FILLED,
              exchange,
            );
            if (strategy.onOrderFilled) {
              await strategy.onOrderFilled(filledOrder);
            }
            const sigs = normalizeAnalyzeResult(
              await strategy.analyze({
                exchangeName: exchange,
                symbol,
                orders: [filledOrder],
                orderbook: buildSyntheticOrderBook(
                  symbol,
                  exchange,
                  bar.close,
                  bar.closeTime,
                ),
              }),
            );
            for (const sig of sigs) {
              if (isCancelOrderResult(sig)) {
                // Must check cancel BEFORE isActionableResult because isActionableResult
                // returns true for cancel signals too (action !== 'hold'), so cancel
                // signals would otherwise be routed to registerEntrySigs and silently dropped.
                await processCancelSignals([sig], bar.close, bar.closeTime);
                const cancelSig = sig as any;
                const targetCid = cancelSig.clientOrderId || cancelSig.orderId;
                if (targetCid) {
                  const fIdx = fills.findIndex(
                    (f: any) =>
                      (f.type === 'entry' && f.entry.clientOrderId === targetCid) ||
                      (f.type !== 'entry' && f.exit.clientOrderId === targetCid),
                  );
                  if (fIdx !== -1) fills.splice(fIdx, 1);
                }
              } else if (
                isActionableResult(sig) &&
                ((sig.action === 'sell' && fillSide === OrderSide.BUY) ||
                  (sig.action === 'buy' && fillSide === OrderSide.SELL))
              ) {
                // Strategy is placing a Take Profit / Stop Loss order linked to this fill
                priceExits.set(sig.clientOrderId, {
                  tp: sig.price!,
                  sl:
                    slMultiplierLong && fillSide === OrderSide.BUY
                      ? fillPrice.mul(slMultiplierLong)
                      : slMultiplierShort && fillSide === OrderSide.SELL
                        ? fillPrice.mul(slMultiplierShort)
                        : null,
                  parentCid: entryCid,
                });
              } else if (isActionableResult(sig)) {
                await registerEntrySigs([sig], barIdx);
              }
            }
            fillQty = new Decimal(0);
          }
        }
      }

      // Kline Signals
      const klineSigs = normalizeAnalyzeResult(
        await strategy.analyze({
          exchangeName: exchange,
          symbol,
          klines: [bar],
          orderbook: buildSyntheticOrderBook(symbol, exchange, bar.close, bar.closeTime),
        }),
      );
      await processCancelSignals(klineSigs, bar.close, bar.closeTime);
      await registerEntrySigs(klineSigs, barIdx);

      symbolEquity.push({
        timestamp: bar.closeTime ?? bar.openTime,
        value: calculateMTM(cash, bar.close),
      });
    }

    // Force close
    if (klines.length > 0) {
      const lastBar = klines[klines.length - 1];
      const lastClose = lastBar.close;
      const lastTime = lastBar.closeTime ?? lastBar.openTime;

      // Collect force-closed trades with a placeholder cashBalance, then backfill
      // all of them with the same final settled cash after every position closes.
      // This ensures every force-closed trade's equity column equals the final
      // equity shown by totalReturn (no double-counting of still-open MTM).
      const forceClosedTrades: BacktestTrade[] = [];
      for (let i = openPositions.length - 1; i >= 0; i--) {
        const pos = openPositions[i];
        const comm = lastClose.mul(pos.quantity).mul(commissionRate);
        if (pos.leverage === 1) {
          // Spot: closing long adds cash, closing short costs cash
          if (pos.side === OrderSide.BUY) {
            cash = cash.plus(lastClose.mul(pos.quantity)).minus(comm);
          } else {
            cash = cash.minus(lastClose.mul(pos.quantity)).minus(comm);
          }
        } else {
          const margin = pos.entryPrice.mul(pos.quantity).div(pos.leverage);
          const pnl =
            pos.side === OrderSide.BUY
              ? lastClose.minus(pos.entryPrice).mul(pos.quantity)
              : pos.entryPrice.minus(lastClose).mul(pos.quantity);
          cash = cash.plus(margin).plus(pnl).minus(comm);
        }
        netPosition =
          pos.side === OrderSide.BUY
            ? netPosition.minus(pos.quantity)
            : netPosition.plus(pos.quantity);
        openPositions.splice(i, 1);
        forceClosedTrades.push({
          symbol,
          side: pos.side,
          entryPrice: pos.entryPrice,
          exitPrice: lastClose,
          quantity: pos.quantity,
          entryTime: pos.entryTime,
          exitTime: lastTime,
          pnl: (pos.side === OrderSide.BUY
            ? lastClose.minus(pos.entryPrice).mul(pos.quantity)
            : pos.entryPrice.minus(lastClose).mul(pos.quantity)
          )
            .minus(pos.entryCommission)
            .minus(comm),
          commission: pos.entryCommission.plus(comm),
          duration: Math.round((lastTime.getTime() - pos.entryTime.getTime()) / 60000),
          entryCashBalance: pos.entryEquity,
          entryPositionSize: pos.entryNetPosition,
          cashBalance: new Decimal(0), // backfilled below
          positionSize: netPosition,
        });
      }
      // All positions closed; backfill every force-closed trade with the same
      // final settled cash so their equity column matches totalReturn exactly.
      const finalCash = cash;
      forceClosedTrades.forEach((t) => {
        t.cashBalance = finalCash;
      });
      trades.push(...forceClosedTrades);

      symbolEquity.push({ timestamp: lastTime, value: cash });
    }
    return { trades, finalBalance: cash, symbolEquity };
  }

  private applySlippage(price: Decimal, side: OrderSide, slippage?: Decimal): Decimal {
    if (!slippage || slippage.isZero()) return price;
    return side === OrderSide.BUY
      ? price.mul(new Decimal(1).plus(slippage))
      : price.mul(new Decimal(1).minus(slippage));
  }

  public calculateMetrics(
    trades: BacktestTrade[],
    initialBalance: Decimal,
    equityCurve: Array<{ timestamp: Date; value: Decimal }>,
  ): BacktestResult {
    if (trades.length === 0)
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
    const finalEquity = equityCurve[equityCurve.length - 1]?.value ?? initialBalance;
    const totalReturn = finalEquity.minus(initialBalance).div(initialBalance);
    const winners = trades.filter((t) => t.pnl.gt(0));
    const winRate = new Decimal(winners.length).div(trades.length);
    const grossProfit = winners.reduce((s, t) => s.plus(t.pnl), new Decimal(0));
    const grossLoss = trades
      .filter((t) => t.pnl.lte(0))
      .reduce((s, t) => s.plus(t.pnl.abs()), new Decimal(0));
    const profitFactor = grossLoss.isZero()
      ? grossProfit.isZero()
        ? new Decimal(0)
        : new Decimal(Infinity)
      : grossProfit.div(grossLoss);
    let maxDrawdown = new Decimal(0);
    let peak = initialBalance;
    for (const pt of equityCurve) {
      if (pt.value.gt(peak)) peak = pt.value;
      const dd = peak.isZero() ? new Decimal(0) : peak.minus(pt.value).div(peak);
      if (dd.gt(maxDrawdown)) maxDrawdown = dd;
    }
    const startTime = equityCurve[0]?.timestamp.getTime() ?? Date.now();
    const endTime =
      equityCurve[equityCurve.length - 1]?.timestamp.getTime() ?? Date.now();
    const years = (endTime - startTime) / (1000 * 60 * 60 * 24 * 365.25);
    const annualizedReturn =
      years > 0 ? totalReturn.div(new Decimal(years)) : new Decimal(0);
    const returns: Decimal[] = [];
    for (let i = 1; i < equityCurve.length; i++) {
      const prev = equityCurve[i - 1].value;
      if (!prev.isZero()) returns.push(equityCurve[i].value.minus(prev).div(prev));
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
    const sharpeRatio = variance.isZero()
      ? new Decimal(0)
      : avgReturn.div(variance.sqrt());
    return {
      totalReturn,
      annualizedReturn,
      sharpeRatio,
      maxDrawdown,
      winRate,
      profitFactor,
      totalTrades: trades.length,
      avgTradeDuration: trades.reduce((s, t) => s + t.duration, 0) / trades.length,
      equity: equityCurve,
      trades,
    };
  }

  public generateReport(result: BacktestResult): string {
    return [
      '=== BACKTEST RESULTS ===',
      `- Total Return:       ${result.totalReturn.mul(100).toFixed(2)}%`,
      `- Annualised Return:  ${result.annualizedReturn.mul(100).toFixed(2)}%`,
      `- Sharpe Ratio:       ${result.sharpeRatio.toFixed(3)}`,
      `- Max Drawdown:       ${result.maxDrawdown.mul(100).toFixed(2)}%`,
      `- Total Trades:       ${result.totalTrades}`,
      `- Win Rate:           ${result.winRate.mul(100).toFixed(2)}%`,
      `- Profit Factor:      ${result.profitFactor.toFixed(3)}`,
    ].join('\n');
  }

  public async *simulateMarketData(
    symbol: string,
    startTime: Date,
    endTime: Date,
    timeframe: string,
  ): AsyncGenerator<Kline> {
    const duration = endTime.getTime() - startTime.getTime();
    const intervalMs = 60_000;
    const bars = Math.floor(duration / intervalMs);
    for (let i = 0; i < bars; i++) {
      const ts = new Date(startTime.getTime() + i * intervalMs);
      const price = new Decimal(100);
      yield {
        symbol,
        interval: timeframe as any,
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
