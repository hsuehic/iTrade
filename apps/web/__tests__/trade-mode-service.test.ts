import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarginModeSwitchError } from '@itrade/core';
import { mapTradeModeError } from '@/lib/trade-mode-errors';

/**
 * Server-side guards for the position page's margin-mode switch. The dialog
 * blocks the obvious case client-side, but the API must not depend on that:
 * a pair that still has a position (stored OR live) or resting orders has to
 * be refused here (code position-open / open-orders) before the exchange is
 * asked to switch.
 */

const findAll = vi.fn();
const setMarginMode = vi.fn();
const getOpenOrders = vi.fn();
const getMarginMode = vi.fn();
const getPositions = vi.fn();
const disconnect = vi.fn();

vi.mock('@/lib/data-manager', () => ({
  getDataManager: async () => ({
    getPositionRepository: () => ({ findAll }),
  }),
}));

/**
 * Lets a single test swap in a different adapter (e.g. one without
 * `setMarginMode`) without re-registering the module mock.
 */
const connectionState: { override: unknown } = { override: null };

vi.mock('@/lib/services/order-execution-service', () => ({
  getActiveAccount: async () => ({ exchange: 'binance' }),
  createExchangeConnection: async () =>
    connectionState.override ?? {
      exchange: { setMarginMode, getOpenOrders, getMarginMode, getPositions, disconnect },
      isDemo: false,
    },
}));

const { setSymbolTradeMode, getSymbolTradeMode, TradeModeError } = await import(
  '../lib/services/trade-mode-service'
);

const input = {
  exchange: 'binance',
  symbol: 'WLD/USDC:USDC',
  tradeMode: 'isolated' as const,
};

