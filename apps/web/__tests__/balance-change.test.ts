/**
 * Unit tests for balance-change calculation in /api/analytics/account
 *
 * Covers:
 *  1. Calendar-aligned startTime (1d → midnight, 1w → Monday, 1m → 1st, 1y → Jan 1)
 *  2. Rolling-window startTime (unchanged relative logic)
 *  3. calculateChange (both modes)
 *  4. Rolling baseline: first non-zero in chartDataArray
 *  5. Calendar baseline: last non-zero in previous-period data
 */

import { describe, it, expect } from 'vitest';

// ─── Mirror the logic from route.ts ──────────────────────────────────────────

type ChartDataPoint = { date: string; [exchange: string]: string | number };

function computeDateRange(
  now: Date,
  period: string,
  align: 'calendar' | 'rolling',
): {
  startTime: Date;
  baselineStartTime: Date;
  baselineEndTime: Date;
} {
  const startTime = new Date(now);
  let baselineStartTime = new Date(now);
  let baselineEndTime = new Date(now);

  if (align === 'rolling') {
    switch (period) {
      case '1h':
        startTime.setHours(startTime.getHours() - 1);
        break;
      case '1d':
        startTime.setDate(startTime.getDate() - 1);
        break;
      case '7d':
      case '1w':
        startTime.setDate(startTime.getDate() - 7);
        break;
      case '1m':
        startTime.setMonth(startTime.getMonth() - 1);
        break;
      case '1y':
        startTime.setFullYear(startTime.getFullYear() - 1);
        break;
    }
  } else {
    switch (period) {
      case '1h':
        startTime.setMinutes(0, 0, 0);
        baselineEndTime = new Date(startTime);
        baselineStartTime = new Date(startTime);
        baselineStartTime.setHours(baselineStartTime.getHours() - 1);
        break;
      case '1d':
        startTime.setHours(0, 0, 0, 0);
        baselineEndTime = new Date(startTime);
        baselineStartTime = new Date(startTime);
        baselineStartTime.setDate(baselineStartTime.getDate() - 1);
        break;
      case '7d':
      case '1w': {
        startTime.setHours(0, 0, 0, 0);
        const dow = startTime.getDay();
        startTime.setDate(startTime.getDate() + (dow === 0 ? -6 : 1 - dow));
        baselineEndTime = new Date(startTime);
        baselineStartTime = new Date(startTime);
        baselineStartTime.setDate(baselineStartTime.getDate() - 7);
        break;
      }
      case '1m':
        startTime.setDate(1);
        startTime.setHours(0, 0, 0, 0);
        baselineEndTime = new Date(startTime);
        baselineStartTime = new Date(startTime);
        baselineStartTime.setMonth(baselineStartTime.getMonth() - 1);
        break;
      case '1y':
        startTime.setMonth(0, 1);
        startTime.setHours(0, 0, 0, 0);
        baselineEndTime = new Date(startTime);
        baselineStartTime = new Date(startTime);
        baselineStartTime.setFullYear(baselineStartTime.getFullYear() - 1);
        break;
    }
  }

  return { startTime, baselineStartTime, baselineEndTime };
}

function calculateChange(current: number, baseline: number): number {
  if (baseline === 0) return 0;
  return ((current - baseline) / baseline) * 100;
}

function rollingBaseline(chartDataArray: ChartDataPoint[]): number {
  for (const point of chartDataArray) {
    const total = Object.values(point)
      .filter((v) => typeof v === 'number' && !isNaN(v))
      .reduce((sum: number, v) => sum + (v as number), 0);
    if (total > 0) return total;
  }
  return 0;
}

