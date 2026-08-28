import Decimal from 'decimal.js';
import { StrategyParameters, SignalMetaData, OrderSide } from '@itrade/core';

/**
 * 📗 LadderEntrySingleTPStrategy parameters
 *
 * Ladder entry with single take-profit strategy:
 * - Entry: Uses bid0 (or fixed basePrice) as reference. Entry 0 is placed at entryBase = referencePrice adjusted by entryGapType/entryGapValue (arithmetic: ref - entryGapValue, geometric: ref * (1 - entryGapValue/100)). Then subsequent BUY limit orders are placed one at a time in sequential ladder steps from entryBase. Step gaps can be constant or progressive: arithmetic stepType uses gap[i] = stepValue + stepValueAdd * i (stepValueAdd=0 for constant), geometric stepType uses pct[i] = stepValue * stepValueRatio^i (stepValueRatio=1 for constant). So price[i] = entryBase - sum(gap[j]) for arithmetic, or entryBase * prod((1-pct[j]/100)) for geometric, where j=0..i-1.
 * - Take profit: The strategy always has at most ONE TP SELL limit order
 *         TP condition can be a fixed profit amount (in quote currency) or a percentage
 *         TP order is updated immediately whenever a new entry fills (including partial fills)
 * - Risk control: Max investment (quote) and max position (base) — only counts orders from this strategy.
 *         maxEntryPrice caps the highest price an entry may be placed at (0 = no cap): when entry 0 would
 *         land above it the ladder is anchored at maxEntryPrice instead of bid0, so an upward wick cannot
 *         make the strategy accumulate its position at the top of the spike.
 * - Cycle: On TP fully filled → cancel all remaining entries → rebuild ladder with latest bid0 → start new cycle
 *
 * Edge/Corner case handling:
 * - Stop/restart/service restart: processInitialData recovers all strategy orders via REST fetchOpenOrders,
 *   recalculateVWAP rebuilds inventory/VWAP, re-places TP and unfilled entry ladder steps
 * - Delayed/out-of-order order pushes: processedQuantityMap + processedTerminalIds for dedup,
 *   updateTime comparison skips stale updates, recalculateVWAP recomputes from all orders (idempotent)
 * - Entry partial fill: Recalculate VWAP → debounce TP refresh (2s window, full FILLED bypasses debounce)
 * - TP partial fill: No action taken (TP order state managed by exchange, strategy does not intervene)
 * - Entry cancelled unfilled: Allows re-placement
 * - Entry cancelled with partial fill: Preserve partial-fill inventory, refresh TP, advance to next step
 * - TP fully filled: Cancel all pending entries → cancel all pending TP → reset → rebuild ladder
 */
export interface LadderEntrySingleTPParameters extends StrategyParameters {
  /**
   * Reference price. 0 = use orderbook bid0 as reference (fetched via REST on strategy start / each cycle restart).
   * >0 = use fixed price, no orderbook needed.
   */
  basePrice: number;

  /**
   * Gap type between reference price (bid0 or basePrice) and entry 0.
   * 'arithmetic' = absolute price drop (entryBase = referencePrice - entryGapValue)
   * 'geometric' = percentage drop (entryBase = referencePrice * (1 - entryGapValue/100))
   * Defaults to stepType when not specified (backward compatible with old configs).
   */
  entryGapType?: 'arithmetic' | 'geometric';

  /**
   * Gap value between reference price and entry 0.
   * For arithmetic: absolute price drop (e.g. 300 = entry 0 is 300 USDT below referencePrice).
   * For geometric: percentage drop (e.g. 0.62 = entry 0 is 0.62% below referencePrice).
   * 0 = entry 0 at the reference price itself (no gap).
   * When undefined (old configs), defaults to stepValue (backward compatible: gap = inter-level gap).
   */
  entryGapValue?: number;

  /** Number of ladder steps (levels) */
  ladderSteps: number;

  /** Step type: 'arithmetic' or 'geometric' */
  stepType: 'arithmetic' | 'geometric';

  /** Step value for ladder (gap between entry levels, NOT the gap from reference to entry 0). For arithmetic: absolute price drop per step (e.g. 300 = 300 USDT below entryBase per step). For geometric: percentage ratio per step (e.g. 0.62 = 0.62% ratio per step) */
  stepValue: number;

