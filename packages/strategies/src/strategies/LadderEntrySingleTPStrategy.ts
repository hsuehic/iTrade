import {
  BaseStrategy,
  StrategyResult,
  StrategyOrderResult,
  StrategyUpdateOrderResult,
  StrategyAnalyzeResult,
  StrategyConfig,
  Order,
  OrderStatus,
  DataUpdate,
  StrategyParameters,
  TradeMode,
  SignalType,
  SignalMetaData,
  InitialDataResult,
  OrderSide,
} from '@itrade/core';
import Decimal from 'decimal.js';
import { StrategyRegistryConfig } from '../type';
import { silentLogger } from '../utils/silent-logger';

/**
 * 📗 LadderEntrySingleTPStrategy parameters
 *
 * Ladder entry with single take-profit strategy:
 * - Entry: Uses bid0 (or fixed basePrice) as reference, places BUY limit orders one at a time in sequential ladder steps (arithmetic absolute price difference or geometric percentage ratio).
 * - Take profit: The strategy always has at most ONE TP SELL limit order
 *         TP condition can be a fixed profit amount (in quote currency) or a percentage
 *         TP order is updated immediately whenever a new entry fills (including partial fills)
 * - Risk control: Max investment (quote) and max position (base) — only counts orders from this strategy
 * - Cycle: On TP fully filled → cancel all remaining entries → rebuild ladder with latest bid0 → start new cycle
 *
 * Edge/Corner case handling:
 * - Stop/restart/service restart: processInitialData recovers all strategy orders via REST fetchOpenOrders,
 *   recalculateVWAP rebuilds inventory/VWAP, re-places TP and unfilled entry ladder steps
 * - Delayed/out-of-order order pushes: processedQuantityMap + processedTerminalIds for dedup,
 *   updateTime comparison skips stale updates, recalculateVWAP recomputes from all orders (idempotent)
 * - Entry partial fill: Recalculate VWAP → update TP (price+qty)
 * - TP partial fill: No action taken (TP order state managed by exchange, strategy does not intervene)
 * - Entry cancelled unfilled: Allows re-placement
 * - TP fully filled: Cancel all pending entries → reset → rebuild ladder
 */
export interface LadderEntrySingleTPParameters extends StrategyParameters {
  /**
   * Reference price. 0 = use orderbook bid0 as reference (fetched via REST on strategy start / each cycle restart).
   * >0 = use fixed price, no orderbook needed.
   */
  basePrice: number;

  /** Number of ladder steps (levels) */
  ladderSteps: number;

  /** Step type: 'arithmetic' or 'geometric' */
  stepType: 'arithmetic' | 'geometric';

  /** Step value for ladder. For arithmetic: absolute price drop per step (e.g. 300 = 300 USDT below previous). For geometric: percentage drop per step (e.g. 1 = 1% below previous) */
  stepValue: number;

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

  /** Leverage for futures trading */
  leverage?: number;
}