function calendarBaseline(history: { balance: string | number }[]): number {
  for (let i = history.length - 1; i >= 0; i--) {
    const bal = parseFloat(history[i].balance.toString());
    if (bal > 0) return bal;
  }
  return 0;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Calendar-aligned startTime', () => {
  // Pin "now" to a known Wednesday at 14:37:22 in April 2026
  // 2026-04-22 is a Wednesday
  const NOW = new Date('2026-04-22T14:37:22.000Z');

  it('1d → start of today (local midnight)', () => {
    const { startTime } = computeDateRange(new Date(NOW), '1d', 'calendar');
    // setHours(0,0,0,0) snaps to local midnight — verify in local time
    expect(startTime.getHours()).toBe(0);
    expect(startTime.getMinutes()).toBe(0);
    expect(startTime.getSeconds()).toBe(0);
    // Date and month are the same calendar day as NOW in local time
    const nowLocal = new Date(NOW);
    expect(startTime.getFullYear()).toBe(nowLocal.getFullYear());
    expect(startTime.getMonth()).toBe(nowLocal.getMonth());
    expect(startTime.getDate()).toBe(nowLocal.getDate());
  });

  it('1w → start of current ISO week (Monday)', () => {
    const { startTime } = computeDateRange(new Date(NOW), '1w', 'calendar');
    // 2026-04-20 is Monday (day before Wednesday Apr 22)
    expect(startTime.getUTCFullYear()).toBe(2026);
    expect(startTime.getUTCMonth()).toBe(3);
    // day is local but hours should be 0
    expect(startTime.getHours()).toBe(0);
    expect(startTime.getMinutes()).toBe(0);
    // day-of-week must be Monday
    expect(startTime.getDay()).toBe(1);
  });

  it('1m → first day of current month', () => {
    const { startTime } = computeDateRange(new Date(NOW), '1m', 'calendar');
    expect(startTime.getDate()).toBe(1);
    expect(startTime.getHours()).toBe(0);
    expect(startTime.getMonth()).toBe(new Date(NOW).getMonth()); // same month
  });

  it('1y → Jan 1 of current year', () => {
    const { startTime } = computeDateRange(new Date(NOW), '1y', 'calendar');
    expect(startTime.getMonth()).toBe(0); // January
    expect(startTime.getDate()).toBe(1);
    expect(startTime.getHours()).toBe(0);
    expect(startTime.getFullYear()).toBe(2026);
  });

  it('1h → start of current hour', () => {
    const { startTime } = computeDateRange(new Date(NOW), '1h', 'calendar');
    expect(startTime.getMinutes()).toBe(0);
    expect(startTime.getSeconds()).toBe(0);
  });
});

describe('Calendar baseline window (previous period)', () => {
  const NOW = new Date('2026-04-22T14:37:22.000Z');

  it('1d baseline covers yesterday', () => {
    const { baselineStartTime, baselineEndTime } = computeDateRange(
      new Date(NOW),
      '1d',
      'calendar',
    );
    // baselineEndTime == midnight today
    expect(baselineEndTime.getHours()).toBe(0);
    expect(baselineEndTime.getDate()).toBe(22);
    // baselineStartTime == midnight yesterday
    expect(baselineStartTime.getDate()).toBe(21);
    expect(baselineStartTime.getHours()).toBe(0);
  });

  it('1m baseline covers previous month', () => {
    const { baselineStartTime, baselineEndTime } = computeDateRange(
      new Date(NOW),
      '1m',
      'calendar',
    );
    // end = Apr 1
    expect(baselineEndTime.getDate()).toBe(1);
    expect(baselineEndTime.getMonth()).toBe(3); // April
    // start = Mar 1
    expect(baselineStartTime.getDate()).toBe(1);
    expect(baselineStartTime.getMonth()).toBe(2); // March
  });

  it('1y baseline covers previous year', () => {
    const { baselineStartTime, baselineEndTime } = computeDateRange(
      new Date(NOW),
      '1y',
      'calendar',
    );
    expect(baselineEndTime.getMonth()).toBe(0);
    expect(baselineEndTime.getDate()).toBe(1);
    expect(baselineEndTime.getFullYear()).toBe(2026); // Jan 1 2026
    expect(baselineStartTime.getFullYear()).toBe(2025); // Jan 1 2025
  });
});

