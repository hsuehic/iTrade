/**
 * Per-account baseline anchor computation for /api/analytics/account.
 *
 * The "balance change" cards define change as
 *   change = (current total − baseline) / baseline
 * where baseline is each account's opening balance for the selected period.
 *
 * Baseline semantics (PER ACCOUNT, never aggregated):
 *   1. Calendar / custom windows: the account's LATEST row in the
 *      previous-period window (same granularity as the chart) — INCLUDING a
 *      zero row, matching the admin ROI semantics (a genuine empty-out at
 *      period end is a real 0 baseline).
 *   2. Rolling windows: the account's first non-zero row within the chart
 *      window.
 *   3. Fallback for accounts that had NO rows in the baseline window — i.e.
 *      accounts bound to iTrade mid-period: their first non-zero recorded
 *      row (the bind-time bootstrap row). An account that was not tracked
 *      yet cannot have "gained" its pre-existing balance, so the change
 *      measured from its first recorded balance is ~0 for the pre-tracking
 *      part.
 *
 * Why per-account matters (incident 2026-11, self-hosted server): a user
 * bound OKX on Nov 17 and Binance on Nov 18, both with pre-existing balances.
 * The monthly card's baseline window (October) had no rows for either
 * account, and the old fallback picked the first non-zero AGGREGATE chart
 * point — OKX's bind-time balance only, with Binance still fill-forwarded
 * at 0. The entire Binance opening balance (~$51.5k) was then reported as
 * period "profit" (+2217%). Anchoring each account at its own first recorded
 * balance reports the true combined change (~-0.3%) instead.
 *
 * This mirrors the admin ROI baseline semantics
 * (BalanceHistoryRepository.getPeriodStartTotalByUser), which already falls
 * back per account to the first non-zero row.
 */

/** A single balance-history row as returned by getBalanceTimeSeries. */
export interface BaselineHistoryPoint {
  timestamp: Date;
  balance: { toString(): string };
  free?: { toString(): string } | null;
  locked?: { toString(): string } | null;
  /** NULL for rows written before the column existed ("unknown"). */
  unrealizedPnl?: { toString(): string } | null;
  createdAt?: Date;
  accountId?: number;
}

/** An anchor point — by construction always tied to a known account. */
export type AnchoredBaselinePoint = BaselineHistoryPoint & {
  accountId: number;
};

/** Minimal account shape needed to attribute anchors to accounts. */
export interface BaselineAccount {
  id: number;
  exchange: string;
}

export interface BaselineAnchors {
  /** accountId → anchor point (accounts with an anchor; may be 0 in calendar mode). */
  anchors: Map<number, AnchoredBaselinePoint>;
  /**
   * Account ids whose anchor came from the previous-period baseline window
   * (calendar mode). Accounts NOT in this set anchored at their first
   * recorded balance inside the chart window.
   */
  anchoredInBaselineWindow: Set<number>;
  /** Sum of anchor balances across the given accounts. */
  totalBaselineBalance: number;
  /** Sum of anchor unrealized P&L (NULL rows treated as 0). */
  baselineUnrealizedPnl: number;
  /** True when at least one anchor has NULL unrealizedPnl. */
  realizedPnlApproximate: boolean;
}

/**
 * Per-exchange transfer-window start: transfers strictly BEFORE this moment
 * are already reflected in the baseline balance and must not be netted out
 * of the period change; transfers from this moment on count as netDeposits.
 *
 * Rule per account (the earliest wins per exchange):
 *  - Anchored in the baseline window: transfers count from the window's
 *    bucket end OR the row's write time, whichever is later. Bootstrap rows
 *    are written AFTER their synthetic period ended (an account bound Nov 17
 *    gets an Oct/Nov-16-period seed row); transfers before the write time
 *    are baked into that seed and must not be subtracted again.
 *  - Anchored at the first recorded balance (mid-period bind): transfers
 *    count from max(anchor timestamp, write time) — the bind-time snapshot
 *    already contains every earlier transfer. A transfer AT exactly the
 *    start moment still counts (the route filters with a strict <).
 *  - Accounts with no anchor at all: no entry (the route's default applies).
 */
