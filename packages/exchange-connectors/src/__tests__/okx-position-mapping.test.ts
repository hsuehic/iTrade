import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { Position } from '@itrade/core';

import { OKXExchange } from '../okx/OKXExchange';

type OkxExchangeInternals = OKXExchange & {
  transformOKXBalanceAndPosition: (data: {
    balData?: Array<{ ccy: string; cashBal?: string }>;
    posData?: Array<Record<string, unknown>>;
  }) => { balances: unknown[]; positions: Position[] };
};

describe('OKXExchange position mapping', () => {
  it('falls back to last price for mark price and computes unrealized PnL', () => {
    const exchange = new OKXExchange(false) as OkxExchangeInternals;
    const { positions } = exchange.transformOKXBalanceAndPosition({
      posData: [
        {
          instId: 'BTC-USDT-SWAP',
          pos: '2',
          avgPx: '2000',
          last: '2500',
          posSide: 'net',
        },
      ],
    });

    expect(positions).toHaveLength(1);
    expect(positions[0].markPrice.eq(new Decimal('2500'))).toBe(true);
    expect(positions[0].unrealizedPnl.eq(new Decimal('1000'))).toBe(true);
    expect(positions[0].side).toBe('long');
    expect(positions[0].marketValue?.eq(new Decimal('5000'))).toBe(true);
  });

  it('derives mark price from notionalUsd when price fields are missing', () => {
    const exchange = new OKXExchange(false) as OkxExchangeInternals;
    const { positions } = exchange.transformOKXBalanceAndPosition({
      posData: [
        {
          instId: 'ETH-USDT-SWAP',
          pos: '3',
          avgPx: '900',
          notionalUsd: '3000',
          posSide: 'long',
        },
      ],
    });

    expect(positions).toHaveLength(1);
    expect(positions[0].markPrice.eq(new Decimal('1000'))).toBe(true);
    expect(positions[0].unrealizedPnl.eq(new Decimal('300'))).toBe(true);
  });
});
