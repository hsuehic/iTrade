import { describe, it, expect } from 'vitest';

import { TradeMode } from '@itrade/core';

import { resolvePerpOrderSettings } from '../lib/services/perp-order-settings';

/**
 * These rules are the 2026-10-01 fix: a Binance USDⓈ-M perpetual opening order
 * that asked for nothing used to leave the account's default CROSSED margin
 * (strategy 634 / WLDUSDC), while a manual CLOSE_* used to re-assert a mode on a
 * position that is still open (the exchange rejects that switch) and re-lever
 * the position being closed.
 */
describe('resolvePerpOrderSettings', () => {
  const binance = { isBinance: true, isCoinbase: false };
  const okx = { isBinance: false, isCoinbase: false };
  const coinbase = { isBinance: false, isCoinbase: true };

  it('defaults a Binance perpetual opening order to isolated', () => {
    const settings = resolvePerpOrderSettings({
      isPerpetual: true,
      isClosingOrder: false,
      ...binance,
    });
    expect(settings.tradeMode).toBe(TradeMode.ISOLATED);
  });

  it('sends no mode for Coinbase (cross-only perp market) but defaults to 5x', () => {
    const settings = resolvePerpOrderSettings({
      isPerpetual: true,
      isClosingOrder: false,
      ...coinbase,
    });
    // Coinbase ignores tradeMode and reports marginType 'cross', so recording a
    // requested mode there would misreport the position.
    expect(settings.tradeMode).toBeUndefined();
    expect(settings.leverage).toBe(5);
  });

  it('leaves OKX to its own connector defaults', () => {
    const settings = resolvePerpOrderSettings({
      isPerpetual: true,
      isClosingOrder: false,
      ...okx,
    });
    expect(settings.tradeMode).toBeUndefined();
    expect(settings.leverage).toBeUndefined();
  });

  it('honours an explicit request', () => {
    const settings = resolvePerpOrderSettings({
      isPerpetual: true,
      isClosingOrder: false,
      ...binance,
      requestedTradeMode: TradeMode.CROSS,
      requestedLeverage: 20,
    });
    expect(settings.tradeMode).toBe(TradeMode.CROSS);
    expect(settings.leverage).toBe(20);
  });

  it('never attaches either field to a spot symbol', () => {
    const settings = resolvePerpOrderSettings({
      isPerpetual: false,
      isClosingOrder: false,
      ...binance,
      requestedTradeMode: TradeMode.CROSS,
      requestedLeverage: 20,
    });
    expect(settings.tradeMode).toBeUndefined();
    expect(settings.leverage).toBeUndefined();
  });

  it('never re-asserts a mode or leverage on a reduce-only CLOSE_*', () => {
    const settings = resolvePerpOrderSettings({
      isPerpetual: true,
      isClosingOrder: true,
      ...binance,
      requestedTradeMode: TradeMode.ISOLATED,
      requestedLeverage: 10,
    });
    expect(settings.tradeMode).toBeUndefined();
    expect(settings.leverage).toBeUndefined();
  });
});
