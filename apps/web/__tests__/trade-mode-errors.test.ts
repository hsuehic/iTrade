import { describe, expect, it } from 'vitest';

import { mapTradeModeError } from '@/lib/trade-mode-errors';
import { TradeModeError } from '@/lib/trade-mode';

/**
 * The switch endpoint is operator-driven: every failure has to come back with a
 * status the UI can act on. This pins the mapping so a refactor cannot quietly
 * turn "close the position first" (409) or a credential failure (401) into a
 * generic 502.
 */
describe('mapTradeModeError', () => {
  it('maps the operator-actionable failures to 400', () => {
    expect(mapTradeModeError(new TradeModeError('not-perpetual', 'spot'))).toEqual({
      status: 400,
      code: 'not-perpetual',
      message: 'spot',
    });
    expect(
      mapTradeModeError(new TradeModeError('invalid-input', 'bad body')).status,
    ).toBe(400);
    expect(
      mapTradeModeError(new TradeModeError('unsupported-exchange', 'no endpoint')).status,
    ).toBe(400);
  });

  it('maps an exchange precondition to 409', () => {
    expect(mapTradeModeError(new TradeModeError('position-open', 'close it'))).toEqual({
      status: 409,
      code: 'position-open',
      message: 'close it',
    });
    expect(
      mapTradeModeError(new TradeModeError('open-orders', 'cancel them')).status,
    ).toBe(409);
  });

  it('keeps a credential failure a 401 instead of a 502', () => {
    // The service classifies the connector failure as 'exchange-error'; the
    // httpStatus the connector carried is what has to win.
    const mapped = mapTradeModeError(
      new TradeModeError('exchange-error', 'Invalid API-key', 401),
    );

    expect(mapped.status).toBe(401);
    expect(mapped.code).toBe('unauthorized');
  });

  it('reads the status off a raw axios error too', () => {
    expect(mapTradeModeError({ response: { status: 401 } }).status).toBe(401);
    expect(mapTradeModeError({ response: { status: 500 } }).status).toBe(502);
  });

  it('maps pre-exchange setup failures to 400, everything else to 502', () => {
    // getActiveAccount / createExchangeConnection raise these before the
    // exchange is called — a 502 would blame the exchange for a local problem.
    const mapped = mapTradeModeError(new Error('Exchange credentials are missing'));

    expect(mapped.status).toBe(400);
    expect(mapped.code).toBe('invalid-input');

    const generic = mapTradeModeError(new Error('-1003 too many requests'));
    expect(generic.status).toBe(502);
    expect(generic.code).toBe('exchange-error');
  });
});