export const LadderEntrySingleTPStrategyRegistryConfig: StrategyRegistryConfig<LadderEntrySingleTPParameters> =
  {
    type: 'LadderEntrySingleTPStrategy',
    name: 'Ladder Entry Single TP',
    description:
      'Ladder entry with single take-profit strategy. Supports arithmetic/geometric ladder prices and quantities, ' +
      'TP condition supports fixed profit amount or percentage. TP order is updated immediately on each entry fill. ' +
      'Cancels remaining entries and starts a new cycle when TP is fully filled.',
    icon: '📗',
    implemented: true,
    category: 'volatility',
    defaultParameters: {
      basePrice: 0,
      ladderSteps: 5,
      stepType: 'arithmetic',
      stepValue: 1,
      qtyType: 'arithmetic',
      qtyPerStep: 0.1,
      qtyStepAdd: 0,
      qtyStepRatio: 1,
      tpType: 'percent',
      tpAbsoluteProfit: 100,
      tpPercent: 1,
      maxInvestment: 1000,
      maxPosition: 10,
      leverage: 10,
    },
    parameterDefinitions: [
      {
        name: 'basePrice',
        type: 'number',
        description:
          'Reference price. 0 = fetch orderbook bid0 via REST API on strategy start. >0 = fixed price, no orderbook fetch.',
        defaultValue: 0,
        required: true,
        min: 0,
        max: 1000000,
        group: 'Reference',
        order: 1,
      },
      {
        name: 'ladderSteps',
        type: 'number',
        description: 'Number of ladder steps (levels). E.g. 5 = 5 entries below base.',
        defaultValue: 5,
        required: true,
        min: 1,
        max: 100,
        group: 'Ladder Entry',
        order: 2,
      },
      {
        name: 'stepType',
        type: 'enum',
        description:
          'Ladder price step type: "arithmetic" (absolute price difference: price_i = base - stepValue * i) ' +
          'or "geometric" (percentage ratio: price_i = base * (1 - stepValue/100)^i).',
        defaultValue: 'arithmetic',
        required: true,
        validation: { options: ['arithmetic', 'geometric'] },
        group: 'Ladder Entry',
        order: 3,
      },
      {
        name: 'stepValue',
        type: 'number',
        description:
          'Step value for ladder price. Arithmetic: absolute price drop per step (e.g. 300 = each step 300 USDT below previous). ' +
          'Geometric: percentage drop per step (e.g. 1 = each step 1% below previous).',
        defaultValue: 1,
        required: true,
        min: 0.000001,
        max: 1000000,
        group: 'Ladder Entry',
        order: 4,
      },
      {
        name: 'qtyType',
        type: 'enum',
        description:
          'Quantity progression: "arithmetic" (qty[i]=base+add*i) or "geometric" (qty[i]=base*ratio^i).',
        defaultValue: 'arithmetic',
        required: true,
        validation: { options: ['arithmetic', 'geometric'] },
        group: 'Ladder Quantity',
        order: 5,
      },
      {
        name: 'qtyPerStep',
        type: 'number',
        description: 'Base quantity per ladder step in base currency (e.g. 0.1 BTC).',
        defaultValue: 0.1,
        required: true,
        min: 0.000001,
        max: 100000,
        step: 0.000001,
        group: 'Ladder Quantity',
        order: 6,
      },
      {
        name: 'qtyStepAdd',
        type: 'number',
        description:
          'Arithmetic qty addition per step: qty[i] = qtyPerStep + qtyStepAdd * i.',
        defaultValue: 0,
        required: false,
        min: 0,
        max: 100000,
        step: 0.000001,
        group: 'Ladder Quantity',
        order: 7,
        showIf: { field: 'qtyType', equals: 'arithmetic' },
      },
      {
        name: 'qtyStepRatio',
        type: 'number',
        description:
          'Geometric qty ratio per step: qty[i] = qtyPerStep * qtyStepRatio^i.',
        defaultValue: 1,
        required: false,
        min: 0.001,
        max: 100,
        step: 0.001,
        group: 'Ladder Quantity',
        order: 8,
        showIf: { field: 'qtyType', equals: 'geometric' },
      },
      {
        name: 'tpType',
        type: 'enum',
        description:
          'Take profit condition: "absolute" (fixed quote profit, e.g. 100 USDT) or "percent" (percentage of VWAP).',
        defaultValue: 'percent',
        required: true,
        validation: { options: ['absolute', 'percent'] },
        group: 'Take Profit',
        order: 9,
      },
      {
        name: 'tpAbsoluteProfit',
        type: 'number',
        description:
          'For tpType=absolute: target profit in quote currency (e.g. 100 = 100 USDT).',
        defaultValue: 100,
        required: false,
        min: 0,
        max: 10000000,
        group: 'Take Profit',
        order: 10,
        showIf: { field: 'tpType', equals: 'absolute' },
      },
      {
        name: 'tpPercent',
        type: 'number',
        description:
          'For tpType=percent: target profit percentage above VWAP (e.g. 1 = 1%).',
        defaultValue: 1,
        required: false,
        min: 0.001,
        max: 100,
        group: 'Take Profit',
        order: 11,
        unit: '%',
        showIf: { field: 'tpType', equals: 'percent' },
      },
      {
        name: 'maxInvestment',
        type: 'number',
        description:
          'Maximum total investment in quote currency (margin budget). Buying power = maxInvestment * leverage. ' +
          'Only counts orders from this strategy.',
        defaultValue: 1000,
        required: true,
        min: 0.01,
        max: 100000000,
        group: 'Risk Management',
        order: 12,
      },
      {
        name: 'maxPosition',
        type: 'number',
        description:
          'Maximum position size in base currency (including open BUY orders from this strategy).',
        defaultValue: 10,
        required: true,
        min: 0.000001,
        max: 100000000,
        group: 'Risk Management',
        order: 13,
      },
      {
        name: 'leverage',
        type: 'number',
        description: 'Leverage for futures trading.',
        defaultValue: 10,
        required: false,
        min: 1,
        max: 125,
        group: 'Risk Management',
        order: 14,
      },
    ],
    subscriptionRequirements: {},
    initialDataRequirements: {
      fetchPositions: { required: true, editable: false, description: 'Fetch positions' },
      fetchOpenOrders: {
        required: true,
        editable: false,
        description: 'Fetch open orders for recovery',
      },
      fetchBalance: { required: true, editable: false, description: 'Fetch balance' },
      fetchOrderBook: {
        required: false,
        editable: true,
        defaultDepth: 5,
        depthEditable: true,
        description: 'Fetch orderbook snapshot via REST (needed when basePrice=0)',
      },
    },
    documentation: {
      overview:
        'Ladder entry with single take-profit strategy. Uses bid0 (or fixed basePrice) as reference, places BUY limit orders in arithmetic/geometric ladder steps. ' +
        'TP SELL limit order is updated immediately on each entry fill (including partial fills). ' +
        'On TP fully filled, cancels all remaining entries and rebuilds the ladder with latest bid0 to start a new cycle. ' +
        'Does not subscribe to orderbook WebSocket; fetches bid0 via REST only on initialization and cycle restart.',
      parameters:
        'basePrice(0=bid0 via REST) + ladderSteps + stepType/stepValue define ladder prices (arithmetic=absolute price diff, geometric=percentage ratio); ' +
        'qtyType + qtyPerStep + qtyStepAdd/qtyStepRatio define ladder quantities; ' +
        'tpType + tpAbsoluteProfit/tpPercent define take-profit condition; ' +
        'maxInvestment * leverage = total buying power; maxPosition = max position size.',
      signals:
        'On start: Fetch orderbook bid0 via REST → build ladder → place first BUY limit entry order (sequential: next entry placed only after current one fills).\n' +
        'Entry fill (incl. partial): Recalculate VWAP → update TP (cancel old TP → place new TP, qty=current inventory, price=VWAP±profit target).\n' +
        'TP partial fill: No action taken (TP state managed by exchange).\n' +
        'TP fully filled: Cancel all remaining entries → rebuild ladder with latest bid0 → start new cycle.\n' +
        'Stop/restart: processInitialData recovers all strategy orders via REST fetchOpenOrders → recalculate VWAP/inventory → restore TP + re-place unfilled entries.',
      riskFactors: [
        'Ladder buying in a downtrend accumulates position and may hit maxPosition limit',
        'TP limit order may not fill (if price keeps falling)',
        'Entry limit orders may not fill (missed market movement)',
        'Deep ladder steps may remain untriggered for extended periods',
        'On restart recovery, if orderbook unavailable (basePrice=0), must wait for REST bid0 fetch',
      ],
    },
  };

// ──────────────────────────────────────────────────────────────────────────
// Internal types
// ──────────────────────────────────────────────────────────────────────────

interface LadderStep {
  index: number;
  price: Decimal;
  quantity: Decimal;
  /** clientOrderId of the open entry BUY order for this step (null = none/filled/cancelled) */
  entryClientOrderId: string | null;
  /** Whether this step's entry has been fully FILLED */
  filled: boolean;
}

