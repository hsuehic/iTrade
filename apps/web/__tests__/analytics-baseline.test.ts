/**
 * Regression tests for per-account baseline anchors (lib/analytics-baseline.ts).
 *
 * Incident (self-hosted server, 2026-11): user bound OKX on Nov 17 and Binance
 * on Nov 18, both carrying pre-existing balances. The monthly balance-change
 * card's baseline window (October) had no rows for either account; the old
 * aggregate fallback picked the first non-zero AGGREGATE chart point (OKX's
 * bind-time balance, Binance fill-forwarded at 0) as the baseline, reporting
 * the entire Binance opening balance (~$51.5k) as period profit (+2217%).
 *
 * The fix anchors each account at its OWN first recorded balance.
 */

import { describe, expect, it } from 'vitest';

import {
  computeBaselineAnchors,
  computeTransferStarts,
  type BaselineHistoryPoint,
} from '@/lib/analytics-baseline';

interface Row {
  period: string; // ISO
  balance: string;
  upnl?: string | null;
  createdAt: string; // ISO
}

function series(accountId: number, rows: Row[]): BaselineHistoryPoint[] {
  return rows.map((r) => ({
    timestamp: new Date(r.period),
    balance: r.balance,
    unrealizedPnl: r.upnl ?? null,
    createdAt: new Date(r.createdAt),
    accountId,
  }));
}

const ACCOUNTS = [
  { id: 1, exchange: 'okx' },
  { id: 2, exchange: 'binance' },
];

// Real prod rows (self-hosted server, user xiaoweihsueh@gmail.com):
// OKX bound Nov 17 with 2325.08; Binance bound Nov 18 with 51715.77.
const INCIDENT_CHART_DATA = [
  {
    exchange: 'okx',
    history: series(1, [
      {
        period: '2026-11-16T00:00:00Z',
        balance: '2325.08',
        createdAt: '2026-11-17T11:57:00Z', // bootstrap row, written at first sync
      },
      {
        period: '2026-11-17T00:00:00Z',
        balance: '2326.66',
        createdAt: '2026-11-17T11:57:01Z',
      },
    ]),
  },
  {
    exchange: 'binance',
    history: series(2, [
      {
        period: '2026-11-17T00:00:00Z',
        balance: '51715.77',
        createdAt: '2026-11-18T12:07:02Z', // bootstrap row
      },
      {
        period: '2026-11-18T00:00:00Z',
        balance: '51729.90',
        createdAt: '2026-11-18T12:07:03Z',
      },
    ]),
  },
];

describe('computeBaselineAnchors — incident repro (mid-period binds)', () => {
  it('anchors each account at its own first recorded balance, not the aggregate first point', () => {
    const anchors = computeBaselineAnchors({
      baselineData: [], // October window has no rows for either account
      chartData: INCIDENT_CHART_DATA,
      accounts: ACCOUNTS,
    });

    // Baseline must be 2325.08 + 51715.77 = 54040.85 — NOT 2325.08 (the old
    // aggregate behavior that reported ~+2217% "profit").
    expect(anchors.totalBaselineBalance).toBeCloseTo(54040.85, 6);
    expect(anchors.anchors.size).toBe(2);
    expect(anchors.anchoredInBaselineWindow.size).toBe(0);
  });

  it('reports ~0 change when nothing moved after the binds (the actual bug)', () => {
    const anchors = computeBaselineAnchors({
      baselineData: [],
      chartData: INCIDENT_CHART_DATA,
      accounts: ACCOUNTS,
    });
    const current = 2326.28 + 51524.92; // live totals on Nov 19
    const changeValue = current - anchors.totalBaselineBalance;
    const changePct = (changeValue / anchors.totalBaselineBalance) * 100;
    // Old code: +51566 (+2217%). Truth: -189.65 (-0.351%).
    expect(changeValue).toBeCloseTo(-189.65, 2);
    expect(changePct).toBeCloseTo(-0.35094, 4);
  });
});

