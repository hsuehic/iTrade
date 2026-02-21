import { NextRequest, NextResponse } from 'next/server';
import {
  getImplementedStrategies,
  getStrategyConfig,
  getStrategyDefaultParameters,
} from '@itrade/strategies';

import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/strategies/config - Strategy type metadata for UI clients
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const implemented = getImplementedStrategies();
    const strategies = implemented.map((strategy) => {
      const config = getStrategyConfig(strategy.type);
      return {
        type: strategy.type,
        name: strategy.name,
        description: strategy.description,
        category: strategy.category,
        icon: strategy.icon,
        defaultParameters: getStrategyDefaultParameters(strategy.type),
        subscriptionRequirements: config?.subscriptionRequirements ?? null,
        initialDataRequirements: config?.initialDataRequirements ?? null,
      };
    });

    return NextResponse.json({ strategies });
  } catch (error) {
    console.error('Error fetching strategy config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch strategy config' },
      { status: 500 },
    );
  }
}
