import { TradeMode } from '@itrade/core';

/**
 * Decide what margin mode / leverage a manual order actually sends to the
 * exchange. Kept as a pure function in its own module (the service itself pulls
 * in the exchange connectors, which the vitest resolver cannot load) because
 * these rules are the whole point of the 2026-10-01 fix:
 *
 * - Binance USDⓈ-M accounts default to CROSSED, so a perpetual opening order
 *   that asks for nothing is explicitly set to ISOLATED. No default mode is sent
 *   for OKX (its connector has its own tdMode default, and an explicitly
 *   requested mode is still passed through) or Coinbase (cross-only perp market,
 *   plus a 5x leverage default).
 * - A spot symbol never carries either field.
 * - A CLOSE_* is a reduce-only exit: it must not re-assert a margin mode (the
 *   exchange refuses the switch while the position is still open) nor a
 *   leverage (that would re-lever the position being closed).
 */
export function resolvePerpOrderSettings(params: {
  isPerpetual: boolean;
  isClosingOrder: boolean;
  isBinance: boolean;
  isCoinbase: boolean;
  requestedTradeMode?: TradeMode;
  requestedLeverage?: number;
}): { tradeMode?: TradeMode; leverage?: number } {
  const {
    isPerpetual,
    isClosingOrder,
    isBinance,
    isCoinbase,
    requestedTradeMode,
    requestedLeverage,
  } = params;

  if (!isPerpetual || isClosingOrder) {
    return {};
  }

  return {
    // Binance USDⓈ-M accounts default to CROSSED, so ISOLATED has to be asked
    // for explicitly. Coinbase's perp market is cross-only (its connector also
    // ignores tradeMode and reports marginType 'cross'), so nothing is sent
    // there; OKX's connector applies its own tdMode default.
    tradeMode: requestedTradeMode ?? (isBinance ? TradeMode.ISOLATED : undefined),
    leverage: requestedLeverage ?? (isCoinbase ? 5 : undefined),
  };
}
