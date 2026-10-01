import { describe, it, expect } from 'vitest';

import {
  AccountWalletType,
  getSupportedTransferRoutes,
  getSupportedTransferWallets,
  isTransferRouteSupported,
  supportsTransfers,
  transferRouteNeedsSymbol,
} from '@itrade/core';

/**
 * The transfer form derives its From/To dropdowns from these routes, and
 * executeTransfer re-validates them server-side — so a wrong route table here
 * either hides a real route or offers one the exchange will reject.
 */
describe('internal transfer routes', () => {
  it('offers every Binance wallet pair plus Spot <-> Earn', () => {
    expect(getSupportedTransferWallets('binance')).toEqual([
      AccountWalletType.FUNDING,
      AccountWalletType.SPOT,
      AccountWalletType.PERPETUAL,
      AccountWalletType.COIN_M,
      AccountWalletType.MARGIN,
      AccountWalletType.OPTION,
      AccountWalletType.ISOLATED_MARGIN,
      AccountWalletType.EARN,
    ]);
    // 16 wallet pairs, each usable in both directions.
    expect(getSupportedTransferRoutes('binance')).toHaveLength(32);
  });

  it('restricts OKX to Funding <-> Trading plus Trading <-> Earn', () => {
    expect(getSupportedTransferWallets('okx')).toEqual([
      AccountWalletType.FUNDING,
      AccountWalletType.TRADING,
      AccountWalletType.EARN,
    ]);
  });

  it('treats Earn routes as one-way-capable but not universal', () => {
    expect(
      isTransferRouteSupported('binance', AccountWalletType.SPOT, AccountWalletType.EARN),
    ).toBe(true);
    expect(
      isTransferRouteSupported('binance', AccountWalletType.EARN, AccountWalletType.SPOT),
    ).toBe(true);
    // Earn is not part of the Universal Transfer enum — these pairs must fail.
    expect(
      isTransferRouteSupported(
        'binance',
        AccountWalletType.FUNDING,
        AccountWalletType.EARN,
      ),
    ).toBe(false);
    expect(
      isTransferRouteSupported(
        'binance',
        AccountWalletType.PERPETUAL,
        AccountWalletType.EARN,
      ),
    ).toBe(false);
    expect(
      isTransferRouteSupported('okx', AccountWalletType.FUNDING, AccountWalletType.EARN),
    ).toBe(false);
  });

  it('is case-insensitive on the exchange name', () => {
    expect(supportsTransfers('Binance')).toBe(true);
    expect(supportsTransfers('coinbase')).toBe(false);
    expect(supportsTransfers('kraken')).toBe(false);
  });

  it('leaves out the pairs Binance has no universal transfer type for', () => {
    expect(
      isTransferRouteSupported(
        'binance',
        AccountWalletType.PERPETUAL,
        AccountWalletType.COIN_M,
      ),
    ).toBe(false);
    expect(
      isTransferRouteSupported(
        'binance',
        AccountWalletType.COIN_M,
        AccountWalletType.OPTION,
      ),
    ).toBe(false);
    expect(
      isTransferRouteSupported(
        'binance',
        AccountWalletType.FUNDING,
        AccountWalletType.ISOLATED_MARGIN,
      ),
    ).toBe(false);

    // ...while the pairs it does document are offered.
    expect(
      isTransferRouteSupported(
        'binance',
        AccountWalletType.COIN_M,
        AccountWalletType.MARGIN,
      ),
    ).toBe(true);
    expect(
      isTransferRouteSupported(
        'binance',
        AccountWalletType.ISOLATED_MARGIN,
        AccountWalletType.SPOT,
      ),
    ).toBe(true);
  });

  it('flags only the isolated margin routes as needing a pair', () => {
    expect(
      transferRouteNeedsSymbol(
        'binance',
        AccountWalletType.SPOT,
        AccountWalletType.ISOLATED_MARGIN,
      ),
    ).toBe(true);
    expect(
      transferRouteNeedsSymbol(
        'binance',
        AccountWalletType.MARGIN,
        AccountWalletType.ISOLATED_MARGIN,
      ),
    ).toBe(true);

    // Everything else moves a whole wallet, so no pair is involved.
    expect(
      transferRouteNeedsSymbol(
        'binance',
        AccountWalletType.FUNDING,
        AccountWalletType.SPOT,
      ),
    ).toBe(false);
    expect(
      transferRouteNeedsSymbol(
        'okx',
        AccountWalletType.FUNDING,
        AccountWalletType.TRADING,
      ),
    ).toBe(false);

    // A route that is not supported reports false rather than "needs a pair".
    expect(
      transferRouteNeedsSymbol(
        'binance',
        AccountWalletType.PERPETUAL,
        AccountWalletType.ISOLATED_MARGIN,
      ),
    ).toBe(false);
  });
});