  /**
   * Arithmetic step value increment per step (for progressive ladder spacing).
   * Only used when stepType='arithmetic': gap[i] = stepValue + stepValueAdd * i
   * (e.g. stepValue=100, stepValueAdd=50 → gaps are 100, 150, 200, 250...).
   * Default 0 = constant gap (backward compatible).
   * For stepType='geometric', use stepValueRatio instead.
   */
  stepValueAdd?: number;

  /**
   * Geometric step value ratio per step (for progressive ladder spacing).
   * Only used when stepType='geometric': pct[i] = stepValue * stepValueRatio^i
   * (e.g. stepValue=1, stepValueRatio=1.5 → drops are 1%, 1.5%, 2.25%, 3.375%...).
   * Default 1 = constant percentage (backward compatible).
   * For stepType='arithmetic', use stepValueAdd instead.
   */
  stepValueRatio?: number;

  /** Quantity type: 'arithmetic' or 'geometric' */
  qtyType: 'arithmetic' | 'geometric';

  /** Base quantity per step (in base currency, e.g. 0.01 BTC) */
  qtyPerStep: number;

  /** Arithmetic qty addition per step: qty[i] = qtyPerStep + qtyStepAdd * i */
  qtyStepAdd: number;

  /** Geometric qty ratio per step: qty[i] = qtyPerStep * qtyStepRatio^i */
  qtyStepRatio: number;

  /** Take profit condition type: 'absolute' (fixed quote profit) or 'percent' (percentage of VWAP) */
  tpType: 'absolute' | 'percent';

  /** For tpType='absolute': target profit in quote currency (e.g. 100 USDT) */
  tpAbsoluteProfit: number;

  /** For tpType='percent': target profit percentage (e.g. 1 = 1%) */
  tpPercent: number;

  /** Maximum total investment in quote currency (margin budget). Buying power = maxInvestment * leverage */
  maxInvestment: number;

  /** Maximum position size in base currency (including open BUY orders from this strategy) */
  maxPosition: number;

  /**
   * Highest price an entry order may ever be placed at (quote currency).
   * 0 = no cap.
   *
   * Protects against upward wicks: the ladder is anchored on bid0, so a spike
   * would otherwise drag the whole ladder up and accumulate a large position at
   * the top. When entry 0 would land above this price, the ladder is anchored at
   * maxEntryPrice instead (all steps shift down with it), and no entry order is
   * ever placed above it.
   *
   * Optional: absent in configs created before this parameter existed, which is
   * treated the same as 0 (no cap).
   */
  maxEntryPrice?: number;

  /** Leverage for futures trading */
  leverage?: number;

  /**
   * Reset interval in minutes.
   * When the strategy has only entry 0 (status=NEW, unfilled) and the specified
   * time has elapsed since entry 0 was placed, the strategy cancels entry 0,
   * re-fetches the orderbook, rebuilds the ladder with the fresh bid0, and
   * places a new entry 0.
   * 0 = never reset (keep entry 0 until it fills or market triggers other actions).
   */
  resetInterval: number;
}

export interface LadderStep {
  index: number;
  price: Decimal;
  quantity: Decimal;
  /** clientOrderId of the open entry BUY order for this step (null = none/filled/cancelled) */
  entryClientOrderId: string | null;
  /** Whether this step's entry has been fully FILLED */
  filled: boolean;
}

/**
 * Parse the maxEntryPrice parameter out of a persisted strategy config.
 *
 * `parameters` is free-form JSON in the database, so this has to cope with more
 * than a clean number:
 *  - key absent → every strategy created before this parameter existed. Must
 *    mean "no cap" so their behaviour is unchanged.
 *  - null / '' → what an API client or a cleared form field can persist. Same
 *    as absent: no cap.
 *  - numeric string → the parameter form stores enum-typed fields as strings
 *    (e.g. resetInterval is persisted as "15"), so accept "100" as well.
 *  - anything else ('abc', NaN, negative) → the user asked for a cap and we
 *    cannot honour it. Throw rather than silently trade with no protection.
 */

export interface LadderSignalMetaData extends SignalMetaData {
  side?: OrderSide;
  stepIndex?: number;
  quantity?: string;
  price?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Strategy
// ──────────────────────────────────────────────────────────────────────────
