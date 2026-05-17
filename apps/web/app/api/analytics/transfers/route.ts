import { NextResponse } from 'next/server';

import { getDataManager } from '@/lib/data-manager';
import { getSession } from '@/lib/auth';

/**
 * GET /api/analytics/transfers
 *
 * Query params (all optional):
 *   - exchange:   single exchange name, or "all" / omitted
 *   - startDate:  ISO date (inclusive, UTC midnight)
 *   - endDate:    ISO date (inclusive, end-of-day UTC)
 *   - direction:  DEPOSIT | WITHDRAW
 *   - status:     COMPLETED | PENDING | FAILED | CANCELED
 *   - keyword:    case-insensitive substring; matches asset / exchange / network / txId
 *   - minAmount:  numeric
 *   - maxAmount:  numeric
 *
 * Returns: { transfers: Transfer[], summary: { totalCount, perAsset[] } }
 */
const ALLOWED_DIRECTIONS = new Set(['DEPOSIT', 'WITHDRAW']);
const ALLOWED_STATUSES = new Set(['COMPLETED', 'PENDING', 'FAILED', 'CANCELED']);

function parseFiniteNumber(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET(request: Request) {
  try {
    const session = await getSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const exchange = searchParams.get('exchange') || 'all';

    // Time window
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');

    let startTime: Date | undefined;
    let endTime: Date | undefined;

    if (startDateParam) {
      startTime = new Date(startDateParam);
      // Only force UTC-midnight when the caller passed a plain "YYYY-MM-DD"
      // (no time component); otherwise honor the ISO timestamp as-is so the
      // client can send a precise start (e.g. "now − 7 days").
      if (!/T/.test(startDateParam)) {
        startTime.setUTCHours(0, 0, 0, 0);
      }
    }
    if (endDateParam) {
      endTime = new Date(endDateParam);
      if (!/T/.test(endDateParam)) {
        endTime.setUTCHours(23, 59, 59, 999);
      }
    }

    const rawDirection = (searchParams.get('direction') || '').toUpperCase();
    const rawStatus = (searchParams.get('status') || '').toUpperCase();
    const direction = ALLOWED_DIRECTIONS.has(rawDirection)
      ? (rawDirection as 'DEPOSIT' | 'WITHDRAW')
      : undefined;
    const status = ALLOWED_STATUSES.has(rawStatus)
      ? (rawStatus as 'COMPLETED' | 'PENDING' | 'FAILED' | 'CANCELED')
      : undefined;

    const keyword = (searchParams.get('keyword') || '').trim() || undefined;
    const minAmount = parseFiniteNumber(searchParams.get('minAmount'));
    const maxAmount = parseFiniteNumber(searchParams.get('maxAmount'));

    const filters = {
      exchange,
      direction,
      status,
      keyword,
      minAmount,
      maxAmount,
    };

    const dm = await getDataManager();

    if (!dm.getTransfers) {
      return NextResponse.json({
        transfers: [],
        summary: { totalCount: 0, perAsset: [] },
      });
    }

    // Some installs of @itrade/data-manager may not expose getTransfersSummary
    // (e.g. if the dist is from an older build). Fall back to client-side
    // aggregation in that case rather than 500ing.
    const dmAny = dm as any;

    const [transfers, summary] = await Promise.all([
      dmAny.getTransfers(userId, startTime, endTime, filters),
      dmAny.getTransfersSummary
        ? dmAny.getTransfersSummary(userId, startTime, endTime, filters)
        : Promise.resolve(undefined),
    ]);

    return NextResponse.json({
      transfers,
      summary: summary ?? computeSummaryFallback(transfers),
    });
  } catch (error) {
    console.error('Failed to get transfers:', error);
    return NextResponse.json({ error: 'Failed to fetch transfers' }, { status: 500 });
  }
}

/** Fallback aggregation when the data-manager doesn't yet expose a summary helper. */
function computeSummaryFallback(
  transfers: Array<{ asset: string; type: string; status: string; amount: unknown }>,
): {
  totalCount: number;
  perAsset: Array<{ asset: string; deposit: string; withdrawal: string; net: string }>;
} {
  const byAsset = new Map<string, { deposit: number; withdrawal: number }>();
  for (const t of transfers) {
    if (t.status !== 'COMPLETED') continue;
    const asset = (t.asset || '').toUpperCase();
    const slot = byAsset.get(asset) ?? { deposit: 0, withdrawal: 0 };
    const amt = Number((t.amount as { toString: () => string }).toString());
    if (!Number.isFinite(amt)) continue;
    if (t.type === 'DEPOSIT') slot.deposit += amt;
    else if (t.type === 'WITHDRAW') slot.withdrawal += amt;
    byAsset.set(asset, slot);
  }

  const perAsset = Array.from(byAsset.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([asset, { deposit, withdrawal }]) => ({
      asset,
      deposit: deposit.toString(),
      withdrawal: withdrawal.toString(),
      net: (deposit - withdrawal).toString(),
    }));

  return { totalCount: transfers.length, perAsset };
}
