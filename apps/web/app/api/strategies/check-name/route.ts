import { NextRequest, NextResponse } from 'next/server';

import { getDataManager } from '@/lib/data-manager';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/strategies/check-name?name=xxx&excludeId=123
// Check if a strategy name is available (not used by another strategy)
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');
    const excludeId = searchParams.get('excludeId'); // For edit mode, exclude current strategy

    if (!name) {
      return NextResponse.json({ error: 'Name parameter is required' }, { status: 400 });
    }

    const dataManager = await getDataManager();

    // Get all strategies for the user
    const strategies = await dataManager.getStrategies({
      userId: session.user.id,
    });

    // Check if name exists (case-insensitive)
    const nameExists = strategies.some((strategy) => {
      // Exclude current strategy when editing
      if (excludeId && strategy.id === parseInt(excludeId, 10)) {
        return false;
      }
      return strategy.name.toLowerCase() === name.toLowerCase();
    });

    return NextResponse.json({
      available: !nameExists,
      message: nameExists ? 'Strategy name already exists' : 'Strategy name is available',
    });
  } catch (error) {
    console.error('Error checking strategy name:', error);
    return NextResponse.json({ error: 'Failed to check strategy name' }, { status: 500 });
  }
}
