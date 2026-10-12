'use client';

import { useEffect, useState, useCallback, useRef, use } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  IconArrowLeft,
  IconPlayerPlay,
  IconPlayerPause,
  IconEdit,
  IconCopy,
  IconTrendingUp,
  IconTrendingDown,
  IconCash,
  IconReceipt,
  IconTarget,
  IconChartBar,
} from '@tabler/icons-react';
import type { StrategyEntity } from '@itrade/data-manager';

const StrategyStatus = {
  ACTIVE: 'active',
  STOPPED: 'stopped',
  PAUSED: 'paused',
  ERROR: 'error',
} as const;

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';
import { toast } from 'sonner';

import { ExchangeLogo } from '@/components/exchange-logo';
import { SymbolIcon } from '@/components/symbol-icon';
import { OrdersTable } from '@/components/orders-table';
import { getDisplaySymbol, extractBaseCurrency } from '@/lib/exchanges';
import { authClient } from '@/lib/auth-client';

import { StrategyConfigView } from '@/components/strategy/strategy-config-view';

type Params = Promise<{ id: string }>;

export default function StrategyDetailPage(props: { params: Params }) {
  const params = use(props.params);
  const id = parseInt(params.id);

  const t = useTranslations('strategy');
  const router = useRouter();

  // An admin lands here from Management → Strategy Management, where the
  // Strategy Name column links to this page. Admins read any user's strategy
  // through the admin API; a strategy the admin does NOT own renders read-only
  // (no Edit/Clone, no order row actions — those endpoints are owner-scoped
  // and would 403) and shows an Owner line. A strategy the admin DOES own, and
  // every strategy viewed by its owner, keep the exact previous behaviour.
  const { data: session, isPending: sessionPending } = authClient.useSession();

  // Identity snapshot, latched from the first resolved session and only ever
  // replaced by a DIFFERENT signed-in user. better-auth's session atom keeps
  // the previous `data` while a refetch is in flight, but sets `data: null`
  // (with `isPending` still false) when a session refetch FAILS — reacting to
  // that transient null would flip `fetchBase` mid-view and, for an admin
  // reading someone else's strategy, fire a 403 against the owner route.
  const [viewer, setViewer] = useState<{ id: string; role: string | null } | null>(null);

  useEffect(() => {
    if (!session?.user) return;
    const user = session.user as { id: string; role?: string | null };
    setViewer((prev) =>
      prev?.id === user.id ? prev : { id: user.id, role: user.role ?? null },
    );
  }, [session]);

  const isAdmin = viewer?.role === 'admin';
  // Fetch base is keyed on the ROLE alone: the admin endpoint returns an
  // admin's own strategy just as well as someone else's, and ownership is not
  // known until the strategy has been fetched.
  const fetchBase = isAdmin ? '/api/admin/strategies' : '/api/strategies';

  interface PnLData {
    realizedPnL: string | number;
    unrealizedPnL: string | number;
    totalPnL: string | number;
    totalFees: string | number;
    netPnL: string | number;
    roi: string | number;
    winRate: string | number;
    profitFactor: string | number;
  }

  interface RebuiltPerformance {
    pnl: PnLData;
    orders: {
      long: { filled: { count: number }; total: { count: number } };
      short: { filled: { count: number }; total: { count: number } };
    };
    activity: {
      winningTrades: number;
      losingTrades: number;
    };
    risk: {
      maxDrawdown: string | number;
      sharpeRatio: string | number;
    };
  }

  const [strategy, setStrategy] = useState<StrategyEntity | null>(null);
  const [rebuiltPerformance, setRebuiltPerformance] = useState<RebuiltPerformance | null>(
    null,
  );
  const [positionSummary, setPositionSummary] = useState<{
    netExecutedPosition: string;
    pendingBuySize: string;
    pendingSellSize: string;
    totalBoughtSize: string;
    totalSoldSize: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [cloning, setCloning] = useState(false);

  // Read-only affordances are decided by OWNERSHIP, not by role: the admin
  // endpoints work for an admin's own strategy too, so an admin who also owns
  // strategies keeps Edit/Clone/order actions on their own rows. A regular
  // user is always the owner (the owner-scoped route 403s otherwise), so their
  // behaviour is unchanged.
  const isOwner = Boolean(viewer && strategy?.user && strategy.user.id === viewer.id);
  // True only when an admin is reading a strategy they do NOT own. Writes and
  // the back target follow OWNER semantics whenever the strategy is the
  // viewer's own, so an admin/owner gets no surprise admin audit entry and
  // returns to the normal list.
  const adminView = isAdmin && !isOwner;
  const backHref = adminView ? '/admin/strategies' : '/strategy';
  // Primitive (stable) form of the signed-in user, so the fetch effect can wait
  // for identity without depending on the `session` object identity — better-auth
  // hands back a fresh object on every re-resolve (e.g. window focus), which must
  // not become a fetch trigger.
  const sessionUserId = session?.user?.id ?? null;
  const initialFetchDoneRef = useRef(false);

  const fetchStrategy = useCallback(
    async (isBackgroundRefresh = false) => {
      try {
        if (!isBackgroundRefresh) setLoading(true);
        const res = await fetch(`${fetchBase}/${id}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to fetch strategy');
        const data = await res.json();
        setStrategy(data.strategy);
        setRebuiltPerformance(data.rebuiltPerformance ?? null);
        setPositionSummary(data.positionSummary ?? null);
      } catch (error) {
        console.error(error);
        // Don't spam toasts on background polling failures — only surface
        // the error on the initial load.
        if (!isBackgroundRefresh) toast.error(t('errors.loadStrategies'));
      } finally {
        if (!isBackgroundRefresh) setLoading(false);
      }
    },
    [fetchBase, id, t],
  );

  useEffect(() => {
    // Wait for the identity latch before fetching: `fetchBase` depends on it,
    // and firing early would hit the owner-scoped route first and surface a
    // spurious 403 toast. When the session resolves to NO user (initial fetch
    // failed / signed out) we fall through to the owner base, exactly like
    // before this change: it 401s and the error state renders. Unauthenticated
    // visitors never get here anyway — middleware 307s /strategy/* to sign-in.
    if (sessionPending) return;
    if (!viewer && sessionUserId) return;
    if (isNaN(id)) return;

    // The first run loads behind the full skeleton; any LATER run of this effect
    // (better-auth re-resolving the session on window focus can flip
    // `sessionPending` true→false again) refreshes in the BACKGROUND so the
    // page never flashes its loading state twice.
    const isFirstRun = !initialFetchDoneRef.current;
    initialFetchDoneRef.current = true;
    fetchStrategy(!isFirstRun);

    // Unrealized PnL depends on the live market price, which the initial
    // fetch snapshots at load time. Without polling, the figures on this
    // page silently go stale the longer the tab stays open (bug: PnL sign
    // can flip vs. reality after the market moves). Poll in the background
    // every 15s — matches the ~30s server-side price cache TTL without
    // re-triggering the full-page loading skeleton on each tick. Pause
    // while the tab is hidden to avoid needless API hammering.
    const tick = () => {
      if (document.visibilityState === 'visible') fetchStrategy(true);
    };
    const intervalId = setInterval(tick, 15000);
    return () => clearInterval(intervalId);
    // `viewer` is a dep because `fetchStrategy`/`fetchBase` are derived from it
    // while the strategy is unchanged for a non-admin viewer; `sessionUserId` is
    // the primitive identity gate above (`session` itself is deliberately not a
    // dep — its object identity changes on every better-auth re-resolve).
  }, [id, fetchStrategy, sessionPending, sessionUserId, viewer]);

  const toggleStatus = async () => {
    if (!strategy || !isOwner) return;

    const newStatus =
      strategy.status === StrategyStatus.ACTIVE
        ? StrategyStatus.STOPPED
        : StrategyStatus.ACTIVE;

    try {
      setUpdatingStatus(true);
      // Owner-scoped route only: the page is strictly read-only for anyone who
      // does not own the strategy, so this button is not rendered for them.
      // (Admins keep start/stop on the Strategy Management list, which uses the
      // audited /api/admin/strategies/[id]/status route.)
      const res = await fetch(`/api/strategies/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) throw new Error('Failed to update status');

      toast.success(
        t(newStatus === StrategyStatus.ACTIVE ? 'messages.started' : 'messages.stopped'),
      );
      fetchStrategy(); // Reload to get updated status/state
    } catch {
      toast.error(t('errors.updateStatus'));
    } finally {
      setUpdatingStatus(false);
    }
  };

  const cloneStrategy = async () => {
    if (!strategy || cloning) return;

    setCloning(true);
    try {
      const response = await fetch(`/api/strategies/${strategy.id}/clone`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t('errors.cloneStrategy'));
      }

      const data = await response.json();
      toast.success(t('messages.cloned', { name: strategy.name }));
      // Navigate to the cloned strategy's detail page
      router.push(`/strategy/${data.strategy.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errors.cloneStrategy'));
    } finally {
      setCloning(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20';
      case 'stopped':
        return 'bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20';
      case 'paused':
        return 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20';
      case 'error':
        return 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20';
      default:
        return 'bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20';
    }
  };

  const formatSize = (value: string) =>
    parseFloat(value)
      .toFixed(8)
      .replace(/\.?0+$/, '') || '0';

  const toNum = (v: string | number) => (typeof v === 'string' ? parseFloat(v) : v);

  const formatCurrency = (value: string | number) => {
    const num = toNum(value);
    if (isNaN(num)) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const formatSignedCurrency = (value: string | number) => {
    const num = toNum(value);
    if (isNaN(num)) return '$0.00';
    const abs = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(num));
    if (num > 0) return `+${abs}`;
    if (num < 0) return `-${abs}`;
    return abs;
  };

  const formatPercent = (value: string | number) => {
    const num = toNum(value);
    if (isNaN(num)) return '0.00%';
    return `${num.toFixed(2)}%`;
  };

  if (loading && !strategy) {
    return (
      <SidebarInset>
        <SiteHeader title={t('title')} />
        <div className="p-6 space-y-6">
          <Skeleton className="h-12 w-1/3" />
          <Skeleton className="h-64 w-full" />
        </div>
      </SidebarInset>
    );
  }

  if (!strategy) {
    return (
      <SidebarInset>
        <SiteHeader title={t('title')} />
        <div className="p-6 text-center">
          <h2 className="text-xl font-bold">{t('errors.notFound')}</h2>
          <Button variant="link" onClick={() => router.push(backHref)}>
            <IconArrowLeft className="mr-2 h-4 w-4" />
            {t('backToList')}
          </Button>
        </div>
      </SidebarInset>
    );
  }

  return (
    <SidebarInset>
      <SiteHeader title={strategy.name} />
      <div className="flex flex-1 flex-col p-4 md:p-6 space-y-6">
        {/* Header Section */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push(backHref)}
                className="h-8 w-8 -ml-2"
              >
                <IconArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-2xl font-bold tracking-tight">{strategy.name}</h1>
              <Badge variant="outline" className={getStatusColor(strategy.status)}>
                {strategy.status.toUpperCase()}
              </Badge>
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground ml-8">
              <div className="flex items-center gap-1.5">
                <ExchangeLogo exchange={strategy.exchange || ''} className="h-4 w-4" />
                <span className="capitalize">{strategy.exchange}</span>
              </div>
              <div className="h-4 w-[1px] bg-border" />
              <div className="flex items-center gap-1.5 font-mono">
                <SymbolIcon
                  symbol={extractBaseCurrency(strategy.symbol || '')}
                  exchangeId={strategy.exchange?.toLowerCase()}
                  className="h-4 w-4"
                />
                {strategy.symbol && strategy.exchange
                  ? getDisplaySymbol(strategy.symbol, strategy.exchange)
                  : strategy.symbol}
              </div>
              <div className="h-4 w-[1px] bg-border" />
              <div className="font-mono text-xs opacity-80">{strategy.type}</div>
            </div>

            {/* Admin-only: whose strategy is this? */}
            {!isOwner && strategy.user && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-8">
                <span className="font-semibold text-foreground/80">{t('owner')}:</span>
                <span>{strategy.user.name || strategy.user.email}</span>
                {strategy.user.name && strategy.user.email && (
                  <span className="opacity-70">({strategy.user.email})</span>
                )}
              </div>
            )}

            {(() => {
              const startStr = strategy.performance?.startTime || strategy.createdAt;
              if (!startStr) return null;
              const startTime = new Date(startStr);
              // Use current time if active, otherwise the updatedAt time
              const endTime =
                strategy.status === 'active' ? new Date() : new Date(strategy.updatedAt);

              const durationMs = Math.max(0, endTime.getTime() - startTime.getTime());
              const s = Math.floor(durationMs / 1000) % 60;
              const m = Math.floor(durationMs / (1000 * 60)) % 60;
              const h = Math.floor(durationMs / (1000 * 60 * 60)) % 24;
              const d = Math.floor(durationMs / (1000 * 60 * 60 * 24));

              const timeParts = [];
              if (d > 0) timeParts.push(`${d}d`);
              if (h > 0 || d > 0) timeParts.push(`${h}h`);
              if (m > 0 || h > 0 || d > 0) timeParts.push(`${m}m`);
              timeParts.push(`${s}s`);

              const formatOpt: Intl.DateTimeFormatOptions = {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
              };

              return (
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1.5 font-mono text-xs opacity-80 ml-8 mt-1.5 text-muted-foreground">
                  <span className="font-semibold text-foreground/80">
                    Runtime: {timeParts.join(' ')}
                  </span>
                  <span className="opacity-70">
                    &nbsp;|&nbsp;{startTime.toLocaleString(undefined, formatOpt)} -{' '}
                    {strategy.status === 'active'
                      ? 'Now'
                      : endTime.toLocaleString(undefined, formatOpt)}
                  </span>
                </div>
              );
            })()}

            {strategy.errorMessage && (
              <div className="ml-8 mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded-md text-sm text-red-600 dark:text-red-400">
                Error: {strategy.errorMessage}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 ml-8 md:ml-0">
            {/* Owner-scoped: this page is read-only for anyone who does not own
                the strategy. Admins start/stop from the Strategy Management
                list instead (audited admin status route). */}
            {isOwner && (
              <Button
                size="sm"
                variant={strategy.status === 'active' ? 'destructive' : 'default'}
                onClick={toggleStatus}
                disabled={updatingStatus}
              >
                {strategy.status === 'active' ? (
                  <>
                    <IconPlayerPause className="mr-2 h-4 w-4" />
                    {t('actions.stop')}
                  </>
                ) : (
                  <>
                    <IconPlayerPlay className="mr-2 h-4 w-4" />
                    {t('actions.start')}
                  </>
                )}
              </Button>
            )}

            {/* Edit/Clone are owner-scoped (`/api/strategies/[id]/*`) and would
                403 on someone else's strategy. */}
            {isOwner && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => router.push(`/strategy?edit=${strategy.id}`)}
                  disabled={strategy.status === StrategyStatus.ACTIVE}
                  title={
                    strategy.status === StrategyStatus.ACTIVE
                      ? t('actions.cannotEditActive')
                      : undefined
                  }
                >
                  <IconEdit className="mr-2 h-4 w-4" />
                  {t('actions.edit')}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={cloneStrategy}
                  disabled={cloning}
                >
                  {cloning ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                      {t('actions.cloning')}
                    </>
                  ) : (
                    <>
                      <IconCopy className="mr-2 h-4 w-4" />
                      {t('actions.clone')}
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* PnL Performance Cards */}
        {rebuiltPerformance?.pnl && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Total PnL */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {t('performance.totalPnL')}
                </CardTitle>
                {toNum(rebuiltPerformance.pnl.totalPnL) >= 0 ? (
                  <IconTrendingUp className="h-4 w-4 text-green-500" />
                ) : (
                  <IconTrendingDown className="h-4 w-4 text-red-500" />
                )}
              </CardHeader>
              <CardContent>
                <div
                  className={`text-2xl font-bold font-mono ${
                    toNum(rebuiltPerformance.pnl.totalPnL) >= 0
                      ? 'text-green-500'
                      : 'text-red-500'
                  }`}
                >
                  {formatSignedCurrency(rebuiltPerformance.pnl.totalPnL)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('performance.roi')}: {formatPercent(rebuiltPerformance.pnl.roi)}
                </p>
              </CardContent>
            </Card>

            {/* Realized PnL */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {t('performance.realizedPnl')}
                </CardTitle>
                <IconCash className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div
                  className={`text-2xl font-bold font-mono ${
                    toNum(rebuiltPerformance.pnl.realizedPnL) >= 0
                      ? 'text-green-500'
                      : 'text-red-500'
                  }`}
                >
                  {formatSignedCurrency(rebuiltPerformance.pnl.realizedPnL)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('performance.totalFees')}:{' '}
                  {formatCurrency(rebuiltPerformance.pnl.totalFees)}
                </p>
              </CardContent>
            </Card>

            {/* Unrealized PnL */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {t('performance.unrealizedPnl')}
                </CardTitle>
                <IconReceipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div
                  className={`text-2xl font-bold font-mono ${
                    toNum(rebuiltPerformance.pnl.unrealizedPnL) >= 0
                      ? 'text-green-500'
                      : 'text-red-500'
                  }`}
                >
                  {formatSignedCurrency(rebuiltPerformance.pnl.unrealizedPnL)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('performance.profitFactor')}:{' '}
                  {toNum(rebuiltPerformance.pnl.profitFactor).toFixed(2)}
                </p>
              </CardContent>
            </Card>

            {/* Win Rate & Orders */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {t('performance.winRate')}
                </CardTitle>
                <IconTarget className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono">
                  {formatPercent(rebuiltPerformance.pnl.winRate)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {rebuiltPerformance.activity?.winningTrades ?? 0} W /{' '}
                  {rebuiltPerformance.activity?.losingTrades ?? 0} L
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Position Summary Cards */}
        {positionSummary !== null && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {/* Net Executed Position */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {t('netPosition.title')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className={`text-2xl font-bold font-mono ${
                    parseFloat(positionSummary.netExecutedPosition) > 0
                      ? 'text-green-500'
                      : parseFloat(positionSummary.netExecutedPosition) < 0
                        ? 'text-red-500'
                        : 'text-muted-foreground'
                  }`}
                >
                  {parseFloat(positionSummary.netExecutedPosition) > 0 ? '+' : ''}
                  {formatSize(positionSummary.netExecutedPosition)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('netPosition.description', {
                    symbol: strategy.symbol?.split('/')[0] || '',
                  })}
                </p>
              </CardContent>
            </Card>

            {/* Total Bought Size */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {t('netPosition.totalBought')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className={`text-2xl font-bold font-mono ${
                    parseFloat(positionSummary.totalBoughtSize) > 0
                      ? 'text-green-500'
                      : 'text-muted-foreground'
                  }`}
                >
                  {formatSize(positionSummary.totalBoughtSize)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('netPosition.totalBoughtDesc', {
                    symbol: strategy.symbol?.split('/')[0] || '',
                  })}
                </p>
              </CardContent>
            </Card>

            {/* Total Sold Size */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {t('netPosition.totalSold')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className={`text-2xl font-bold font-mono ${
                    parseFloat(positionSummary.totalSoldSize) > 0
                      ? 'text-red-500'
                      : 'text-muted-foreground'
                  }`}
                >
                  {formatSize(positionSummary.totalSoldSize)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('netPosition.totalSoldDesc', {
                    symbol: strategy.symbol?.split('/')[0] || '',
                  })}
                </p>
              </CardContent>
            </Card>

            {/* Pending Buy Size */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {t('netPosition.pendingBuy')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className={`text-2xl font-bold font-mono ${
                    parseFloat(positionSummary.pendingBuySize) > 0
                      ? 'text-green-500'
                      : 'text-muted-foreground'
                  }`}
                >
                  {formatSize(positionSummary.pendingBuySize)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('netPosition.pendingBuyDesc', {
                    symbol: strategy.symbol?.split('/')[0] || '',
                  })}
                </p>
              </CardContent>
            </Card>

            {/* Pending Sell Size */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {t('netPosition.pendingSell')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className={`text-2xl font-bold font-mono ${
                    parseFloat(positionSummary.pendingSellSize) > 0
                      ? 'text-red-500'
                      : 'text-muted-foreground'
                  }`}
                >
                  {formatSize(positionSummary.pendingSellSize)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('netPosition.pendingSellDesc', {
                    symbol: strategy.symbol?.split('/')[0] || '',
                  })}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabs for Details */}
        <Tabs defaultValue="orders" className="space-y-4">
          <TabsList>
            <TabsTrigger value="orders">{t('tabs.orders')}</TabsTrigger>
            <TabsTrigger value="performance">{t('tabs.performance')}</TabsTrigger>
            <TabsTrigger value="config">{t('tabs.configuration')}</TabsTrigger>
          </TabsList>

          <TabsContent value="orders" className="space-y-4">
            <OrdersTable selectedStrategy={id} readOnly={!isOwner} />
          </TabsContent>

          <TabsContent value="performance" className="space-y-4">
            {rebuiltPerformance?.pnl ? (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {/* Net PnL */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">
                        {t('performance.netPnl')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div
                        className={`text-2xl font-bold font-mono ${
                          toNum(rebuiltPerformance.pnl.netPnL) >= 0
                            ? 'text-green-500'
                            : 'text-red-500'
                        }`}
                      >
                        {formatSignedCurrency(rebuiltPerformance.pnl.netPnL)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('performance.totalPnL')}:{' '}
                        {formatCurrency(rebuiltPerformance.pnl.totalPnL)} -{' '}
                        {t('performance.totalFees')}:{' '}
                        {formatCurrency(rebuiltPerformance.pnl.totalFees)}
                      </p>
                    </CardContent>
                  </Card>

                  {/* Realized PnL */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">
                        {t('performance.realizedPnl')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div
                        className={`text-2xl font-bold font-mono ${
                          toNum(rebuiltPerformance.pnl.realizedPnL) >= 0
                            ? 'text-green-500'
                            : 'text-red-500'
                        }`}
                      >
                        {formatSignedCurrency(rebuiltPerformance.pnl.realizedPnL)}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Unrealized PnL */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">
                        {t('performance.unrealizedPnl')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div
                        className={`text-2xl font-bold font-mono ${
                          toNum(rebuiltPerformance.pnl.unrealizedPnL) >= 0
                            ? 'text-green-500'
                            : 'text-red-500'
                        }`}
                      >
                        {formatSignedCurrency(rebuiltPerformance.pnl.unrealizedPnL)}
                      </div>
                    </CardContent>
                  </Card>

                  {/* ROI */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">
                        {t('performance.roi')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div
                        className={`text-2xl font-bold font-mono ${
                          toNum(rebuiltPerformance.pnl.roi) >= 0
                            ? 'text-green-500'
                            : 'text-red-500'
                        }`}
                      >
                        {formatPercent(rebuiltPerformance.pnl.roi)}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Win Rate */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">
                        {t('performance.winRate')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold font-mono">
                        {formatPercent(rebuiltPerformance.pnl.winRate)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {rebuiltPerformance.activity?.winningTrades ?? 0} W /{' '}
                        {rebuiltPerformance.activity?.losingTrades ?? 0} L
                      </p>
                    </CardContent>
                  </Card>

                  {/* Profit Factor */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">
                        {t('performance.profitFactor')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold font-mono">
                        {toNum(rebuiltPerformance.pnl.profitFactor).toFixed(2)}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Total Fees */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">
                        {t('performance.totalFees')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold font-mono text-muted-foreground">
                        {formatCurrency(rebuiltPerformance.pnl.totalFees)}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Orders */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">
                        {t('performance.orders')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold font-mono">
                        {(rebuiltPerformance.orders?.long?.total?.count ?? 0) +
                          (rebuiltPerformance.orders?.short?.total?.count ?? 0)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('performance.filledOrders')}:{' '}
                        {(rebuiltPerformance.orders?.long?.filled?.count ?? 0) +
                          (rebuiltPerformance.orders?.short?.filled?.count ?? 0)}
                      </p>
                    </CardContent>
                  </Card>

                  {/* Max Drawdown */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">
                        {t('performance.maxDrawdown')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold font-mono text-red-500">
                        {formatPercent(rebuiltPerformance.risk?.maxDrawdown ?? 0)}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : (
              <Card>
                <CardContent className="flex items-center justify-center py-12">
                  <div className="text-center space-y-2">
                    <IconChartBar className="h-8 w-8 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">
                      {t('performance.noData')}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="config" className="space-y-4">
            <StrategyConfigView
              parameters={strategy.parameters}
              subscription={strategy.subscription}
              initialDataConfig={strategy.initialDataConfig}
            />
          </TabsContent>
        </Tabs>
      </div>
    </SidebarInset>
  );
}