describe('Rolling-window startTime', () => {
  const NOW = new Date('2026-04-22T14:37:22.000Z');

  it('1d → exactly 24 hours before now', () => {
    const { startTime } = computeDateRange(new Date(NOW), '1d', 'rolling');
    const diffMs = NOW.getTime() - startTime.getTime();
    expect(diffMs).toBe(24 * 60 * 60 * 1000);
  });

  it('1w → exactly 7 days before now', () => {
    const { startTime } = computeDateRange(new Date(NOW), '1w', 'rolling');
    const diffMs = NOW.getTime() - startTime.getTime();
    expect(diffMs).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('calculateChange', () => {
  it('returns 0 when baseline is 0', () => {
    expect(calculateChange(1000, 0)).toBe(0);
  });

  it('returns correct positive percentage', () => {
    expect(calculateChange(1100, 1000)).toBeCloseTo(10, 5);
  });

  it('returns correct negative percentage', () => {
    expect(calculateChange(900, 1000)).toBeCloseTo(-10, 5);
  });

  it('returns 0 when current equals baseline', () => {
    expect(calculateChange(1000, 1000)).toBe(0);
  });
});

describe('Rolling baseline: first non-zero in chartDataArray', () => {
  it('picks the first snapshot with a non-zero total', () => {
    const data: ChartDataPoint[] = [
      { date: '2026-04-21T00:00:00Z', binance: 0 },
      { date: '2026-04-21T01:00:00Z', binance: 0 },
      { date: '2026-04-21T02:00:00Z', binance: 500 },
      { date: '2026-04-22T14:00:00Z', binance: 520 },
    ];
    expect(rollingBaseline(data)).toBe(500);
  });

  it('returns 0 when all snapshots are zero', () => {
    const data: ChartDataPoint[] = [{ date: '2026-04-21T00:00:00Z', binance: 0 }];
    expect(rollingBaseline(data)).toBe(0);
  });

  it('sums multiple exchanges', () => {
    const data: ChartDataPoint[] = [
      { date: '2026-04-21T00:00:00Z', binance: 0, okx: 0 },
      { date: '2026-04-21T06:00:00Z', binance: 300, okx: 200 },
    ];
    expect(rollingBaseline(data)).toBe(500);
  });
});

describe('Calendar baseline: last non-zero in previous-period history', () => {
  it('picks the last non-zero entry', () => {
    const history = [
      { balance: '1000' },
      { balance: '1050' },
      { balance: '0' }, // trailing zero should be skipped
    ];
    expect(calendarBaseline(history)).toBe(1050);
  });

  it('returns 0 when all are zero', () => {
    expect(calendarBaseline([{ balance: '0' }, { balance: '0' }])).toBe(0);
  });

  it('returns 0 for empty history', () => {
    expect(calendarBaseline([])).toBe(0);
  });

  it('handles numeric balance values', () => {
    const history = [{ balance: 800 }, { balance: 950 }];
    expect(calendarBaseline(history)).toBe(950);
  });
});

describe('End-to-end: calendar month change scenario', () => {
  // Scenario: balance was 10,000 at end of March, now it's 10,500
  // → expected change = +5%
  it('computes +5% for 500 gain vs 10,000 baseline', () => {
    const previousPeriodHistory = [
      { balance: '9800' },
      { balance: '10000' }, // last non-zero in March
      { balance: '0' }, // trailing empty bucket
    ];
    const baseline = calendarBaseline(previousPeriodHistory);
    const change = calculateChange(10500, baseline);
    expect(baseline).toBe(10000);
    expect(change).toBeCloseTo(5, 5);
  });
});

describe('End-to-end: rolling 24h change scenario', () => {
  // Scenario: first snapshot 24h ago was 8,000; current is 8,400 → +5%
  it('computes +5% for 400 gain vs 8,000 rolling baseline', () => {
    const chartData: ChartDataPoint[] = [
      { date: '2026-04-21T14:37:00Z', binance: 8000 }, // first non-zero 24h ago
      { date: '2026-04-22T08:00:00Z', binance: 8200 },
      { date: '2026-04-22T14:37:00Z', binance: 8400 }, // current
    ];
    const baseline = rollingBaseline(chartData);
    const change = calculateChange(8400, baseline);
    expect(baseline).toBe(8000);
    expect(change).toBeCloseTo(5, 5);
  });
});