describe('computeBaselineAnchors — calendar mode (baseline window has rows)', () => {
  it('picks each account’s latest row from the previous-period window', () => {
    const anchors = computeBaselineAnchors({
      baselineData: [
        {
          history: [
            ...series(1, [
              {
                period: '2026-10-02T00:00:00Z',
                balance: '2000',
                createdAt: '2026-10-02T00:00:10Z',
              },
              {
                period: '2026-10-31T00:00:00Z',
                balance: '2500',
                createdAt: '2026-10-31T00:00:10Z',
              },
            ]),
            // row from a different (deactivated) account must be ignored
            ...series(99, [
              {
                period: '2026-10-31T00:00:00Z',
                balance: '999999',
                createdAt: '2026-10-31T00:00:10Z',
              },
            ]),
          ],
        },
      ],
      chartData: [],
      accounts: ACCOUNTS,
    });

    expect(anchors.totalBaselineBalance).toBe(2500);
    expect(anchors.anchoredInBaselineWindow.size).toBe(1);
    expect(anchors.anchoredInBaselineWindow.has(1)).toBe(true);
  });

  it('treats the latest baseline-window row as the anchor even when it is 0 (admin parity)', () => {
    // Account 1's latest October row is 0 (genuinely emptied before period
    // end), with an earlier non-zero row. Admin semantics: the period-start
    // row IS the 0 row — the baseline must be 0, not the earlier 2000, and
    // the mid-period funding shows as change.
    const anchors = computeBaselineAnchors({
      baselineData: [
        {
          history: series(1, [
            {
              period: '2026-10-02T00:00:00Z',
              balance: '2000',
              createdAt: '2026-10-02T00:00:10Z',
            },
            {
              period: '2026-10-31T00:00:00Z',
              balance: '0',
              createdAt: '2026-10-31T00:00:10Z',
            },
          ]),
        },
      ],
      chartData: [
        {
          history: series(1, [
            {
              period: '2026-11-15T00:00:00Z',
              balance: '1000',
              createdAt: '2026-11-15T00:00:10Z',
            },
          ]),
        },
      ],
      accounts: ACCOUNTS,
    });

    expect(anchors.totalBaselineBalance).toBe(0);
    expect(anchors.anchors.has(1)).toBe(true); // anchored at the 0 row itself
    expect(anchors.anchors.get(1)?.balance.toString()).toBe('0');
    expect(anchors.anchoredInBaselineWindow.has(1)).toBe(true);
  });

  it('mixed: one account anchored in baseline window, one bound mid-period', () => {
    const anchors = computeBaselineAnchors({
      baselineData: [
        {
          history: series(1, [
            {
              period: '2026-10-31T00:00:00Z',
              balance: '3000',
              createdAt: '2026-10-31T00:00:10Z',
            },
          ]),
        },
      ],
      chartData: [
        {
          history: series(2, [
            {
              period: '2026-11-17T00:00:00Z',
              balance: '51715.77',
              createdAt: '2026-11-18T12:07:02Z',
            },
          ]),
        },
      ],
      accounts: ACCOUNTS,
    });

    // 3000 (real October close for OKX) + 51715.77 (Binance bind anchor)
    expect(anchors.totalBaselineBalance).toBeCloseTo(54715.77, 6);
    expect(anchors.anchoredInBaselineWindow.has(1)).toBe(true);
    expect(anchors.anchoredInBaselineWindow.has(2)).toBe(false);
  });
});

describe('computeBaselineAnchors — rolling mode (no baseline window)', () => {
  it('sums each account’s first non-zero point instead of the aggregate first point', () => {
    // Account 1 has data from window start; account 2 appears mid-window with
    // a large pre-existing balance. Aggregate-first would pick 100; per-account
    // picks 100 + 5000.
    const chartData = [
      {
        history: series(1, [
          {
            period: '2026-11-18T00:00:00Z',
            balance: '100',
            createdAt: '2026-11-18T00:00:10Z',
          },
          {
            period: '2026-11-19T00:00:00Z',
            balance: '110',
            createdAt: '2026-11-19T00:00:10Z',
          },
        ]),
      },
      {
        history: series(2, [
          {
            period: '2026-11-19T00:00:00Z',
            balance: '5000',
            createdAt: '2026-11-19T08:00:10Z',
          },
        ]),
      },
    ];

    const anchors = computeBaselineAnchors({
      baselineData: [],
      chartData,
      accounts: ACCOUNTS,
    });

    expect(anchors.totalBaselineBalance).toBe(5100);
  });

  it('skips leading zero rows per account', () => {
    const chartData = [
      {
        history: series(1, [
          {
            period: '2026-11-18T00:00:00Z',
            balance: '0',
            createdAt: '2026-11-18T00:00:10Z',
          },
          {
            period: '2026-11-18T01:00:00Z',
            balance: '250',
            createdAt: '2026-11-18T01:00:10Z',
          },
        ]),
      },
    ];

    const anchors = computeBaselineAnchors({
      baselineData: [],
      chartData,
      accounts: ACCOUNTS,
    });

    expect(anchors.totalBaselineBalance).toBe(250);
  });
});

