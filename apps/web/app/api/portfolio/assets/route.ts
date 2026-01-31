'use server';

import { NextResponse } from 'next/server';

import { getDataManager } from '@/lib/data-manager';
import { getSession } from '@/lib/auth';

export interface AssetData {
  asset: string;
  exchange: string;
  free: number;
  locked: number;
  total: number;
  percentage: number;
  estimatedValue?: number;
}

export interface AssetsSummary {
  totalAssets: number;
  uniqueAssets: number;
  totalValue: number;
  exchanges: string[];
}

/**
 * GET /api/portfolio/assets - Get detailed asset breakdown
 *
 * Query params:
 * - exchange?: string - Exchange name filter
 * - minValue?: number - Minimum total value filter
 */
export async function GET(request: Request) {
  try {
    const session = await getSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const exchangeFilter = searchParams.get('exchange') || 'all';
    const minValue = parseFloat(searchParams.get('minValue') || '0');

    const dm = await getDataManager();
    const snapshotRepo = dm.getAccountSnapshotRepository();

    // Get latest snapshots for all exchanges
    const latestSnapshots = await snapshotRepo.getLatestForAllExchanges(session.user.id);

    if (latestSnapshots.length === 0) {
      return NextResponse.json({
        summary: {
          totalAssets: 0,
          uniqueAssets: 0,
          totalValue: 0,
          exchanges: [],
        },
        assets: [],
        assetsByExchange: {},
        aggregatedAssets: [],
        timestamp: new Date(),
      });
    }

    // Process assets from all exchanges
    const allAssets: AssetData[] = [];
    const assetsByExchange: Record<string, AssetData[]> = {};
    const aggregatedAssetsMap = new Map<
      string,
      { asset: string; free: number; locked: number; total: number }
    >();

    let totalValue = 0;
    const exchanges: string[] = [];

    for (const snapshot of latestSnapshots) {
      // Skip if filtering by exchange and doesn't match
      if (exchangeFilter !== 'all' && snapshot.exchange !== exchangeFilter) {
        continue;
      }

      if (!exchanges.includes(snapshot.exchange)) {
        exchanges.push(snapshot.exchange);
      }

      assetsByExchange[snapshot.exchange] = [];

      for (const balance of snapshot.balances) {
        const free = parseFloat(balance.free.toString());
        const locked = parseFloat(balance.locked.toString());
        const total = parseFloat(balance.total.toString());

        // Skip assets below minimum value threshold
        if (total < minValue) continue;

        totalValue += total;

        const assetData: AssetData = {
          asset: balance.asset,
          exchange: snapshot.exchange,
          free,
          locked,
          total,
          percentage: 0, // Will calculate after total is known
        };

        allAssets.push(assetData);
        assetsByExchange[snapshot.exchange].push(assetData);

        // Aggregate by asset
        const existing = aggregatedAssetsMap.get(balance.asset);
        if (existing) {
          existing.free += free;
          existing.locked += locked;
          existing.total += total;
        } else {
          aggregatedAssetsMap.set(balance.asset, {
            asset: balance.asset,
            free,
            locked,
            total,
          });
        }
      }
    }

    // Calculate percentages
    if (totalValue > 0) {
      for (const asset of allAssets) {
        asset.percentage = (asset.total / totalValue) * 100;
      }
    }

    // Convert aggregated map to array with percentages
    const aggregatedAssets = Array.from(aggregatedAssetsMap.values())
      .map((item) => ({
        ...item,
        percentage: totalValue > 0 ? (item.total / totalValue) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    // Sort all assets by total value descending
    allAssets.sort((a, b) => b.total - a.total);

    // Get unique asset count
    const uniqueAssets = new Set(allAssets.map((a) => a.asset)).size;

    return NextResponse.json({
      summary: {
        totalAssets: allAssets.length,
        uniqueAssets,
        totalValue,
        exchanges,
      },
      assets: allAssets,
      assetsByExchange,
      aggregatedAssets,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Portfolio assets error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch portfolio assets' },
      { status: 500 },
    );
  }
}