describe('setSymbolTradeMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectionState.override = null;
    findAll.mockResolvedValue([]);
    getPositions.mockResolvedValue([]);
    getOpenOrders.mockResolvedValue([]);
    setMarginMode.mockResolvedValue({
      symbol: 'WLD/USDC:USDC',
      marginMode: 'isolated',
      changed: true,
    });
    getMarginMode.mockResolvedValue('isolated');
  });

  it('refuses a symbol whose stored position is still open, without touching the exchange', async () => {
    findAll.mockResolvedValue([
      { symbol: 'WLD/USDC:USDC', side: 'long', quantity: { isZero: () => false } },
    ]);

    await expect(setSymbolTradeMode('user-1', input)).rejects.toMatchObject({
      code: 'position-open',
    });
    expect(findAll).toHaveBeenCalledWith({
      userId: 'user-1',
      exchange: 'binance',
      symbol: 'WLD/USDC:USDC',
    });
    expect(setMarginMode).not.toHaveBeenCalled();
    expect(getOpenOrders).not.toHaveBeenCalled();
  });

  it('refuses a live position even when the stored row is flat or stale', async () => {
    getPositions.mockResolvedValue([
      {
        symbol: 'WLD/USDC:USDC',
        side: 'long',
        quantity: { abs: () => ({ gt: () => true }) },
      },
    ]);

    await expect(setSymbolTradeMode('user-1', input)).rejects.toMatchObject({
      code: 'position-open',
    });
    expect(setMarginMode).not.toHaveBeenCalled();
  });

  it('refuses a live position reported in a raw exchange symbol format', async () => {
    // Binance's getPositions() denormalizes to WLD/USDC:USDC today, but the
    // comparison is canonical: a raw WLDUSDC must not slip through the guard.
    getPositions.mockResolvedValue([
      { symbol: 'WLDUSDC', side: 'short', quantity: { abs: () => ({ gt: () => true }) } },
    ]);

    await expect(setSymbolTradeMode('user-1', input)).rejects.toMatchObject({
      code: 'position-open',
    });
    expect(setMarginMode).not.toHaveBeenCalled();
  });

  it('lets the exchange be the backstop when the live-position read comes back empty', async () => {
    // Binance's getPositions() swallows a failing request and resolves [] — the
    // guard then sees "flat" and the switch is attempted. That gap is accepted
    // (the exchange still refuses with -4048 while a position exists), so this
    // pins the real behaviour instead of a rejection the adapter never throws.
    getPositions.mockResolvedValue([]);
    setMarginMode.mockRejectedValue(
      new MarginModeSwitchError(
        'position-open',
        'Binance refused the margin-mode switch: the symbol still has a position',
        '-4048',
      ),
    );

    await expect(setSymbolTradeMode('user-1', input)).rejects.toMatchObject({
      code: 'position-open',
    });
    expect(setMarginMode).toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
  });

  it('keeps a credential failure a 401 for the API layer', async () => {
    setMarginMode.mockRejectedValue(
      new MarginModeSwitchError('unknown', 'Invalid API-key', '-2015', 401),
    );

    await expect(setSymbolTradeMode('user-1', input)).rejects.toMatchObject({
      code: 'exchange-error',
      httpStatus: 401,
    });
  });

  it('ignores resting orders that belong to another symbol', async () => {
    // A connector that ignored the symbol argument must not turn the guard into
    // a blanket refusal: only orders for the selected symbol block the switch.
    getOpenOrders.mockResolvedValue([{ symbol: 'BTCUSDC', id: '1' }]);

    await expect(setSymbolTradeMode('user-1', input)).resolves.toMatchObject({
      changed: true,
    });
    expect(setMarginMode).toHaveBeenCalledWith('WLD/USDC:USDC', 'isolated');
  });

  it('refuses to switch when the connector has no margin-mode switch at all', async () => {
    // Deliberately incomplete adapter: no setMarginMode.
    connectionState.override = {
      exchange: { getPositions, getOpenOrders, getMarginMode, disconnect },
      isDemo: false,
    };

    await expect(setSymbolTradeMode('user-1', input)).rejects.toMatchObject({
      code: 'unsupported-exchange',
    });
    expect(setMarginMode).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
  });

  it('ignores a stored position that is already flat', async () => {
    findAll.mockResolvedValue([
      { symbol: 'WLD/USDC:USDC', side: 'long', quantity: { isZero: () => true } },
    ]);

    await expect(setSymbolTradeMode('user-1', input)).resolves.toMatchObject({
      changed: true,
    });
  });

  it('refuses a symbol that still has open orders', async () => {
    getOpenOrders.mockResolvedValue([
      { symbol: 'WLDUSDC', id: '1' },
      { symbol: 'WLDUSDC', id: '2' },
    ]);

    await expect(setSymbolTradeMode('user-1', input)).rejects.toMatchObject({
      code: 'open-orders',
    });
    expect(setMarginMode).not.toHaveBeenCalled();
  });

  it('switches the mode on a flat symbol and reads the mode back', async () => {
    const result = await setSymbolTradeMode('user-1', input);

    expect(setMarginMode).toHaveBeenCalledWith('WLD/USDC:USDC', 'isolated');
    expect(getOpenOrders).toHaveBeenCalledWith('WLD/USDC:USDC');
    expect(result).toEqual({
      exchange: 'binance',
      symbol: 'WLD/USDC:USDC',
      tradeMode: 'isolated',
      changed: true,
      currentMarginMode: 'isolated',
    });
    expect(disconnect).toHaveBeenCalled();
  });

  it('keeps the connector classification when the exchange refuses the switch', async () => {
    setMarginMode.mockRejectedValue(
      new MarginModeSwitchError(
        'open-orders',
        'Binance refused: open orders exist',
        '-4047',
      ),
    );

    await expect(setSymbolTradeMode('user-1', input)).rejects.toMatchObject({
      code: 'open-orders',
    });
    expect(disconnect).toHaveBeenCalled();
  });

  it('classifies the -4168 account-level refusal as multi-assets-mode, mapped to a 409', async () => {
    // Produced by BinanceExchange when the account runs in Multi-Assets mode.
    // Dropping this case would send the reason through the default branch and
    // turn the operator-actionable copy back into an 'exchange-error' 502.
    setMarginMode.mockRejectedValue(
      new MarginModeSwitchError(
        'multi-assets-mode',
        'Binance refused the margin-mode switch for WLDUSDC: the account is in Multi-Assets mode (code -4168)',
        '-4168',
      ),
    );

    const error = await setSymbolTradeMode('user-1', input).catch((e) => e);

    expect(error).toMatchObject({ code: 'multi-assets-mode' });
    expect(mapTradeModeError(error)).toMatchObject({
      status: 409,
      code: 'multi-assets-mode',
    });
    expect(disconnect).toHaveBeenCalled();
  });

  it('classifies an unrecognised exchange failure as exchange-error, still disconnecting', async () => {
    setMarginMode.mockRejectedValue(new Error('socket hang up'));

    await expect(setSymbolTradeMode('user-1', input)).rejects.toMatchObject({
      code: 'exchange-error',
    });
    expect(disconnect).toHaveBeenCalled();
  });

  it('rejects spot symbols and every exchange without a margin-mode switch', async () => {
    await expect(
      setSymbolTradeMode('user-1', { ...input, symbol: 'WLD/USDC' }),
    ).rejects.toMatchObject({ code: 'not-perpetual' });

    // OKX's perp mode follows the order's tdMode; Coinbase perps are cross-only.
    await expect(
      setSymbolTradeMode('user-1', { ...input, exchange: 'okx' }),
    ).rejects.toMatchObject({ code: 'unsupported-exchange' });

    await expect(
      setSymbolTradeMode('user-1', { ...input, exchange: 'coinbase' }),
    ).rejects.toMatchObject({ code: 'unsupported-exchange' });

    await expect(
      setSymbolTradeMode('user-1', {
        exchange: 'binance',
        symbol: '',
        tradeMode: 'isolated',
      }),
    ).rejects.toBeInstanceOf(TradeModeError);
  });
});

describe('getSymbolTradeMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the live mode', async () => {
    getMarginMode.mockResolvedValue('cross');

    await expect(
      getSymbolTradeMode('user-1', 'binance', 'WLD/USDC:USDC'),
    ).resolves.toEqual({
      exchange: 'binance',
      symbol: 'WLD/USDC:USDC',
      marginMode: 'cross',
    });
  });

  it('reports null when the exchange cannot tell, and rejects spot symbols', async () => {
    getMarginMode.mockResolvedValue(null);

    await expect(
      getSymbolTradeMode('user-1', 'binance', 'WLD/USDC:USDC'),
    ).resolves.toMatchObject({
      marginMode: null,
    });
    await expect(
      getSymbolTradeMode('user-1', 'binance', 'WLD/USDC'),
    ).rejects.toMatchObject({
      code: 'not-perpetual',
    });
  });
});
