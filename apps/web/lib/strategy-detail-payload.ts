import type { TypeOrmDataManager } from '@itrade/data-manager';

import { getCurrentPrice } from '@/lib/live-balance';

/**
 * Shared builder for the "live" part of a strategy detail payload.
 *
 * Both the owner-facing (`GET /api/strategies/[id]`) and the admin-facing
 * (`GET /api/admin/strategies/[id]`) routes must return the SAME shape so the
 * `/strategy/[id]` page renders identically for the two audiences — the page
 * only swaps the API base. Keeping the computation here means neither route
 * can drift from the other (the admin route previously returned the raw
 * strategy only, which silently rendered an empty detail page).
 *
 * "Live" means: performance is always rebuilt by replaying the order history
 * (never a cached/stale `strategy_performance` row) and the unrealized PnL
 * uses a real-time market price so an open position is not shown as flat.
 */

export interface StrategyPositionSummaryPayload {
  netExecutedPosition: string;
  pendingBuySize: string;
  pendingSellSize: string;
  totalBoughtSize: string;
  totalSoldSize: string;
}

export interface StrategyLiveDetail {
  rebuiltPerformance: unknown | null;
  positionSummary: StrategyPositionSummaryPayload | null;
}

/** The minimum strategy shape needed to compute the live detail. */
export interface StrategyLiveDetailSource {
  id: number;
  name: string;
  symbol?: string | null;
  exchange?: string | null;
  marketType?: string | null;
}

type DataManagerWithLiveDetail = TypeOrmDataManager & {
  rebuildStrategyPerformance?: (
    strategyId: number,
    symbol: string,
    exchange: string,
    strategyName?: string,
    currentPrice?: number,
  ) => Promise<unknown>;
  getStrategyPositionSummary?: (
    strategyId: number,
    symbol: string,
  ) => Promise<{
    netExecutedPosition: { toString(): string };
    pendingBuySize: { toString(): string };
    pendingSellSize: { toString(): string };
    totalBoughtSize: { toString(): string };
    totalSoldSize: { toString(): string };
  }>;
};

export async function buildStrategyLiveDetail(
  dataManager: TypeOrmDataManager,
  strategy: StrategyLiveDetailSource,
): Promise<StrategyLiveDetail> {
  const dm = dataManager as DataManagerWithLiveDetail;

  // Always compute performance live by replaying orders — no cached/stale
  // performance row is trusted, so display always reflects the actual order
  // history (see also: strategyId fill-routing fix that made cached rows
  // untrustworthy for any strategy that predates it).
  let rebuiltPerformance: unknown | null = null;
  if (strategy.symbol && strategy.exchange) {
    try {
      if (dm.rebuildStrategyPerformance) {
        // Fetch a real-time market price so open positions get a live
        // unrealized PnL instead of always showing 0.
        // Pass marketType so perpetual strategies use the futures price
        // (fapi) instead of the spot price — they can differ materially.
        const currentPrice = await getCurrentPrice(
          strategy.symbol,
          strategy.exchange,
          strategy.marketType ?? undefined,
        ).catch(() => null);

        rebuiltPerformance = await dm.rebuildStrategyPerformance(
          strategy.id,
          strategy.symbol,
          strategy.exchange,
          strategy.name,
          currentPrice ?? undefined,
        );
      }
    } catch (e) {
      console.warn(`Failed to rebuild performance for strategy ${strategy.id}`, e);
    }
  }

  // Calculate position summary: executed net position + pending buy/sell sizes + total bought/sold
  let positionSummary: StrategyPositionSummaryPayload | null = null;
  try {
    if (dm.getStrategyPositionSummary && strategy.symbol) {
      const summary = await dm.getStrategyPositionSummary(strategy.id, strategy.symbol);
      positionSummary = {
        netExecutedPosition: summary.netExecutedPosition.toString(),
        pendingBuySize: summary.pendingBuySize.toString(),
        pendingSellSize: summary.pendingSellSize.toString(),
        totalBoughtSize: summary.totalBoughtSize.toString(),
        totalSoldSize: summary.totalSoldSize.toString(),
      };
    }
  } catch (e) {
    console.warn(`Failed to calculate position summary for strategy ${strategy.id}`, e);
  }

  return { rebuiltPerformance, positionSummary };
}