interface LadderSignalMetaData extends SignalMetaData {
  side?: OrderSide;
  stepIndex?: number;
  quantity?: string;
  price?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Strategy
// ──────────────────────────────────────────────────────────────────────────

export class LadderEntrySingleTPStrategy extends BaseStrategy<LadderEntrySingleTPParameters> {
  private basePrice: Decimal;
  private ladderSteps: number;
  private stepType: 'arithmetic' | 'geometric';
  private stepValue: Decimal;
  private qtyType: 'arithmetic' | 'geometric';
  private qtyPerStep: Decimal;
  private qtyStepAdd: Decimal;
  private qtyStepRatio: Decimal;
  private tpType: 'absolute' | 'percent';
  private tpAbsoluteProfit: Decimal;
  private tpPercent: Decimal;
  private maxInvestment: Decimal;
  private maxPosition: Decimal;
  private leverage: number;
  private tradeMode: TradeMode = TradeMode.ISOLATED;

  /** Ladder configuration (precomputed prices + quantities) */
  private steps: LadderStep[] = [];

  /** Current filled inventory (base quantity bought, not yet sold by TP) */
  private inventoryQty: Decimal = new Decimal(0);

  /** VWAP (volume-weighted average price) of current inventory */
  private vwap: Decimal = new Decimal(0);

  /** clientOrderId of the current open TP SELL order (null = none) */
  private tpClientOrderId: string | null = null;

  /** Reference price (basePrice or last bid0 from REST) */
  private referencePrice: Decimal;

  // Order tracking — only this strategy's own orders
  private orders: Map<string, Order> = new Map();
  private orderMetadataMap: Map<string, LadderSignalMetaData> = new Map();
  private pendingClientOrderIds: Set<string> = new Set();
  private processedQuantityMap: Map<string, Decimal> = new Map();
  private processedTerminalIds: Set<string> = new Set();

