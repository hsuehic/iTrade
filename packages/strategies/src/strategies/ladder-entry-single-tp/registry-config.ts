import { StrategyRegistryConfig } from '../../type';
import { LadderEntrySingleTPParameters } from './types';

export const LadderEntrySingleTPStrategyRegistryConfig: StrategyRegistryConfig<LadderEntrySingleTPParameters> =
  {
    type: 'LadderEntrySingleTPStrategy',
    name: 'Ladder Entry Single TP',
    description:
      'Ladder entry with single take-profit strategy. Supports arithmetic/geometric ladder prices and quantities, ' +
      'progressive step spacing via stepValueAdd/stepValueRatio, ' +
      'TP condition supports fixed profit amount or percentage. TP order is updated immediately on each entry fill. ' +
      'Cancels remaining entries and starts a new cycle when TP is fully filled.',
    icon: '📗',
    implemented: true,
    category: 'volatility',
    defaultParameters: {
      basePrice: 0,
      // entryGapType / entryGapValue intentionally NOT in defaultParameters.
      // When absent, constructor falls back to stepType / stepValue (backward compatible).
      // This ensures old strategies loaded from DB (without these keys) keep
      // gap = stepValue → identical prices to pre-refactor behavior.
      // New strategies also default to gap = stepValue unless user explicitly sets them.
      ladderSteps: 5,
      stepType: 'arithmetic',
      stepValue: 1,
      // stepValueAdd / stepValueRatio default to 0 / 1 (backward compatible:
      // constant gap = stepValue for all levels). Progressive spacing is
      // opt-in; old strategies loaded from DB (without these keys) keep
      // identical pricing to pre-refactor behavior.
      stepValueAdd: 0,
      stepValueRatio: 1,
      qtyType: 'arithmetic',
      qtyPerStep: 0.1,
      qtyStepAdd: 0,
      qtyStepRatio: 1,
      tpType: 'percent',
      tpAbsoluteProfit: 100,
      tpPercent: 1,
      maxInvestment: 1000,
      maxPosition: 10,
      // 0 = no entry price cap (backward compatible: existing strategies loaded
      // from the DB without this key keep their current behaviour).
      maxEntryPrice: 0,
      leverage: 10,
      resetInterval: 0,
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
        name: 'entryGapType',
        type: 'enum',
        description:
          'Gap type between reference price and entry 0. "arithmetic" (absolute price drop: entryBase = referencePrice - entryGapValue) ' +
          'or "geometric" (percentage drop: entryBase = referencePrice * (1 - entryGapValue/100)). ' +
          'Defaults to same as stepType when not specified (backward compatible).',
        defaultValue: undefined,
        required: false,
        validation: { options: ['arithmetic', 'geometric'] },
        group: 'Entry Gap',
        order: 2,
      },
      {
        name: 'entryGapValue',
        type: 'number',
        description:
          'Gap between reference price (bid0 or basePrice) and entry 0. ' +
          'Arithmetic: absolute price drop (e.g. 300 = entry 0 is 300 USDT below referencePrice). ' +
          'Geometric: percentage drop (e.g. 0.62 = entry 0 is 0.62% below referencePrice). ' +
          '0 = entry 0 at the reference price itself (no gap). ' +
          'When not specified, defaults to stepValue (backward compatible: gap = inter-level gap).',
        defaultValue: undefined,
        required: false,
        min: 0,
        max: 1000000,
        group: 'Entry Gap',
        order: 3,
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
        order: 4,
      },
      {
        name: 'stepType',
        type: 'enum',
        description:
          'Ladder price step type (gap between entry levels, NOT gap from reference to entry 0): ' +
          '"arithmetic" (absolute price difference: price_i = entryBase - cumsum(stepValue + stepValueAdd*j), j=0..i-1) ' +
          'or "geometric" (percentage ratio: price_i = entryBase * prod(1 - stepValue*stepValueRatio^j/100, j=0..i-1)). ' +
          'Use stepValueAdd>0 or stepValueRatio≠1 for progressive spacing (wider gaps deeper in the ladder).',
        defaultValue: 'arithmetic',
        required: true,
        validation: { options: ['arithmetic', 'geometric'] },
        group: 'Ladder Entry',
        order: 5,
      },
      {
        name: 'stepValue',
        type: 'number',
        description:
          'Step value for ladder price (gap between entry levels). Arithmetic: absolute price drop per step (e.g. 300 = each step 300 USDT below entryBase, entry 1 is at entryBase - 300). ' +
          'Geometric: percentage drop per step (e.g. 1 = each step 1% below previous, entry 1 is at entryBase * 0.99). ' +
          'Note: the gap between reference price and entry 0 is controlled by entryGapType/entryGapValue, not stepValue.',
        defaultValue: 1,
        required: true,
        min: 0.000001,
        max: 1000000,
        group: 'Ladder Entry',
        order: 6,
      },
      {
        name: 'stepValueAdd',
        type: 'number',
        description:
          'Arithmetic increment added to stepValue per step (progressive spacing). ' +
          'gap[i] = stepValue + stepValueAdd * i, so gaps grow linearly (e.g. stepValue=100, stepValueAdd=50 → gaps: 100, 150, 200, 250...). ' +
          '0 = constant gap (backward compatible). Only used when stepType=arithmetic.',
        defaultValue: 0,
        required: false,
        min: 0,
        max: 1000000,
        step: 0.000001,
        group: 'Ladder Entry',
        order: 6.5,
        showIf: { field: 'stepType', equals: 'arithmetic' },
      },
      {
        name: 'stepValueRatio',
        type: 'number',
        description:
          'Geometric ratio applied to stepValue per step (progressive spacing). ' +
          'pct[i] = stepValue * stepValueRatio^i, so percentage drops grow geometrically (e.g. stepValue=1, stepValueRatio=1.5 → drops: 1%, 1.5%, 2.25%, 3.375%...). ' +
          '1 = constant percentage (backward compatible). Only used when stepType=geometric.',
        defaultValue: 1,
        required: false,
        min: 0.001,
        max: 100,
        step: 0.001,
        group: 'Ladder Entry',
        order: 6.6,
        showIf: { field: 'stepType', equals: 'geometric' },
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
        order: 7,
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
        order: 8,
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
        order: 9,
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
        order: 10,
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
        order: 11,
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
        order: 12,
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
        order: 13,
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
        order: 14,
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
        order: 15,
      },
      {
        name: 'maxEntryPrice',
        type: 'number',
        description:
          'Maximum entry price (quote currency). Entry orders are never placed above this price. ' +
          'The ladder is anchored on bid0, so an upward wick would otherwise drag every step up and ' +
          'accumulate a large position at the top; when entry 0 would land above this price, the ladder ' +
          'is anchored here instead and all steps shift down with it. 0 = no cap.',
        defaultValue: 0,
        required: false,
        min: 0,
        max: 100000000,
        group: 'Risk Management',
        order: 16,
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
        order: 17,
      },
      {
        // Declared as 'number', NOT 'enum'. The form renders an enum as a Select
        // whose onValueChange hands back the raw option STRING, so this used to
        // be persisted as `"resetInterval": "15"` while the TypeScript type said
        // number — everything only worked through JS coercion. A 'number' field
        // stores e.target.valueAsNumber, so the persisted value matches the type.
        name: 'resetInterval',
        type: 'number',
        description:
          'Reset interval in MINUTES. When only entry 0 (status=NEW, unfilled) exists and the specified time has elapsed, ' +
          'the strategy cancels entry 0, re-fetches orderbook, rebuilds ladder with fresh bid0, and places a new entry 0. ' +
          '0 = never reset. Typical values: 5, 15, 30, 60, 1440 (1 day).',
        defaultValue: 0,
        required: false,
        min: 0,
        max: 1440,
        step: 1,
        unit: 'minutes',
        group: 'Reset',
        order: 18,
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
      fetchOrderHistory: {
        required: true,
        editable: false,
        description: 'Fetch recent order history (FILLED orders) for restart recovery',
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
        'On TP fully filled, cancels all remaining entries and rebuilds the ladder with latest bid0 to start new cycle. ' +
        'resetInterval: if entry 0 stays unfilled for the specified time, cancels entry 0, re-fetches bid0, rebuilds ladder (0=never reset). ' +
        'Subscribes to orderbook WebSocket for real-time ask0; TP price floored at max(ask0, expectedTpPrice) to never sell below market ask.',
      parameters:
        'basePrice(0=bid0 via REST) + entryGapType/entryGapValue define the gap from reference price to entry 0 (arithmetic=ref-gapValue, geometric=ref*(1-gapValue/100)); ' +
        'stepType/stepValue define the gap between entry levels (arithmetic=entryBase-stepValue*i, geometric=entryBase*(1-stepValue/100)^i; i=0..ladderSteps-1); ' +
        'stepValueAdd/stepValueRatio enable progressive gap spacing (arithmetic: gap[i]=stepValue+stepValueAdd*i, geometric: pct[i]=stepValue*stepValueRatio^i; default 0/1 = constant gap); ' +
        'qtyType + qtyPerStep + qtyStepAdd/qtyStepRatio define ladder quantities; ' +
        'tpType + tpAbsoluteProfit/tpPercent define take-profit condition; ' +
        'maxInvestment * leverage = total buying power; maxPosition = max position size; ' +
        'maxEntryPrice caps the highest price an entry may be placed at (0 = no cap) — on an upward wick the ' +
        'ladder is anchored at maxEntryPrice instead of bid0 so no position is accumulated at the top; ' +
        'resetInterval: minutes (number, 0-1440) before auto-resetting stale entry 0 (0=never).',
      signals:
        'On start: Fetch orderbook bid0 via REST → build ladder → place first BUY limit entry order (sequential: next entry placed only after current one fills).\n' +
        'Entry fill (incl. partial): Recalculate VWAP → update TP (cancel old TP → place new TP, qty=current inventory, price=VWAP±profit target).\n' +
        'TP partial fill: No action taken (TP state managed by exchange).\n' +
        'TP fully filled: cancel all remaining entries → rebuild ladder with latest bid0 → start new cycle.\n' +
        'resetInterval elapsed (entry 0 still NEW): cancel entry 0 → re-fetch bid0 → rebuild ladder → place new entry 0.\n' +
        'Stop/restart: processInitialData recovers all strategy orders via REST fetchOpenOrders → recalculate VWAP/inventory → restore TP + re-place unfilled entries.',
      riskFactors: [
        'Ladder buying in a downtrend accumulates position and may hit maxPosition limit',
        'With maxEntryPrice=0 (no cap), an upward wick lifts bid0 and the whole ladder with it, so the position is accumulated at the top of the spike',
        'With maxEntryPrice set below the market, entries sit far below bid0 and may never fill until price comes back down',
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
