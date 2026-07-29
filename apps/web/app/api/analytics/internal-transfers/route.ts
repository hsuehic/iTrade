import { NextResponse } from 'next/server';

import { getDataManager } from '@/lib/data-manager';
import { getSession } from '@/lib/auth';

/**
 * GET /api/analytics/internal-transfers
 *
 * Same-exchange wallet-to-wallet transfers (Funding <-> Spot/Perpetual/
 * Trading), initiated from the Accounts page's Transfer dialog. Stored in a
 * dedicated `internal_transfers` table — deliberately separate from
 * /api/analytics/transfers (deposits/withdrawals), which PnL and balance
 * calculations read as external cash flow. Internal transfers move no money
 * in or out of the exchange and must never be mixed into that table/query.
 *
 * Query params (all optional):
 *   - exchange:   single exchange name, or "all" / omitted
 *   - startDate:  ISO date (inclusive, UTC midnight)
 *   - endDate:    ISO date (inclusive, end-of-day UTC)
 *   - status:     COMPLETED | PENDING | FAILED | CANCELED
 *   - keyword:    case-insensitive substring; matches asset / exchange / provider tx id
 *   - minAmount:  numeric
 *   - maxAmount:  numeric
 *
 * Returns: { transfers: InternalTransfer[] }
 */
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

    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');

    let startTime: Date | undefined;
    let endTime: Date | undefined;

    if (startDateParam) {
      startTime = new Date(startDateParam);
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

    const rawStatus = (searchParams.get('status') || '').toUpperCase();
    const status = ALLOWED_STATUSES.has(rawStatus) ? rawStatus : undefined;
    const keyword = (searchParams.get('keyword') || '').trim() || undefined;
    const minAmount = parseFiniteNumber(searchParams.get('minAmount'));
    const maxAmount = parseFiniteNumber(searchParams.get('maxAmount'));

    const dm = await getDataManager();

    if (!dm.getInternalTransfers) {
      return NextResponse.json({ transfers: [] });
    }

    const transfers = await dm.getInternalTransfers(userId, startTime, endTime, {
      exchange,
      status,
      keyword,
      minAmount,
      maxAmount,
    });

    return NextResponse.json({ transfers });
  } catch (error) {
    console.error('Failed to get internal transfers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch internal transfers' },
      { status: 500 },
    );
  }
}