export function computeTransferStarts(params: {
  anchors: Map<number, AnchoredBaselinePoint>;
  anchoredInBaselineWindow: Set<number>;
  accounts: BaselineAccount[];
  /** Chart bucket length in ms (baseline-window rows use the same one). */
  bucketIntervalMs: number;
  /** Window start — the pre-existing default transfer start. */
  windowStart: Date;
}): Map<string, Date> {
  const { anchors, anchoredInBaselineWindow, accounts, bucketIntervalMs, windowStart } =
    params;

  const byExchange = new Map<string, Date>();
  for (const [accountId, anchor] of anchors) {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) continue;
    const exKey = account.exchange.toLowerCase();
    const createdAt = anchor.createdAt ? new Date(anchor.createdAt) : null;
    let transferStart: Date;
    if (anchoredInBaselineWindow.has(accountId)) {
      const bucketEnd = new Date(anchor.timestamp.getTime() + bucketIntervalMs);
      transferStart =
        createdAt && createdAt.getTime() > bucketEnd.getTime() ? createdAt : windowStart;
    } else {
      transferStart = createdAt
        ? new Date(Math.max(anchor.timestamp.getTime(), createdAt.getTime()))
        : anchor.timestamp;
    }
    const existing = byExchange.get(exKey);
    if (!existing || transferStart < existing) {
      byExchange.set(exKey, transferStart);
    }
  }
  return byExchange;
}

/**
 * Compute per-account baseline anchors.
 *
 * @param baselineData previous-period rows per exchange (calendar / custom
 *        windows). Pass `[]` for rolling windows — anchors then come from the
 *        chart window alone.
 * @param chartData current-window rows per exchange (the same series the
 *        chart is drawn from).
 * @param accounts the user's active exchange accounts being summarized.
 *        History rows belonging to other accounts (e.g. since-deactivated
 *        ones) are ignored so baseline and current totals stay symmetric.
 */
export function computeBaselineAnchors(params: {
  baselineData: Array<{ history: BaselineHistoryPoint[] }>;
  chartData: Array<{ history: BaselineHistoryPoint[] }>;
  accounts: BaselineAccount[];
}): BaselineAnchors {
  const { baselineData, chartData, accounts } = params;

  const accountIds = new Set(accounts.map((a) => a.id));
  const anchors = new Map<number, AnchoredBaselinePoint>();
  const anchoredInBaselineWindow = new Set<number>();
  const seenInBaselineWindow = new Set<number>();

  // 1) Latest baseline-window row per account (calendar mode). Matches the
  //    admin ROI semantics: the period-start row is the latest row at-or-
  //    before the window end, INCLUDING a zero row — a genuine empty-out at
  //    period end is a real 0 baseline, not a reason to dig for an earlier
  //    non-zero row. History is period-ascending, so walk it backwards to
  //    hit each account's most recent row first.
  for (const { history } of baselineData) {
    for (let i = history.length - 1; i >= 0; i--) {
      const point = history[i];
      const accountId = point.accountId;
      if (!accountId || !accountIds.has(accountId)) continue;
      seenInBaselineWindow.add(accountId);
      if (anchors.has(accountId)) continue;
      // accountId is truthy here by the guard above.
      anchors.set(accountId, point as AnchoredBaselinePoint);
      anchoredInBaselineWindow.add(accountId);
    }
  }

  // 2) First non-zero chart-window row per account.
  const firstNonZeroInChart = new Map<number, AnchoredBaselinePoint>();
  for (const { history } of chartData) {
    for (const point of history) {
      const accountId = point.accountId;
      if (!accountId || !accountIds.has(accountId)) continue;
      if (firstNonZeroInChart.has(accountId)) continue;
      if (parseFloat(point.balance.toString()) > 0) {
        firstNonZeroInChart.set(accountId, point as AnchoredBaselinePoint);
      }
    }
  }

  // 3) Fill accounts that had no baseline-window rows (rolling mode, or
  //    accounts bound mid-period) with their first recorded balance.
  //    Accounts that DID have baseline-window rows — even all-zero ones —
  //    keep a zero baseline: their period-start balance was genuinely 0.
  for (const account of accounts) {
    if (anchors.has(account.id) || seenInBaselineWindow.has(account.id)) {
      continue;
    }
    const first = firstNonZeroInChart.get(account.id);
    if (first) anchors.set(account.id, first);
  }

  // 4) Aggregate anchor totals across the given accounts. Accounts whose
  //    anchor row is a genuine 0 contribute 0 to the total (admin parity).
  let totalBaselineBalance = 0;
  let baselineUnrealizedPnl = 0;
  let realizedPnlApproximate = false;
  for (const account of accounts) {
    const anchor = anchors.get(account.id);
    if (!anchor) continue;
    totalBaselineBalance += parseFloat(anchor.balance.toString());
    const upnl = anchor.unrealizedPnl;
    if (upnl === null || upnl === undefined) {
      realizedPnlApproximate = true;
    } else {
      baselineUnrealizedPnl += parseFloat(upnl.toString());
    }
  }

  return {
    anchors,
    anchoredInBaselineWindow,
    totalBaselineBalance,
    baselineUnrealizedPnl,
    realizedPnlApproximate,
  };
}
