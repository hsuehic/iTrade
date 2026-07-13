import { describe, expect, it } from 'vitest';

type Granularity = 'hour' | 'day' | 'month';

type BalanceHistoryPoint = {
  timestamp: Date;
  balance: number;
  createdAt?: Date;
};

type Transfer = {
  timestamp: Date;
  amount: number;
  type: 'DEPOSIT' | 'WITHDRAW';
  status: 'COMPLETED' | 'PENDING';
  network?: string;
  exchange: string;
};

function periodKey(date: Date, granularity: Granularity): string {
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  if (granularity === 'month') return `${y}-${mo}`;
  if (granularity === 'day') return `${y}-${mo}-${d}`;
  return `${y}-${mo}-${d}T${h}:00`;
}

function periodStartFromKey(key: string, granularity: Granularity): Date {
  if (granularity === 'month') {
    return new Date(`${key}-01T00:00:00.000Z`);
  }

  if (granularity === 'day') {
    return new Date(`${key}T00:00:00.000Z`);
  }

  return new Date(`${key}:00.000Z`);
}

function nextPeriodStartFromKey(key: string, granularity: Granularity): Date {
  const next = periodStartFromKey(key, granularity);

  if (granularity === 'month') {
    next.setUTCMonth(next.getUTCMonth() + 1);
  } else if (granularity === 'day') {
    next.setUTCDate(next.getUTCDate() + 1);
  } else {
    next.setUTCHours(next.getUTCHours() + 1);
  }

  return next;
}

function transferStartForPeriod(
  openingPoint: BalanceHistoryPoint | undefined,
  openingKey: string,
  currentKey: string,
  granularity: Granularity,
): Date {
  const currentPeriodStart = periodStartFromKey(currentKey, granularity);
  const openingPeriodEnd = nextPeriodStartFromKey(openingKey, granularity);
  const createdAt = openingPoint?.createdAt ? new Date(openingPoint.createdAt) : null;

  if (createdAt && createdAt.getTime() > openingPeriodEnd.getTime()) {
    return createdAt;
  }

  return currentPeriodStart;
}

function calculatePnl(
  openingPoint: BalanceHistoryPoint,
  closingPoint: BalanceHistoryPoint,
  transfers: Transfer[],
  granularity: Granularity,
): number {
  const openingKey = periodKey(openingPoint.timestamp, granularity);
  const currentKey = periodKey(closingPoint.timestamp, granularity);
  const transferStart = transferStartForPeriod(
    openingPoint,
    openingKey,
    currentKey,
    granularity,
  );
  const netTransfer = transfers.reduce((sum, transfer) => {
    if (transfer.status !== 'COMPLETED') return sum;
    if (transfer.network === 'internal') return sum;
    if (transfer.exchange.toLowerCase() !== 'binance') return sum;
    if (periodKey(transfer.timestamp, granularity) !== currentKey) return sum;
    if (transfer.timestamp.getTime() < transferStart.getTime()) return sum;

    return sum + (transfer.type === 'DEPOSIT' ? transfer.amount : -transfer.amount);
  }, 0);

  return closingPoint.balance - openingPoint.balance - netTransfer;
}

describe('P&L chart transfer adjustment', () => {
  const transfer: Transfer = {
    timestamp: new Date('2026-07-12T16:05:15.000Z'),
    amount: 2288.195442,
    type: 'DEPOSIT',
    status: 'COMPLETED',
    network: 'APT',
    exchange: 'binance',
  };

  it.each([
    {
      granularity: 'hour' as const,
      opening: {
        timestamp: new Date('2026-07-12T15:00:00.000Z'),
        balance: 2289.158552613,
        createdAt: new Date('2026-07-12T16:50:52.673Z'),
      },
      closing: {
        timestamp: new Date('2026-07-12T16:00:00.000Z'),
        balance: 2288.900879385,
      },
    },
    {
      granularity: 'day' as const,
      opening: {
        timestamp: new Date('2026-07-11T00:00:00.000Z'),
        balance: 2289.158552613,
        createdAt: new Date('2026-07-12T16:50:52.672Z'),
      },
      closing: {
        timestamp: new Date('2026-07-12T00:00:00.000Z'),
        balance: 2288.7710909459,
      },
    },
    {
      granularity: 'month' as const,
      opening: {
        timestamp: new Date('2026-06-01T00:00:00.000Z'),
        balance: 2289.158552613,
        createdAt: new Date('2026-07-12T16:50:52.670Z'),
      },
      closing: {
        timestamp: new Date('2026-07-01T00:00:00.000Z'),
        balance: 2300.130139323,
      },
    },
  ])(
    'does not subtract first-sync transfer already included in $granularity opening baseline',
    ({ granularity, opening, closing }) => {
      const pnl = calculatePnl(opening, closing, [transfer], granularity);

      expect(Math.abs(pnl)).toBeLessThan(12);
    },
  );
});
