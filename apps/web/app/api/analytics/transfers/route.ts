import { NextResponse } from 'next/server';

import { getDataManager } from '@/lib/data-manager';
import { getSession } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const session = await getSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const exchange = searchParams.get('exchange') || 'all';

    // Parse time window
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');

    let startTime: Date | undefined;
    let endTime: Date | undefined;

    if (startDateParam) {
      startTime = new Date(startDateParam);
      startTime.setUTCHours(0, 0, 0, 0);
    }

    if (endDateParam) {
      endTime = new Date(endDateParam);
      endTime.setUTCHours(23, 59, 59, 999);
    }

    const dm = await getDataManager();

    if (!dm.getTransfers) {
      return NextResponse.json({ transfers: [] });
    }

    let transfers = await dm.getTransfers(userId, startTime, endTime);

    if (exchange !== 'all') {
      transfers = transfers.filter(
        (t) => t.exchange?.toLowerCase() === exchange.toLowerCase(),
      );
    }

    return NextResponse.json({ transfers });
  } catch (error) {
    console.error('Failed to get transfers:', error);
    return NextResponse.json({ error: 'Failed to fetch transfers' }, { status: 500 });
  }
}
