import { describe, it, expect } from 'vitest';

import {
  AccountWalletType,
  getSupportedTransferRoutes,
  getSupportedTransferWallets,
  isTransferRouteSupported,
  supportsTransfers,
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
      AccountWalletType.EARN,
    ]);
    expect(getSupportedTransferRoutes('binance')).toHaveLength(8);
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
});
