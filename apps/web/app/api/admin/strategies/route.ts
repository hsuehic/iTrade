import { NextRequest, NextResponse } from 'next/server';
import { StrategyStatus } from '@itrade/data-manager';

import { getSession } from '@/lib/auth';
import { getDataManager } from '@/lib/data-manager';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Parse an integer query param and clamp it. `Number.parseInt` is not used
 * because it accepts "12.5" (→ 12) and "50abc" (→ 50); a non-integer reaching
 * the query builder as `LIMIT 12.5` is a Postgres syntax error (500).
 */
function clampInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  // `Number(null)` and `Number('')` are 0 — both are integers, so they must be
  // handled before the numeric check or the fallback never applies.
  if (raw === null || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

function isAdminSession(session: Awaited<ReturnType<typeof getSession>>): boolean {
  if (!session?.user) return false;
  const role = (session.user as { role?: string | null }).role;
  return role === 'admin';
}

const SORT_KEYS = [
  'name',
  'createdAt',
  'updatedAt',
  'status',
  'symbol',
  'exchange',
  'totalPnL',
  'roi',
  'totalOrders',
] as const;

type SortKey = (typeof SORT_KEYS)[number];

/**
 * GET /api/admin/strategies — admin-only. Cross-user strategy listing for the
 * admin Strategy Management page.
 *
 * Query params:
 * - search         free-text keyword (name / description / symbol / type)
 * - symbol         token filter (e.g. "BTC")
 * - userId         owner filter
 * - status         active | stopped | paused | error
 * - exchange       exchange filter
 * - type           strategy class name (exact)
 * - sortBy         name | createdAt | updatedAt | status | symbol | exchange |
 *                  totalPnL | roi | totalOrders   (default: createdAt)
 * - sortDirection  asc | desc                       (default: desc)
 * - page           1-based (default 1)
 * - pageSize       default 50, max 200
 *
 * ROI/PnL come from the `strategy_performance` table (joined), not a live
 * order replay — see the plan doc for the A/B rationale.
 */
export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!isAdminSession(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);

    const sortByParam = searchParams.get('sortBy');
    const sortBy = (SORT_KEYS as readonly string[]).includes(sortByParam ?? '')
      ? (sortByParam as SortKey)
      : undefined;

    const page = clampInt(searchParams.get('page'), 1, 1, Number.MAX_SAFE_INTEGER);
    const pageSize = clampInt(searchParams.get('pageSize'), 50, 1, 200);

    // Validate the status filter against the enum: an unknown value would
    // otherwise reach the query as an invalid Postgres enum input (500). A typo
    // like `status=erorr` is rejected loudly rather than silently returning the
    // unfiltered list, which reads as "no error strategies exist".
    const statusParam = searchParams.get('status')?.trim();
    if (
      statusParam &&
      !Object.values(StrategyStatus).includes(statusParam as StrategyStatus)
    ) {
      return NextResponse.json(
        { error: `status must be one of: ${Object.values(StrategyStatus).join(', ')}` },
        { status: 400 },
      );
    }
    const status = statusParam as StrategyStatus | undefined;

    const dm = await getDataManager();
    const { strategies, total } = await dm.getStrategiesAdmin({
      search: searchParams.get('search')?.trim() || undefined,
      symbol: searchParams.get('symbol')?.trim() || undefined,
      userId: searchParams.get('userId')?.trim() || undefined,
      status,
      exchange: searchParams.get('exchange')?.trim() || undefined,
      type: searchParams.get('type')?.trim() || undefined,
      sortBy,
      sortDirection: searchParams.get('sortDirection') === 'asc' ? 'asc' : 'desc',
      page,
      pageSize,
    });

    return NextResponse.json({
      strategies,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('[Admin Strategies] Failed to list strategies:', error);
    return NextResponse.json({ error: 'Failed to list strategies' }, { status: 500 });
  }
}
