'use server';

import { NextResponse } from 'next/server';

import { getDataManager } from '@/lib/data-manager';
import { getSession } from '@/lib/auth';
import { STABLECOINS, computeLiveBalances } from '@/lib/live-balance';

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
    const exchangeFilter = (searchParams.get('exchange') || 'all').trim().toLowerCase();
    const requestedMinValue = parseFloat(searchParams.get('minValue') || '0');
    const minValue = Math.max(
      Number.isNaN(requestedMinValue) ? 0 : requestedMinValue,
      0.01,
    );

    const dm = await getDataManager();

    // Optimized: Get latest state from AccountInfo and Balance entities
    const accounts = await dm.getUserAccountsWithBalances(session.user.id);
    const accountsToProcess =
      exchangeFilter === 'all'
        ? accounts
        : accounts.filter((account) => account.exchange.toLowerCase() === exchangeFilter);

    if (accountsToProcess.length === 0) {
      return NextResponse.json({
        summary: { totalAssets: 0, uniqueAssets: 0, totalValue: 0, exchanges: [] },
        assets: [],
        assetsByExchange: {},
        aggregatedAssets: [],
        timestamp: new Date(),
      });
    }

    // Fetch balances for all accounts in one query
    const accountIds = accountsToProcess.map((account) => account.id);
    const balances = await dm.getBalancesForAccounts(accountIds);

    // Map balances back to their account
    const balancesByAccountId = new Map<number, typeof balances>();
    for (const balance of balances) {
      const existing = balancesByAccountId.get(balance.accountInfoId) ?? [];
      existing.push(balance);
      balancesByAccountId.set(balance.accountInfoId, existing);
    }

    // Build flat asset list and aggregated map
    const allAssets: AssetData[] = [];
    const assetsByExchange: Record<string, AssetData[]> = {};
    const aggregatedAssetsMap = new Map<
      string,
      { asset: string; free: number; locked: number; total: number }
    >();
    const exchanges: string[] = [];

    for (const account of accountsToProcess) {
      const accountBalances = balancesByAccountId.get(account.id) ?? [];
      const exchange = account.exchange;

      if (!exchanges.includes(exchange)) exchanges.push(exchange);
      assetsByExchange[exchange] = [];

      for (const balance of accountBalances) {
        const free = parseFloat(balance.free.toString());
        const locked = parseFloat(balance.locked.toString());
        const total = parseFloat(balance.total.toString());

        const assetData: AssetData = {
          asset: balance.asset,
          exchange,
          free,
          locked,
          total,
          percentage: 0,
        };
        allAssets.push(assetData);
        assetsByExchange[exchange].push(assetData);

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

    // Compute live USD values using the shared utility
    const liveResult = await computeLiveBalances(
      allAssets.map(({ asset, exchange, total }) => ({ asset, exchange, total })),
      minValue,
    );

    const { totalValue, priceByExchangeAsset, priceByAsset } = liveResult;

    // Annotate asset entries with estimatedValue and filter by minValue
    const filteredAssets: AssetData[] = [];
    const filteredAssetsByExchange: Record<string, AssetData[]> = {};

    for (const assetData of allAssets) {
      const assetUpper = assetData.asset.toUpperCase();
      let estimatedValue: number | undefined;
      if (STABLECOINS.has(assetUpper)) {
        estimatedValue = assetData.total;
      } else {
        const price = priceByExchangeAsset.get(
          `${assetData.exchange.toLowerCase()}:${assetUpper}`,
        );
        if (price !== undefined) estimatedValue = assetData.total * price;
      }

      assetData.estimatedValue = estimatedValue;

      if ((estimatedValue ?? 0) < minValue) continue;

      filteredAssets.push(assetData);
      if (!filteredAssetsByExchange[assetData.exchange]) {
        filteredAssetsByExchange[assetData.exchange] = [];
      }
      filteredAssetsByExchange[assetData.exchange].push(assetData);
    }

    // Calculate percentages
    if (totalValue > 0) {
      for (const asset of filteredAssets) {
        asset.percentage = ((asset.estimatedValue ?? 0) / totalValue) * 100;
      }
    }

    // Build aggregated asset list with estimated values
    const aggregatedAssets = Array.from(aggregatedAssetsMap.values())
      .map((item) => {
        const assetUpper = item.asset.toUpperCase();
        let estimatedValue: number | undefined;
        if (STABLECOINS.has(assetUpper)) {
          estimatedValue = item.total;
        } else {
          const price = priceByAsset.get(assetUpper);
          if (price !== undefined) estimatedValue = item.total * price;
        }
        return {
          ...item,
          estimatedValue,
          percentage: totalValue > 0 ? ((estimatedValue ?? 0) / totalValue) * 100 : 0,
        };
      })
      .filter((item) => (item.estimatedValue ?? 0) >= minValue)
      .sort((a, b) => (b.estimatedValue ?? b.total) - (a.estimatedValue ?? a.total));

    filteredAssets.sort(
      (a, b) => (b.estimatedValue ?? b.total) - (a.estimatedValue ?? a.total),
    );

    const uniqueAssets = new Set(filteredAssets.map((a) => a.asset)).size;

    return NextResponse.json({
      summary: {
        totalAssets: filteredAssets.length,
        uniqueAssets,
        totalValue,
        exchanges,
      },
      assets: filteredAssets,
      assetsByExchange: filteredAssetsByExchange,
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