  constructor(config: StrategyConfig<LadderEntrySingleTPParameters>) {
    super({ ...config, logger: silentLogger });
    const { parameters } = config;

    this.basePrice = new Decimal(parameters.basePrice ?? 0);
    this.ladderSteps = parameters.ladderSteps ?? 5;
    this.stepType = parameters.stepType ?? 'arithmetic';
    this.stepValue = new Decimal(parameters.stepValue ?? 1);
    this.qtyType = parameters.qtyType ?? 'arithmetic';
    this.qtyPerStep = new Decimal(parameters.qtyPerStep ?? 0.1);
    this.qtyStepAdd = new Decimal(parameters.qtyStepAdd ?? 0);
    this.qtyStepRatio = new Decimal(parameters.qtyStepRatio ?? 1);
    this.tpType = parameters.tpType ?? 'percent';
    this.tpAbsoluteProfit = new Decimal(parameters.tpAbsoluteProfit ?? 0);
    this.tpPercent = new Decimal(parameters.tpPercent ?? 1);
    this.maxInvestment = new Decimal(parameters.maxInvestment);
    this.maxPosition = new Decimal(parameters.maxPosition);
    this.leverage = parameters.leverage ?? 10;

    // Validate
    if (this.maxInvestment.lte(0)) {
      throw new Error(`Invalid maxInvestment: ${parameters.maxInvestment} (must be > 0)`);
    }
    if (this.maxPosition.lte(0)) {
      throw new Error(`Invalid maxPosition: ${parameters.maxPosition} (must be > 0)`);
    }
    if (this.ladderSteps < 1) {
      throw new Error(`Invalid ladderSteps: ${parameters.ladderSteps} (must be >= 1)`);
    }
    if (this.stepValue.lte(0)) {
      throw new Error(`Invalid stepValue: ${parameters.stepValue} (must be > 0)`);
    }
    if (this.qtyPerStep.lte(0)) {
      throw new Error(`Invalid qtyPerStep: ${parameters.qtyPerStep} (must be > 0)`);
    }
    if (this.qtyType === 'geometric' && this.qtyStepRatio.lte(0)) {
      throw new Error(
        `Invalid qtyStepRatio: ${parameters.qtyStepRatio} (must be > 0 for geometric)`,
      );
    }

    // If basePrice > 0, use it as fixed reference; otherwise wait for REST orderbook fetch
    this.referencePrice = this.basePrice.gt(0) ? this.basePrice : new Decimal(0);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Ladder configuration
  // ──────────────────────────────────────────────────────────────────────────

  private buildLadder(): LadderStep[] {
    if (this.referencePrice.lte(0)) return [];

    const steps: LadderStep[] = [];
    const stepPercent = this.stepValue.div(100);

    for (let i = 0; i < this.ladderSteps; i++) {
      let price: Decimal;
      if (this.stepType === 'arithmetic') {
        // Absolute price difference: price_i = referencePrice - stepValue * i
        price = this.referencePrice.minus(this.stepValue.mul(i));
      } else {
        // Geometric percentage ratio: price_i = referencePrice * (1 - stepValue/100)^i
        price = this.referencePrice.mul(new Decimal(1).minus(stepPercent).pow(i));
      }
      if (price.lte(0)) {
        this._logger.warn(`[buildLadder] Step ${i} price <= 0, skipping`);
        continue;
      }

      let qty: Decimal;
      if (this.qtyType === 'arithmetic') {
        qty = this.qtyPerStep.plus(this.qtyStepAdd.mul(i));
      } else {
        qty = this.qtyPerStep.mul(this.qtyStepRatio.pow(i));
      }
      if (qty.lte(0)) {
        this._logger.warn(`[buildLadder] Step ${i} qty <= 0, skipping`);
        continue;
      }

      steps.push({
        index: i,
        price,
        quantity: qty,
        entryClientOrderId: null,
        filled: false,
      });
    }
    return steps;
  }

  private resetLadder(): void {
    this.steps = [];
    this.inventoryQty = new Decimal(0);
    this.vwap = new Decimal(0);
    this.tpClientOrderId = null;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // VWAP / TP calculation
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Recalculate VWAP from all filled entry orders tracked by this strategy.
   * Idempotent — safe to call on every order update, including out-of-order pushes.
   * Only counts THIS strategy's entry (BUY) orders — not external positions.
   */
  private recalculateVWAP(): void {
    let totalCost = new Decimal(0);
    let totalQty = new Decimal(0);

    for (const order of this.orders.values()) {
      const metadata = order.clientOrderId
        ? this.orderMetadataMap.get(order.clientOrderId)
        : undefined;
      if (!metadata || metadata.signalType !== SignalType.Entry) continue;
      if (order.side !== OrderSide.BUY) continue;

      const filledQty = order.executedQuantity || new Decimal(0);
      if (filledQty.lte(0)) continue;

      const fillPrice = order.averagePrice || order.price || new Decimal(0);
      if (fillPrice.lte(0)) continue;

      totalCost = totalCost.plus(fillPrice.mul(filledQty));
      totalQty = totalQty.plus(filledQty);
    }

    for (const [clientOrderId, processedQty] of this.processedQuantityMap) {
      if (this.orders.has(clientOrderId)) continue;
      const metadata = this.orderMetadataMap.get(clientOrderId);
      if (!metadata || metadata.signalType !== SignalType.Entry) continue;
      if (metadata.side !== OrderSide.BUY) continue;
      if (processedQty.lte(0)) continue;
      const entryPriceStr = metadata.entryPrice;
      if (!entryPriceStr) continue;
      const fillPrice = new Decimal(entryPriceStr);
      if (fillPrice.lte(0)) continue;
      totalCost = totalCost.plus(fillPrice.mul(processedQty));
      totalQty = totalQty.plus(processedQty);
    }

    if (totalQty.gt(0)) {
      this.vwap = totalCost.div(totalQty);
      this.inventoryQty = totalQty;
    } else {
      this.vwap = new Decimal(0);
      this.inventoryQty = new Decimal(0);
    }
  }

  private reduceInventoryByTpFill(filledQty: Decimal): void {
    this.inventoryQty = Decimal.max(new Decimal(0), this.inventoryQty.minus(filledQty));
    if (this.inventoryQty.lte(0)) {
      this.vwap = new Decimal(0);
    }
  }

  /**
   * Compute the TP sell price based on tpType and current VWAP.
   * - 'absolute': TP price = VWAP + tpAbsoluteProfit / inventoryQty
   * - 'percent':  TP price = VWAP * (1 + tpPercent/100)
   */
  private computeTpPrice(): Decimal | null {
    if (this.inventoryQty.lte(0) || this.vwap.lte(0)) return null;

    if (this.tpType === 'absolute') {
      if (this.tpAbsoluteProfit.lte(0)) return null;
      return this.vwap.plus(this.tpAbsoluteProfit.div(this.inventoryQty));
    }
    if (this.tpPercent.lte(0)) return null;
    return this.vwap.mul(new Decimal(1).plus(this.tpPercent.div(100)));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Risk checks — only count THIS strategy's orders
  // ──────────────────────────────────────────────────────────────────────────

  private getBuyingPower(): Decimal {
    return this.maxInvestment.mul(this.leverage);
  }

  private getCommittedNotional(): Decimal {
    let total = new Decimal(0);
    if (this.inventoryQty.gt(0) && this.vwap.gt(0)) {
      total = total.plus(this.inventoryQty.mul(this.vwap));
    }
    for (const order of this.orders.values()) {
      if (order.side !== OrderSide.BUY) continue;
      if (
        order.status !== OrderStatus.NEW &&
        order.status !== OrderStatus.PARTIALLY_FILLED
      )
        continue;
      const remaining = order.quantity.sub(order.executedQuantity || new Decimal(0));
      if (remaining.gt(0) && order.price) {
        total = total.plus(remaining.mul(order.price));
      }
    }
    for (const clientId of this.pendingClientOrderIds) {
      if (this.orders.has(clientId)) continue;
      const metadata = this.orderMetadataMap.get(clientId);
      if (!metadata || metadata.signalType !== SignalType.Entry) continue;
      if (metadata.side !== OrderSide.BUY) continue;
      if (metadata.quantity && metadata.price) {
        total = total.plus(
          new Decimal(metadata.quantity).mul(new Decimal(metadata.price)),
        );
      }
    }
    return total;
  }

  private getRemainingInvestmentCapacity(): Decimal {
    return this.getBuyingPower().sub(this.getCommittedNotional());
  }

  private getPendingBuyQty(): Decimal {
    let total = new Decimal(0);
    for (const order of this.orders.values()) {
      if (order.side !== OrderSide.BUY) continue;
      if (
        order.status !== OrderStatus.NEW &&
        order.status !== OrderStatus.PARTIALLY_FILLED
      )
        continue;
      const remaining = order.quantity.sub(order.executedQuantity || new Decimal(0));
      if (remaining.gt(0)) total = total.add(remaining);
    }
    for (const clientId of this.pendingClientOrderIds) {
      if (this.orders.has(clientId)) continue;
      const metadata = this.orderMetadataMap.get(clientId);
      if (!metadata || metadata.signalType !== SignalType.Entry) continue;
      if (metadata.side !== OrderSide.BUY) continue;
      if (metadata.quantity) total = total.add(new Decimal(metadata.quantity));
    }
    return total;
  }

  private getRemainingPositionCapacity(): Decimal {
    return this.maxPosition.sub(this.inventoryQty).sub(this.getPendingBuyQty());
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Signal generation
  // ──────────────────────────────────────────────────────────────────────────

  private generateEntrySignal(step: LadderStep): StrategyOrderResult {
    const clientOrderId = this.generateClientOrderId(SignalType.Entry);
    const metadata: LadderSignalMetaData = {
      signalType: SignalType.Entry,
      timestamp: Date.now(),
      clientOrderId,
      side: OrderSide.BUY,
      stepIndex: step.index,
      quantity: step.quantity.toString(),
      price: step.price.toString(),
      entryPrice: step.price.toString(),
    };
    this.orderMetadataMap.set(clientOrderId, metadata);
    this.pendingClientOrderIds.add(clientOrderId);
    return {
      action: 'buy',
      price: step.price,
      quantity: step.quantity,
      symbol: this._symbol,
      clientOrderId,
      leverage: this.leverage,
      tradeMode: this.tradeMode,
      reason: `ladder_entry_step_${step.index}`,
      metadata,
    };
  }

  private generateTpSignal(tpPrice: Decimal, qty: Decimal): StrategyOrderResult {
    const clientOrderId = this.generateClientOrderId(SignalType.TakeProfit);
    const metadata: LadderSignalMetaData = {
      signalType: SignalType.TakeProfit,
      timestamp: Date.now(),
      clientOrderId,
      side: OrderSide.SELL,
      entryPrice: this.vwap.toString(),
      takeProfitPrice: tpPrice.toString(),
      quantity: qty.toString(),
    };
    this.orderMetadataMap.set(clientOrderId, metadata);
    this.pendingClientOrderIds.add(clientOrderId);
    this.tpClientOrderId = clientOrderId;
    return {
      action: 'sell',
      price: tpPrice,
      quantity: qty,
      symbol: this._symbol,
      clientOrderId,
      leverage: this.leverage,
      tradeMode: this.tradeMode,
      reason:
        this.tpType === 'absolute'
          ? `ladder_tp_absolute_${this.tpAbsoluteProfit.toString()}`
          : `ladder_tp_percent_${this.tpPercent.toString()}`,
      metadata,
    };
  }

  private generateTpUpdateSignal(
    oldClientOrderId: string,
    tpPrice: Decimal,
    qty: Decimal,
  ): StrategyUpdateOrderResult {
    const newClientOrderId = this.generateClientOrderId(SignalType.TakeProfit);
    const metadata: LadderSignalMetaData = {
      signalType: SignalType.TakeProfit,
      timestamp: Date.now(),
      clientOrderId: newClientOrderId,
      side: OrderSide.SELL,
      entryPrice: this.vwap.toString(),
      takeProfitPrice: tpPrice.toString(),
      quantity: qty.toString(),
    };
    this.orderMetadataMap.set(newClientOrderId, metadata);
    this.pendingClientOrderIds.add(newClientOrderId);
    return {
      action: 'update',
      clientOrderId: oldClientOrderId,
      newClientOrderId,
      symbol: this._symbol,
      quantity: qty,
      price: tpPrice,
      reason: 'ladder_tp_update',
      metadata,
    };
  }

  private generateCancelSignal(clientOrderId: string, reason: string): StrategyResult {
    return { action: 'cancel', clientOrderId, symbol: this._symbol, reason };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Ladder entry placement
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Place the next pending entry order in the ladder.
   *
   * Sequential mode: only one entry order is active at a time. The next step
   * is placed only after the current step's order is fully filled.
   *
   * Rules:
   *   1. Find the first unfilled step that has no active order.
   *   2. If the immediately preceding step exists and is not yet fully filled,
   *      do NOT place this step — wait for it to fill first.
   *   3. Only one entry order is live at any time.
   */
  private placeLadderEntries(): StrategyResult[] {
    const signals: StrategyResult[] = [];

    if (this.steps.length === 0) {
      this.steps = this.buildLadder();
      if (this.steps.length === 0) return signals;
    }

    for (const step of this.steps) {
      if (step.filled) continue;

      // If this step already has an active order, do nothing — wait for it
      // to fill. Only one entry order is live at a time.
      if (step.entryClientOrderId) {
        const order = this.orders.get(step.entryClientOrderId);
        if (
          order &&
          (order.status === OrderStatus.NEW ||
            order.status === OrderStatus.PARTIALLY_FILLED)
        ) {
          // Current step's order is still active; do not place next step.
          return signals;
        }
        // Order no longer active (cancelled / filled / expired) — clear it.
        // If it was filled, step.filled would already be true (set in
        // handleEntryFill), so reaching here means it was cancelled/expired.
        step.entryClientOrderId = null;
      }

      // Ensure all previous steps are fully filled before placing this one.
      const prevStep = this.steps[step.index - 1];
      if (prevStep && !prevStep.filled) {
        // Previous step hasn't filled yet; wait.
        this._logger.debug(
          `[placeLadderEntries] Step ${step.index}: waiting for step ${prevStep.index} to fill`,
        );
        return signals;
      }

      // Check risk limits
      if (this.getRemainingPositionCapacity().lt(step.quantity)) {
        this._logger.debug(
          `[placeLadderEntries] Step ${step.index}: insufficient position capacity, skipping`,
        );
        return signals;
      }

      const orderNotional = step.price.mul(step.quantity);
      if (this.getRemainingInvestmentCapacity().lt(orderNotional)) {
        this._logger.debug(
          `[placeLadderEntries] Step ${step.index}: insufficient investment capacity, skipping`,
        );
        return signals;
      }

      // Place this step's entry order and stop — only one at a time.
      const signal = this.generateEntrySignal(step);
      step.entryClientOrderId = signal.clientOrderId;
      signals.push(signal);
      this._logger.debug(
        `[placeLadderEntries] Placed step ${step.index}: ${step.quantity.toString()} @ ${step.price.toString()}`,
      );
      return signals;
    }

    return signals;
  }

  /**
   * Refresh the TP order: cancel old TP (if any) and place a new one
   * matching current VWAP + inventoryQty.
   * Called on every entry fill (full or partial).
   */
  private refreshTakeProfit(): StrategyResult[] {
    const signals: StrategyResult[] = [];

    if (this.inventoryQty.lte(0) || this.vwap.lte(0)) {
      return this.cancelAllTpOrders('ladder_tp_cancel_no_inventory');
    }

    const tpPrice = this.computeTpPrice();
    if (!tpPrice || tpPrice.lte(0)) return signals;
    const tpQty = this.inventoryQty;

    if (this.tpClientOrderId) {
      const existingTp = this.orders.get(this.tpClientOrderId);
      if (
        existingTp &&
        (existingTp.status === OrderStatus.NEW ||
          existingTp.status === OrderStatus.PARTIALLY_FILLED)
      ) {
        const currentPrice = existingTp.price || new Decimal(0);
        const currentQty = existingTp.quantity || new Decimal(0);
        if (currentPrice.eq(tpPrice) && currentQty.eq(tpQty)) return signals;
        signals.push(this.generateTpUpdateSignal(this.tpClientOrderId, tpPrice, tpQty));
        this.tpClientOrderId = null;
        return signals;
      }
      this.orders.delete(this.tpClientOrderId);
      this.tpClientOrderId = null;
    }

    // Cancel stale pending TP signals
    for (const clientId of Array.from(this.pendingClientOrderIds)) {
      const meta = this.orderMetadataMap.get(clientId);
      if (meta?.signalType === SignalType.TakeProfit) {
        signals.push(this.generateCancelSignal(clientId, 'ladder_tp_cancel_stale'));
        this.pendingClientOrderIds.delete(clientId);
        this.orderMetadataMap.delete(clientId);
      }
    }

    signals.push(this.generateTpSignal(tpPrice, tpQty));
    return signals;
  }

  private cancelAllTpOrders(reason: string): StrategyResult[] {
    const signals: StrategyResult[] = [];
    if (this.tpClientOrderId) {
      const tpOrder = this.orders.get(this.tpClientOrderId);
      if (
        tpOrder &&
        (tpOrder.status === OrderStatus.NEW ||
          tpOrder.status === OrderStatus.PARTIALLY_FILLED)
      ) {
        signals.push(this.generateCancelSignal(this.tpClientOrderId, reason));
      }
      this.tpClientOrderId = null;
    }
    for (const clientId of Array.from(this.pendingClientOrderIds)) {
      const meta = this.orderMetadataMap.get(clientId);
      if (meta?.signalType === SignalType.TakeProfit) {
        signals.push(this.generateCancelSignal(clientId, reason));
        this.pendingClientOrderIds.delete(clientId);
        this.orderMetadataMap.delete(clientId);
      }
    }
    return signals;
  }

  private cancelAllEntryOrders(reason: string): StrategyResult[] {
    const signals: StrategyResult[] = [];
    for (const [clientOrderId, order] of this.orders) {
      if (order.side !== OrderSide.BUY) continue;
      if (
        order.status === OrderStatus.NEW ||
        order.status === OrderStatus.PARTIALLY_FILLED
      ) {
        signals.push(this.generateCancelSignal(clientOrderId, reason));
      }
    }
    for (const clientId of Array.from(this.pendingClientOrderIds)) {
      const meta = this.orderMetadataMap.get(clientId);
      if (meta?.signalType === SignalType.Entry) {
        signals.push(this.generateCancelSignal(clientId, reason));
        this.pendingClientOrderIds.delete(clientId);
        this.orderMetadataMap.delete(clientId);
      }
    }
    return signals;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Order fill handling
  // ──────────────────────────────────────────────────────────────────────────

  private handleEntryFilled(
    order: Order,
    metadata: LadderSignalMetaData,
  ): StrategyResult[] {
    const signals: StrategyResult[] = [];

    if (metadata.stepIndex !== undefined && this.steps[metadata.stepIndex]) {
      this.steps[metadata.stepIndex].filled = true;
    }
    this.pendingClientOrderIds.delete(order.clientOrderId!);

    this.recalculateVWAP();
    this._logger.debug(
      `[handleEntryFilled] Entry FILLED: ${order.executedQuantity?.toString()} @ ${order.averagePrice?.toString()}. ` +
        `Inventory: ${this.inventoryQty.toString()}, VWAP: ${this.vwap.toString()}`,
    );

    signals.push(...this.refreshTakeProfit());
    signals.push(...this.placeLadderEntries());
    return signals;
  }

  private handleEntryPartialFill(
    order: Order,
    metadata: LadderSignalMetaData,
  ): StrategyResult[] {
    const signals: StrategyResult[] = [];
    this.processedQuantityMap.set(
      order.clientOrderId!,
      order.executedQuantity || new Decimal(0),
    );
    if (metadata.signalType === SignalType.Entry) {
      metadata.entryPrice = (order.averagePrice || order.price)?.toString();
    }
    this.recalculateVWAP();
    this._logger.debug(
      `[handleEntryPartialFill] Entry PARTIAL: ${order.executedQuantity?.toString()}/${order.quantity?.toString()}. ` +
        `Inventory: ${this.inventoryQty.toString()}, VWAP: ${this.vwap.toString()}`,
    );
    signals.push(...this.refreshTakeProfit());
    return signals;
  }

  /**
   * Handle TP order FILL (full):
   * 1. Clear inventory + VWAP
   * 2. Cancel ALL remaining entry orders
   * 3. Reset ladder state
   * 4. Update referencePrice from REST orderbook (or keep basePrice)
   * 5. Rebuild ladder → place new entries → start new cycle
   */
  private handleTpFilled(order: Order): StrategyResult[] {
    const signals: StrategyResult[] = [];

    this.pendingClientOrderIds.delete(order.clientOrderId!);
    this.tpClientOrderId = null;

    // Cancel ALL remaining entry orders
    signals.push(...this.cancelAllEntryOrders('ladder_entry_cancel_on_tp_filled'));

    // Reset state
    this.resetLadder();
    this.processedQuantityMap.clear();
    this.processedTerminalIds.clear();

    // Update reference price — if basePrice=0, need new REST fetch for next cycle
    // The new orderbook will arrive via the next processInitialData or a REST fetch
    // For now, keep existing referencePrice (basePrice>0 case) or use last known
    this._logger.debug(
      `[handleTpFilled] TP FILLED: ${order.executedQuantity?.toString()} @ ${order.averagePrice?.toString()}. ` +
        `Cycle reset. Reference price: ${this.referencePrice.toString()}`,
    );

    // Rebuild ladder and place entries for new cycle
    if (this.referencePrice.gt(0)) {
      signals.push(...this.placeLadderEntries());
    }
    return signals;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Order update dispatcher (handles out-of-order / delayed pushes)
  // ──────────────────────────────────────────────────────────────────────────

  private handleOrderUpdates(orders: Order[]): StrategyResult[] {
    const signals: StrategyResult[] = [];
    let shouldRefreshLadder = false;

    for (const order of orders) {
      if (!order.clientOrderId) continue;

      let metadata = this.orderMetadataMap.get(order.clientOrderId);
      if (!metadata) {
        metadata = this.ensureRecoveredMetadata(order);
        if (!metadata) continue;
      }

      // Skip stale updates — prevents out-of-order push issues
      const existingOrder = this.orders.get(order.clientOrderId);
      if (
        existingOrder?.updateTime &&
        order.updateTime &&
        existingOrder.updateTime.getTime() >= order.updateTime.getTime()
      )
        continue;

      this.orders.set(order.clientOrderId, order);

      // Track step entry order status
      if (metadata.signalType === SignalType.Entry && metadata.stepIndex !== undefined) {
        const step = this.steps[metadata.stepIndex];
        if (step && !step.entryClientOrderId) {
          step.entryClientOrderId = order.clientOrderId;
        }
      }

      const totalFilled = order.executedQuantity || new Decimal(0);
      const lastProcessed =
        this.processedQuantityMap.get(order.clientOrderId) || new Decimal(0);
      const hasNewFill = totalFilled.gt(lastProcessed);

      // ── Entry order: PARTIAL fill ──
      if (
        hasNewFill &&
        metadata.signalType === SignalType.Entry &&
        order.status === OrderStatus.PARTIALLY_FILLED
      ) {
        signals.push(...this.handleEntryPartialFill(order, metadata));
        continue;
      }

      // ── TP order: PARTIAL fill → no action (TP state managed by exchange) ──
      if (
        hasNewFill &&
        metadata.signalType === SignalType.TakeProfit &&
        order.status === OrderStatus.PARTIALLY_FILLED
      ) {
        // Update processed quantity for tracking
        this.processedQuantityMap.set(order.clientOrderId, totalFilled);
        this._logger.debug(
          `[handleOrderUpdates] TP PARTIAL fill: ${totalFilled.toString()}/${order.quantity?.toString()}. No action taken.`,
        );
        continue;
      }

      // ── Full FILL ──
      if (hasNewFill && order.status === OrderStatus.FILLED) {
        if (metadata.signalType === SignalType.Entry) {
          metadata.entryPrice = (order.averagePrice || order.price)?.toString();
        }
        this.processedQuantityMap.set(order.clientOrderId, totalFilled);

        if (metadata.signalType === SignalType.Entry) {
          signals.push(...this.handleEntryFilled(order, metadata));
        } else if (metadata.signalType === SignalType.TakeProfit) {
          signals.push(...this.handleTpFilled(order));
        }
        continue;
      }

      // ── Terminal (cancelled / rejected / expired) ──
      if (this.isTerminalStatus(order.status)) {
        if (this.processedTerminalIds.has(order.clientOrderId)) continue;
        this.processedTerminalIds.add(order.clientOrderId);
        this.pendingClientOrderIds.delete(order.clientOrderId);

        if (
          metadata.signalType === SignalType.Entry &&
          metadata.stepIndex !== undefined
        ) {
          const step = this.steps[metadata.stepIndex];
          if (step) {
            const filledQty = order.executedQuantity || new Decimal(0);
            if (filledQty.lte(0)) {
              step.entryClientOrderId = null;
              step.filled = false;
              shouldRefreshLadder = true;
            }
          }
        }

        if (metadata.signalType === SignalType.TakeProfit) {
          if (this.tpClientOrderId === order.clientOrderId) {
            this.tpClientOrderId = null;
          }
          if (this.inventoryQty.gt(0)) {
            signals.push(...this.refreshTakeProfit());
          }
        }

        this.orders.delete(order.clientOrderId);
        this.processedQuantityMap.delete(order.clientOrderId);
        this.orderMetadataMap.delete(order.clientOrderId);
      }
    }

    if (shouldRefreshLadder) {
      signals.push(...this.placeLadderEntries());
    }
    return signals;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Recovery helpers (stop/restart/service restart)
  // ──────────────────────────────────────────────────────────────────────────

  private ensureRecoveredMetadata(order: Order): LadderSignalMetaData | undefined {
    if (!order.clientOrderId || !this.isStrategyOrderId(order.clientOrderId))
      return undefined;
    const signalType = order.clientOrderId.startsWith('T')
      ? SignalType.TakeProfit
      : SignalType.Entry;
    const metadata: LadderSignalMetaData = {
      signalType,
      timestamp: Date.now(),
      clientOrderId: order.clientOrderId,
      side: order.side,
    };
    this.orderMetadataMap.set(order.clientOrderId, metadata);
    return metadata;
  }

  private isStrategyOrderId(clientOrderId: string): boolean {
    const strategyId = this.getStrategyId();
    const match = /^(E|T)(\d+)D/.exec(clientOrderId);
    return !!match && match[2] === String(strategyId);
  }

  private isTerminalStatus(status: OrderStatus): boolean {
    return (
      status === OrderStatus.CANCELED ||
      status === OrderStatus.REJECTED ||
      status === OrderStatus.EXPIRED
    );
  }

  /**
   * Recover step index from entry order clientOrderId by matching price.
   * Used during restart recovery when metadata.stepIndex is not available.
   */
  private recoverStepIndex(order: Order): number | undefined {
    if (order.side !== OrderSide.BUY) return undefined;
    if (!order.price) return undefined;

    // Try to match by price against existing ladder steps
    for (const step of this.steps) {
      if (step.price.eq(order.price)) return step.index;
    }

    // If steps not built yet, try to infer from price relative to referencePrice
    // This is a best-effort recovery; if it fails, the order is tracked but
    // not tied to a specific step
    return undefined;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Public strategy interface
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Process initial data on strategy start / restart / service restart.
   *
   * Recovery flow:
   * 1. If basePrice=0 → fetch orderbook via REST to get bid0 → set referencePrice
   * 2. Build ladder from referencePrice
   * 3. Recover existing open orders (filter by this strategy's clientOrderId prefix)
   * 4. Recalculate VWAP from all recovered entry orders (including partial fills)
   * 5. If inventory > 0 but no active TP → create TP
   * 6. Place remaining ladder entries (steps not yet filled or placed)
   *
   * This makes the strategy fully idempotent on restart.
   */
  public override async processInitialData(
    initialData: InitialDataResult,
  ): Promise<StrategyAnalyzeResult> {
    const signals: StrategyResult[] = [];

    // Step 1: Set reference price from REST orderbook if basePrice=0
    if (this.referencePrice.lte(0) && initialData.orderBook) {
      const bestBid = initialData.orderBook.bids?.[0]?.[0];
      if (bestBid && bestBid.gt(0)) {
        this.referencePrice = bestBid;
        this._logger.debug(
          `[processInitialData] Reference price from REST orderbook bid0: ${this.referencePrice.toString()}`,
        );
      }
    }

    // If basePrice=0 and no orderbook was fetched, we cannot proceed
    if (this.referencePrice.lte(0)) {
      this._logger.warn(
        `[processInitialData] basePrice=0 but no orderBook available in initialData. ` +
          `Cannot determine reference price. Make sure getInitialDataConfig() returns fetchOrderBook.enabled=true. ` +
          `No entry orders will be placed.`,
      );
      return [];
    }

    // Step 2: Build ladder
    if (this.steps.length === 0 && this.referencePrice.gt(0)) {
      this.steps = this.buildLadder();
    }

    // Step 3: Recover existing open orders
    if (initialData.openOrders) {
      const ownedOrders = initialData.openOrders.filter((order) => {
        if (order.symbol !== this._symbol) return false;
        return (
          (order.strategyId && order.strategyId === this.getStrategyId()) ||
          (order.clientOrderId && this.isStrategyOrderId(order.clientOrderId))
        );
      });

      for (const order of ownedOrders) {
        if (!order.clientOrderId) continue;
        let metadata = this.orderMetadataMap.get(order.clientOrderId);
        if (!metadata) metadata = this.ensureRecoveredMetadata(order);
        if (!metadata) continue;

        this.orders.set(order.clientOrderId, order);

        // Recover stepIndex for entry orders
        if (
          metadata.signalType === SignalType.Entry &&
          metadata.stepIndex === undefined
        ) {
          const recoveredStepIndex = this.recoverStepIndex(order);
          if (recoveredStepIndex !== undefined) {
            metadata.stepIndex = recoveredStepIndex;
            const step = this.steps[recoveredStepIndex];
            if (step) {
              step.entryClientOrderId = order.clientOrderId;
              if (
                order.status === OrderStatus.FILLED ||
                (order.executedQuantity && order.executedQuantity.eq(order.quantity))
              ) {
                step.filled = true;
              }
            }
          }
        } else if (
          metadata.signalType === SignalType.Entry &&
          metadata.stepIndex !== undefined
        ) {
          const step = this.steps[metadata.stepIndex];
          if (step) {
            step.entryClientOrderId = order.clientOrderId;
            if (
              order.status === OrderStatus.FILLED ||
              (order.executedQuantity && order.executedQuantity.eq(order.quantity))
            ) {
              step.filled = true;
            }
          }
        }

        if (metadata.signalType === SignalType.TakeProfit) {
          this.tpClientOrderId = order.clientOrderId;
        }

        // Track executed quantities for VWAP recalculation
        if (order.executedQuantity && order.executedQuantity.gt(0)) {
          this.processedQuantityMap.set(order.clientOrderId, order.executedQuantity);
          if (metadata.signalType === SignalType.Entry) {
            metadata.entryPrice = (order.averagePrice || order.price)?.toString();
          }
        }
      }

      // Step 4: Recalculate VWAP from all recovered entry orders
      this.recalculateVWAP();

      this._logger.debug(
        `[processInitialData] Recovery: ${ownedOrders.length} orders recovered, ` +
          `inventory=${this.inventoryQty.toString()}, VWAP=${this.vwap.toString()}, ` +
          `active TP=${this.tpClientOrderId ?? 'none'}`,
      );
    }

    // Step 5: If inventory > 0 but no active TP, create one
    if (this.inventoryQty.gt(0) && !this.tpClientOrderId) {
      signals.push(...this.refreshTakeProfit());
    }

    // Step 6: Place remaining ladder entries
    signals.push(...this.placeLadderEntries());

    return signals;
  }

  /**
   * Analyze real-time data updates.
   * No orderbook subscription — only processes order updates from WebSocket.
   */
  public override async analyze(dataUpdate: DataUpdate): Promise<StrategyAnalyzeResult> {
    // Only handle order updates (no orderbook/kline subscription)
    if (dataUpdate.orders && dataUpdate.orders.length > 0) {
      const orderSignals = this.handleOrderUpdates(dataUpdate.orders);
      if (orderSignals.length > 0) return orderSignals;
      return { action: 'hold' };
    }

    return { action: 'hold' };
  }

  protected async onCleanup(): Promise<void> {
    this.orders.clear();
    this.orderMetadataMap.clear();
    this.pendingClientOrderIds.clear();
    this.processedQuantityMap.clear();
    this.processedTerminalIds.clear();
    this.steps = [];
    this.inventoryQty = new Decimal(0);
    this.vwap = new Decimal(0);
    this.tpClientOrderId = null;
    this._logger.debug('LadderEntrySingleTPStrategy cleaned up');
  }

  public getStrategyState() {
    return {
      strategyId: this.getStrategyId(),
      referencePrice: this.referencePrice.toString(),
      inventoryQty: this.inventoryQty.toString(),
      vwap: this.vwap.toString(),
      tpClientOrderId: this.tpClientOrderId,
      tpPrice: this.computeTpPrice()?.toString() ?? null,
      steps: this.steps.map((s) => ({
        index: s.index,
        price: s.price.toString(),
        quantity: s.quantity.toString(),
        entryClientOrderId: s.entryClientOrderId,
        filled: s.filled,
      })),
      remainingInvestmentCapacity: this.getRemainingInvestmentCapacity().toString(),
      remainingPositionCapacity: this.getRemainingPositionCapacity().toString(),
      buyingPower: this.getBuyingPower().toString(),
      committedNotional: this.getCommittedNotional().toString(),
    };
  }

  /**
   * No real-time subscriptions. Orderbook is only fetched via REST at init.
   */
  public override getSubscriptionConfig() {
    return {
      method: 'websocket' as const,
      exchange: this._context.exchange,
    };
  }

  /**
   * Initial data config: fetch open orders + orderbook (REST, for basePrice=0).
   */
  public override getInitialDataConfig() {
    const needOrderBook = this.basePrice.lte(0);
    return {
      fetchPositions: true,
      fetchOpenOrders: true,
      fetchBalance: true,
      fetchOrderBook: needOrderBook ? { enabled: true, depth: 5 } : { enabled: false },
    };
  }
}