describe('computeBaselineAnchors — unrealized P&L aggregation', () => {
  it('sums anchor uPnl and marks NULL-uPnl anchors as approximate', () => {
    const anchors = computeBaselineAnchors({
      baselineData: [
        {
          history: series(1, [
            {
              period: '2026-10-31T00:00:00Z',
              balance: '2000',
              upnl: '25',
              createdAt: '2026-10-31T00:00:10Z',
            },
          ]),
        },
      ],
      chartData: [
        {
          history: series(2, [
            {
              period: '2026-11-17T00:00:00Z',
              balance: '5000',
              upnl: null, // row predates the column
              createdAt: '2026-11-18T12:07:02Z',
            },
          ]),
        },
      ],
      accounts: ACCOUNTS,
    });

    expect(anchors.baselineUnrealizedPnl).toBe(25);
    expect(anchors.realizedPnlApproximate).toBe(true);
  });

  it('is not approximate when every anchor has a uPnl value', () => {
    const anchors = computeBaselineAnchors({
      baselineData: [
        {
          history: series(1, [
            {
              period: '2026-10-31T00:00:00Z',
              balance: '2000',
              upnl: '25',
              createdAt: '2026-10-31T00:00:10Z',
            },
          ]),
        },
      ],
      chartData: [
        {
          history: series(2, [
            {
              period: '2026-11-17T00:00:00Z',
              balance: '5000',
              upnl: '0',
              createdAt: '2026-11-18T12:07:02Z',
            },
          ]),
        },
      ],
      accounts: ACCOUNTS,
    });

    expect(anchors.baselineUnrealizedPnl).toBe(25);
    expect(anchors.realizedPnlApproximate).toBe(false);
  });
});

describe('computeBaselineAnchors — edge cases', () => {
  it('handles an empty account list', () => {
    const anchors = computeBaselineAnchors({
      baselineData: [],
      chartData: INCIDENT_CHART_DATA,
      accounts: [],
    });
    expect(anchors.totalBaselineBalance).toBe(0);
    expect(anchors.anchors.size).toBe(0);
  });

  it('anchors 0 for an account with no history anywhere', () => {
    const anchors = computeBaselineAnchors({
      baselineData: [],
      chartData: [],
      accounts: ACCOUNTS,
    });
    expect(anchors.totalBaselineBalance).toBe(0);
    expect(anchors.anchors.has(1)).toBe(false);
    expect(anchors.anchors.has(2)).toBe(false);
  });
});

describe('computeTransferStarts — per-exchange transfer windows', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  // Chart month starts here (calendar 1m).
  const windowStart = new Date('2026-11-01T00:00:00Z');

  it('mid-period bind: transfer start = max(anchor period, write time) — same-moment deposits still netted', () => {
    // Incident shape: OKX bound Nov 17. Bootstrap row covers period Nov 16
    // (the day before the bind) but was WRITTEN Nov 17 11:57.
    const anchors = computeBaselineAnchors({
      baselineData: [],
      chartData: [
        {
          history: series(1, [
            {
              period: '2026-11-16T00:00:00Z',
              balance: '2325.08',
              createdAt: '2026-11-17T11:57:00Z',
            },
          ]),
        },
      ],
      accounts: [{ id: 1, exchange: 'OKX' }],
    });

    const starts = computeTransferStarts({
      anchors: anchors.anchors,
      anchoredInBaselineWindow: anchors.anchoredInBaselineWindow,
      accounts: [{ id: 1, exchange: 'OKX' }],
      bucketIntervalMs: DAY_MS,
      windowStart,
    });

    // max(Nov-16 period, Nov-17 write) = Nov 17 11:57 — transfers BEFORE the
    // bind snapshot are already inside the anchor balance; the deposit at
    // exactly 11:57 must still be netted (route filters with <, not <=).
    expect(starts.get('okx')?.toISOString()).toBe('2026-11-17T11:57:00.000Z');
  });

  it('baseline-window anchor: seed row written after bucket end pushes transfer start to the write time', () => {
    // Account bound Nov 1 at 10:00 — its first row lands in the OCTOBER
    // baseline window (period Oct 31, day bucket ends Nov 1 00:00) but was
    // written at Nov 1 10:00, after the bucket ended.
    const anchors = computeBaselineAnchors({
      baselineData: [
        {
          history: series(1, [
            {
              period: '2026-10-31T00:00:00Z',
              balance: '1000',
              createdAt: '2026-11-01T10:00:00Z',
            },
          ]),
        },
      ],
      chartData: [],
      accounts: [{ id: 1, exchange: 'binance' }],
    });
    expect(anchors.anchoredInBaselineWindow.has(1)).toBe(true);

    const starts = computeTransferStarts({
      anchors: anchors.anchors,
      anchoredInBaselineWindow: anchors.anchoredInBaselineWindow,
      accounts: [{ id: 1, exchange: 'binance' }],
      bucketIntervalMs: DAY_MS,
      windowStart,
    });

    // bucket end Nov 1 00:00 < write time Nov 1 10:00 → the pre-bind deposit
    // at 09:00 is baked into the seed; netting must start at the write time.
    expect(starts.get('binance')?.toISOString()).toBe('2026-11-01T10:00:00.000Z');
  });

  it('baseline-window anchor with normal rows: transfer start stays at windowStart', () => {
    // Long-standing account, rows written inside their own bucket — transfers
    // of the whole current period count (default semantics).
    const anchors = computeBaselineAnchors({
      baselineData: [
        {
          history: series(1, [
            {
              period: '2026-10-31T00:00:00Z',
              balance: '2000',
              createdAt: '2026-10-31T00:10:00Z',
            },
          ]),
        },
      ],
      chartData: [],
      accounts: [{ id: 1, exchange: 'okx' }],
    });

    const starts = computeTransferStarts({
      anchors: anchors.anchors,
      anchoredInBaselineWindow: anchors.anchoredInBaselineWindow,
      accounts: [{ id: 1, exchange: 'okx' }],
      bucketIntervalMs: DAY_MS,
      windowStart,
    });

    expect(starts.get('okx')).toBe(windowStart);
  });

  it('keeps the earliest per exchange when two accounts share it', () => {
    const anchors = computeBaselineAnchors({
      baselineData: [],
      chartData: [
        {
          history: [
            ...series(1, [
              {
                period: '2026-11-18T00:00:00Z',
                balance: '100',
                createdAt: '2026-11-18T01:00:00Z',
              },
            ]),
            ...series(2, [
              {
                period: '2026-11-05T00:00:00Z',
                balance: '5000',
                createdAt: '2026-11-05T08:00:00Z',
              },
            ]),
          ],
        },
      ],
      accounts: [
        { id: 1, exchange: 'okx' },
        { id: 2, exchange: 'okx' },
      ],
    });

    const starts = computeTransferStarts({
      anchors: anchors.anchors,
      anchoredInBaselineWindow: anchors.anchoredInBaselineWindow,
      accounts: [
        { id: 1, exchange: 'okx' },
        { id: 2, exchange: 'okx' },
      ],
      bucketIntervalMs: DAY_MS,
      windowStart,
    });

    // Account 2 anchored earlier (Nov 5 08:00) wins over account 1 (Nov 18 01:00).
    expect(starts.get('okx')?.toISOString()).toBe('2026-11-05T08:00:00.000Z');
  });

  it('returns an empty map when no account has an anchor', () => {
    const starts = computeTransferStarts({
      anchors: new Map(),
      anchoredInBaselineWindow: new Set(),
      accounts: ACCOUNTS,
      bucketIntervalMs: DAY_MS,
      windowStart,
    });
    expect(starts.size).toBe(0);
  });
});
