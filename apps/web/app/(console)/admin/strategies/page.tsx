'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SiteHeader } from '@/components/site-header';
import { UserSelector } from '@/components/strategy/user-selector';
import { SidebarInset } from '@/components/ui/sidebar';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  IconSearch,
  IconLoader2,
  IconRefresh,
  IconDotsVertical,
  IconCopy,
  IconPlayerPlay,
  IconPlayerStop,
  IconPencil,
  IconTrash,
  IconChevronLeft,
  IconChevronRight,
} from '@tabler/icons-react';
import { SUPPORTED_EXCHANGES, getExchangeInfo } from '@/lib/exchanges';
import { MAX_STRATEGY_NAME_LENGTH } from '@/lib/admin-strategy-validation';
import { toast } from 'sonner';

interface AdminStrategy {
  id: number;
  name: string;
  description?: string | null;
  type: string;
  status: string;
  exchange?: string | null;
  symbol?: string | null;
  marketType?: string | null;
  parameters?: Record<string, unknown> | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
  user?: { id: string; name?: string | null; email?: string | null } | null;
  performance?: {
    totalPnL?: string | number | null;
    netPnL?: string | number | null;
    roi?: string | number | null;
    winRate?: string | number | null;
    totalOrders?: number | null;
  } | null;
}

interface AdminUser {
  id: string;
  name?: string | null;
  email?: string | null;
}

type SortKey =
  | 'name'
  | 'createdAt'
  | 'status'
  | 'symbol'
  | 'exchange'
  | 'totalPnL'
  | 'roi';

const STATUS_VARIANT: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  active: 'default',
  stopped: 'secondary',
  paused: 'outline',
  error: 'destructive',
};

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Sortable table header. Defined at module scope (not inside the page
 * component) so React sees the same component type on every render — a
 * component created inside a render is a new type each time and forces the
 * whole subtree to remount.
 */
function SortHead({
  label,
  sortAs,
  align,
  sortKey,
  sortDirection,
  onSort,
}: {
  label: string;
  sortAs: SortKey;
  align?: 'right';
  sortKey: SortKey;
  sortDirection: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === sortAs;
  return (
    <TableHead className={align === 'right' ? 'text-right' : undefined}>
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => onSort(sortAs)}
      >
        {label}
        {active ? <span>{sortDirection === 'asc' ? '↑' : '↓'}</span> : null}
      </button>
    </TableHead>
  );
}

export default function AdminStrategiesPage() {
  const [strategies, setStrategies] = useState<AdminStrategy[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Distinguishes "no strategies match this filter" from "the request failed" —
  // otherwise a 500 renders the same empty-state copy as a legit empty result.
  const [loadError, setLoadError] = useState<string | null>(null);
  // Monotonic id: rapid filter/sort changes can resolve out of order, and the
  // slower (stale) response would otherwise overwrite the newer one.
  const requestIdRef = useRef(0);

  // Filters
  const [search, setSearch] = useState('');
  const [symbol, setSymbol] = useState('');
  const [ownerId, setOwnerId] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [exchangeFilter, setExchangeFilter] = useState('all');

  // Sorting + pagination (server-side)
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [users, setUsers] = useState<AdminUser[]>([]);
  // Users that have at least one ACTIVE bound exchange account — the only
  // candidates the owner filter offers. `null` means the lookup failed, in which
  // case we fall back to every user so the filter stays usable instead of
  // silently rendering an empty list.
  const [boundUsers, setBoundUsers] = useState<AdminUser[] | null>(null);
  // Guards the brief window before the owners lookup resolves, so the filter
  // cannot offer a user we have not yet confirmed has an exchange account.
  const [ownersLoaded, setOwnersLoaded] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);

  // Dialogs
  const [editTarget, setEditTarget] = useState<AdminStrategy | null>(null);
  const [cloneTarget, setCloneTarget] = useState<AdminStrategy | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminStrategy | null>(null);

  // Debounce keyword + token inputs
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [debouncedSymbol, setDebouncedSymbol] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setDebouncedSymbol(symbol.trim());
      setPage(1);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, symbol]);

  const fetchUsers = useCallback(async () => {
    // Two distinct needs:
    //  - the owner FILTER only offers users with a bound exchange account
    //    (`/api/admin/strategies/owners` — one query, no avatars);
    //  - the CLONE dialog offers the same candidate set: a target user without
    //    an exchange account can only ever receive a dead STOPPED clone, so
    //    listing them just invites the mistake. `/api/admin/users` (`basic=1`,
    //    multi-MB base64 avatars stripped) stays the fallback source when the
    //    owners lookup fails.
    // The tenant has well under 1000 users, so one page is enough — no paging.
    const [ownersRes, usersRes] = await Promise.allSettled([
      fetch('/api/admin/strategies/owners', { cache: 'no-store' }),
      fetch('/api/admin/users?limit=1000&basic=1', { cache: 'no-store' }),
    ]);

    // Owners first: this flag gates the owner dropdown, so it must not wait on
    // the (larger) users request.
    if (ownersRes.status === 'fulfilled' && ownersRes.value.ok) {
      const data = await ownersRes.value.json().catch(() => null);
      // `Array.isArray` rather than a truthiness check: a 200 with an
      // unexpected shape must degrade, not throw and strand `ownersLoaded`.
      const list = Array.isArray(data?.owners) ? (data.owners as AdminUser[]) : null;
      if (list) {
        setBoundUsers(
          // Tolerate junk entries rather than throwing on `u.id` — this data is
          // untrusted JSON from a different route.
          list
            .filter((u) => u && typeof u.id === 'string')
            .map((u) => ({ id: u.id, name: u.name ?? null, email: u.email ?? null })),
        );
      } else {
        // 200 but unparseable/unexpected shape: degrade instead of rendering
        // an empty dropdown, which would read as "nobody has an account".
        setBoundUsers(null);
        toast.warning('Could not load exchange-account owners; showing all users.');
      }
    } else {
      setBoundUsers(null);
      toast.warning('Could not load exchange-account owners; showing all users.');
    }
    setOwnersLoaded(true);

    // Independent of the owners request — a failure here must not clobber the
    // owner list that just loaded.
    try {
      if (usersRes.status === 'fulfilled' && usersRes.value.ok) {
        const data = (await usersRes.value.json().catch(() => null)) as {
          users?: AdminUser[];
        } | null;
        const list = data?.users ?? [];
        setUsers(
          list.map((u) => ({ id: u.id, name: u.name ?? null, email: u.email ?? null })),
        );
      } else {
        toast.error('Failed to load users; the clone dialog may be incomplete.');
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load users; the clone dialog may be incomplete.');
    }
  }, []);

  // Owner filter options: only users with a bound exchange account. Falls back
  // to every user when the owners lookup failed (toast explains why).
  const ownerOptions = useMemo(() => boundUsers ?? users, [boundUsers, users]);

  const fetchStrategies = useCallback(
    async (opts?: { silent?: boolean }) => {
      const requestId = ++requestIdRef.current;
      if (!opts?.silent) setLoading(true);
      try {
        const params = new URLSearchParams();
        if (debouncedSearch) params.set('search', debouncedSearch);
        if (debouncedSymbol) params.set('symbol', debouncedSymbol);
        if (ownerId !== 'all') params.set('userId', ownerId);
        if (statusFilter !== 'all') params.set('status', statusFilter);
        if (exchangeFilter !== 'all') params.set('exchange', exchangeFilter);
        params.set('sortBy', sortKey);
        params.set('sortDirection', sortDirection);
        params.set('page', String(page));
        params.set('pageSize', String(pageSize));

        const res = await fetch(`/api/admin/strategies?${params.toString()}`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const message = data.error || 'Failed to load strategies';
          if (requestId !== requestIdRef.current) return; // superseded by a newer request
          setLoadError(message);
          // A background refresh (manual Refresh, post-mutation refetch) must
          // not wipe the rows already on screen — keep them and let the toast
          // report the failure.
          if (!opts?.silent) {
            setStrategies([]);
            setTotal(0);
          }
          toast.error(message);
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (requestId !== requestIdRef.current) return; // superseded by a newer request
        setStrategies((data.strategies ?? []) as AdminStrategy[]);
        setTotal(typeof data.total === 'number' ? data.total : 0);
        setLoadError(null);
      } catch (error) {
        console.error('Error fetching strategies:', error);
        // Only the newest request may surface a failure — an older, superseded
        // one erroring out must not raise a toast over a healthy view.
        if (requestId === requestIdRef.current) {
          setLoadError('An unexpected error occurred while fetching strategies');
          toast.error('An unexpected error occurred while fetching strategies');
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [
      debouncedSearch,
      debouncedSymbol,
      ownerId,
      statusFilter,
      exchangeFilter,
      sortKey,
      sortDirection,
      page,
      pageSize,
    ],
  );

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    fetchStrategies();
  }, [fetchStrategies]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection(key === 'name' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchStrategies({ silent: true });
  };

  const changeStatus = async (strategy: AdminStrategy, status: string) => {
    setActionId(strategy.id);
    try {
      const res = await fetch(`/api/admin/strategies/${strategy.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Failed to update strategy status');
        return;
      }
      toast.success(status === 'active' ? 'Strategy started' : 'Strategy stopped');
      fetchStrategies({ silent: true });
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('An unexpected error occurred');
    } finally {
      setActionId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setActionId(deleteTarget.id);
    try {
      const res = await fetch(`/api/admin/strategies/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Failed to delete strategy');
        return;
      }
      toast.success('Strategy deleted');
      setDeleteTarget(null);
      // Deleting the only row on a page would otherwise strand the admin on an
      // empty page; stepping back one page re-triggers the fetch via the effect.
      if (strategies.length === 1 && page > 1) {
        setPage((p) => p - 1);
      } else {
        fetchStrategies({ silent: true });
      }
    } catch (error) {
      console.error('Error deleting strategy:', error);
      toast.error('An unexpected error occurred');
    } finally {
      setActionId(null);
    }
  };

  const saveEdit = async (payload: {
    name: string;
    description: string;
    type: string;
    exchange: string;
    symbol: string;
    parameters: string;
  }): Promise<boolean> => {
    if (!editTarget) return false;
    let parsedParams: unknown;
    if (payload.parameters.trim()) {
      try {
        parsedParams = JSON.parse(payload.parameters);
      } catch {
        toast.error('Parameters must be valid JSON');
        return false;
      }
    }
    setActionId(editTarget.id);
    try {
      // Send only what actually changed. Besides keeping the audit record
      // readable, this avoids re-submitting untouched fields: a legacy strategy
      // whose `exchange` is no longer in SUPPORTED_EXCHANGES would otherwise
      // make every edit fail validation, locking the record from any change.
      const updates: Record<string, unknown> = {};

      const nextName = payload.name.trim();
      if (nextName !== editTarget.name) updates.name = nextName;

      const nextDescription = payload.description.trim();
      if (nextDescription !== (editTarget.description ?? '')) {
        updates.description = nextDescription;
      }

      const nextType = payload.type.trim();
      if (nextType !== editTarget.type) updates.type = nextType;

      if (payload.exchange && payload.exchange !== editTarget.exchange) {
        updates.exchange = payload.exchange;
      }

      const nextSymbol = payload.symbol.trim();
      if (nextSymbol && nextSymbol !== editTarget.symbol) updates.symbol = nextSymbol;

      if (
        parsedParams !== undefined &&
        JSON.stringify(parsedParams) !== JSON.stringify(editTarget.parameters ?? null)
      ) {
        updates.parameters = parsedParams;
      }

      if (Object.keys(updates).length === 0) {
        toast.info('No changes to save');
        setEditTarget(null);
        return true;
      }

      const res = await fetch(`/api/admin/strategies/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Failed to update strategy');
        return false;
      }
      toast.success('Strategy updated');
      setEditTarget(null);
      fetchStrategies({ silent: true });
      return true;
    } catch (error) {
      console.error('Error updating strategy:', error);
      toast.error('An unexpected error occurred');
      return false;
    } finally {
      setActionId(null);
    }
  };

  const saveClone = async (
    targetUserId: string,
    name: string,
    start: boolean,
  ): Promise<boolean> => {
    if (!cloneTarget) return false;
    setActionId(cloneTarget.id);
    try {
      const res = await fetch(`/api/admin/strategies/${cloneTarget.id}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUserId,
          ...(name.trim() ? { name: name.trim() } : {}),
          start,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        strategy?: { name?: string };
      };
      if (!res.ok) {
        toast.error(data.error || 'Failed to clone strategy');
        return false;
      }
      // The API suffixes `_copy` on a name collision — report the name actually
      // created rather than the one that was typed.
      const createdName = data?.strategy?.name;
      toast.success(
        createdName
          ? `Strategy cloned as "${createdName}"`
          : 'Strategy cloned to target user',
      );
      setCloneTarget(null);
      fetchStrategies({ silent: true });
      return true;
    } catch (error) {
      console.error('Error cloning strategy:', error);
      toast.error('An unexpected error occurred');
      return false;
    } finally {
      setActionId(null);
    }
  };

  const formatCurrency = (value: number | null) => {
    if (value === null) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatPercent = (value: number | null) => {
    if (value === null) return 'N/A';
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const formatDate = (date: string | undefined) => {
    if (!date) return 'N/A';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(date));
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Threaded in as props (rather than closing over component state) so this
  // component keeps a stable identity across renders instead of being
  // re-created and remounted on every sort/loading state change.
  const sortHeadProps = { sortKey, sortDirection, onSort: handleSort };

  return (
    <SidebarInset>
      <SiteHeader title="Admin - Strategy Management" />
      <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Strategy Management</h2>
            <p className="text-muted-foreground text-sm">
              Search, sort, edit, start/stop, clone and delete any user&apos;s strategies.
            </p>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <IconRefresh className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3 px-6 pt-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Strategies</CardTitle>
                <CardDescription>
                  {total} strateg{total === 1 ? 'y' : 'ies'} across all users.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-56">
                  <IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search name / description / type..."
                    className="pl-8"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                <Input
                  placeholder="Token (e.g. BTC)"
                  className="w-[140px]"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                />

                <UserSelector
                  value={ownerId === 'all' ? '' : ownerId}
                  onValueChange={(v) => {
                    // '' is the picker's "no user" value; the table's filter uses
                    // 'all' for the same state (see the userId param below).
                    setOwnerId(v || 'all');
                    setPage(1);
                  }}
                  users={ownerOptions}
                  allOptionLabel="All Owners"
                  placeholder="Owner"
                  disabled={!ownersLoaded}
                  triggerClassName="h-9 w-[180px]"
                />
                {/* Owner filter only offers users with a bound exchange account —
                    hidden in the degraded state, where every user is listed. */}
                {boundUsers && (
                  <span className="text-xs text-muted-foreground">
                    exch. account only
                  </span>
                )}

                <Select
                  value={statusFilter}
                  onValueChange={(v) => {
                    setStatusFilter(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-[130px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="stopped">Stopped</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={exchangeFilter}
                  onValueChange={(v) => {
                    setExchangeFilter(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-[130px]">
                    <SelectValue placeholder="Exchange" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Exchanges</SelectItem>
                    {SUPPORTED_EXCHANGES.map((ex) => (
                      <SelectItem key={ex.id} value={ex.id}>
                        {ex.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            {loading ? (
              <div className="flex h-64 flex-col items-center justify-center">
                <IconLoader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="mt-2 text-sm text-muted-foreground">
                  Loading strategies...
                </p>
              </div>
            ) : (
              <>
                <div className="relative overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortHead label="Strategy" sortAs="name" {...sortHeadProps} />
                        <TableHead>Owner</TableHead>
                        <SortHead label="Token" sortAs="symbol" {...sortHeadProps} />
                        <SortHead label="Exchange" sortAs="exchange" {...sortHeadProps} />
                        <SortHead label="Status" sortAs="status" {...sortHeadProps} />
                        <SortHead label="Created" sortAs="createdAt" {...sortHeadProps} />
                        <SortHead
                          label="PnL"
                          sortAs="totalPnL"
                          align="right"
                          {...sortHeadProps}
                        />
                        <SortHead
                          label="ROI"
                          sortAs="roi"
                          align="right"
                          {...sortHeadProps}
                        />
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {strategies.length > 0 ? (
                        strategies.map((s) => {
                          const pnl = toNumber(s.performance?.totalPnL);
                          const roi = toNumber(s.performance?.roi);
                          const isActive = s.status === 'active';
                          const busy = actionId === s.id;
                          return (
                            <TableRow key={s.id}>
                              <TableCell className="py-3">
                                <div className="flex flex-col">
                                  <span className="font-medium">{s.name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {s.type}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                <div className="flex flex-col">
                                  <span className="text-sm">
                                    {s.user?.name || 'Unknown'}
                                  </span>
                                  <span className="text-xs">
                                    {s.user?.email || s.userId}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {s.symbol || 'N/A'}
                              </TableCell>
                              <TableCell className="text-muted-foreground capitalize">
                                {s.exchange || 'N/A'}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={STATUS_VARIANT[s.status] ?? 'secondary'}
                                  className="capitalize"
                                >
                                  {s.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {formatDate(s.createdAt)}
                              </TableCell>
                              <TableCell
                                className={`text-right ${pnl === null ? 'text-muted-foreground' : pnl >= 0 ? 'text-[#16c784]' : 'text-[#ea3943]'}`}
                              >
                                {formatCurrency(pnl)}
                              </TableCell>
                              <TableCell
                                className={`text-right ${roi === null ? 'text-muted-foreground' : roi >= 0 ? 'text-[#16c784]' : 'text-[#ea3943]'}`}
                              >
                                {formatPercent(roi)}
                              </TableCell>
                              <TableCell className="text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" disabled={busy}>
                                      {busy ? (
                                        <IconLoader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <IconDotsVertical className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      disabled={isActive}
                                      onClick={() => setEditTarget(s)}
                                    >
                                      <IconPencil className="mr-2 h-4 w-4" />
                                      <span>Edit</span>
                                    </DropdownMenuItem>
                                    {isActive ? (
                                      <DropdownMenuItem
                                        onClick={() => changeStatus(s, 'stopped')}
                                      >
                                        <IconPlayerStop className="mr-2 h-4 w-4" />
                                        <span>Stop</span>
                                      </DropdownMenuItem>
                                    ) : (
                                      <DropdownMenuItem
                                        onClick={() => changeStatus(s, 'active')}
                                      >
                                        <IconPlayerPlay className="mr-2 h-4 w-4 text-green-600" />
                                        <span>Start</span>
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => setCloneTarget(s)}>
                                      <IconCopy className="mr-2 h-4 w-4" />
                                      <span>Clone to user...</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      disabled={isActive}
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => setDeleteTarget(s)}
                                    >
                                      <IconTrash className="mr-2 h-4 w-4" />
                                      <span>Delete</span>
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={9} className="h-24 text-center">
                            {loadError
                              ? `Failed to load strategies: ${loadError}`
                              : 'No strategies found matching your filters.'}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Rows per page</span>
                    <Select
                      value={String(pageSize)}
                      onValueChange={(v) => {
                        setPageSize(Number(v));
                        setPage(1);
                      }}
                    >
                      <SelectTrigger className="w-[80px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <IconChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      <IconChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {editTarget && (
        <EditStrategyDialog
          key={`edit-${editTarget.id}`}
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={saveEdit}
        />
      )}
      {cloneTarget && (
        // `users` lists ONLY users with a bound exchange account — a target user
        // without one could never run the clone, so offering them only invites the
        // mistake. `ownerOptions` falls back to every user (with an in-dialog
        // warning) when the owners lookup failed.
        <CloneStrategyDialog
          key={`clone-${cloneTarget.id}`}
          target={cloneTarget}
          users={ownerOptions}
          listingBoundUsers={boundUsers !== null}
          onClose={() => setCloneTarget(null)}
          onSave={saveClone}
        />
      )}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete strategy</DialogTitle>
            <DialogDescription>
              Delete &quot;{deleteTarget?.name}&quot; owned by{' '}
              {deleteTarget?.user?.email || deleteTarget?.userId}? This also removes its
              performance history, orders links and backtests. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={actionId === deleteTarget?.id}
            >
              {actionId === deleteTarget?.id ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarInset>
  );
}

function EditStrategyDialog({
  target,
  onClose,
  onSave,
}: {
  target: AdminStrategy;
  onClose: () => void;
  onSave: (payload: {
    name: string;
    description: string;
    type: string;
    exchange: string;
    symbol: string;
    parameters: string;
  }) => Promise<boolean>;
}) {
  const [name, setName] = useState(target.name ?? '');
  const [description, setDescription] = useState(target.description ?? '');
  const [type, setType] = useState(target.type ?? '');
  const [exchange, setExchange] = useState(target.exchange ?? '');
  const [symbol, setSymbol] = useState(target.symbol ?? '');
  const [parameters, setParameters] = useState(
    target.parameters ? JSON.stringify(target.parameters, null, 2) : '',
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !type.trim()) {
      toast.error('Name and type are required');
      return;
    }
    setSaving(true);
    await onSave({ name, description, type, exchange, symbol, parameters });
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit strategy</DialogTitle>
          <DialogDescription>
            Editing a strategy owned by {target.user?.email || target.userId}. Active
            strategies must be stopped first.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="s-name">Name</Label>
            <Input
              id="s-name"
              value={name}
              maxLength={MAX_STRATEGY_NAME_LENGTH}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="s-desc">Description</Label>
            <Input
              id="s-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="s-type">Type</Label>
              <Input id="s-type" value={type} onChange={(e) => setType(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="s-symbol">Token / Symbol</Label>
              <Input
                id="s-symbol"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="s-exchange">Exchange</Label>
            <Select value={exchange} onValueChange={setExchange}>
              <SelectTrigger id="s-exchange">
                <SelectValue placeholder="Select exchange" />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_EXCHANGES.map((ex) => (
                  <SelectItem key={ex.id} value={ex.id}>
                    {ex.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="s-params">Parameters (JSON)</Label>
            <Textarea
              id="s-params"
              className="min-h-[120px] font-mono text-xs"
              value={parameters}
              onChange={(e) => setParameters(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloneStrategyDialog({
  target,
  users,
  listingBoundUsers,
  onClose,
  onSave,
}: {
  target: AdminStrategy;
  users: AdminUser[];
  /**
   * True when `users` was narrowed to accounts with a bound exchange. Drives the
   * helper copy only: no per-target guard is needed any more, because an unbound
   * user is simply not offerable any more.
   */
  listingBoundUsers: boolean;
  onClose: () => void;
  onSave: (targetUserId: string, name: string, start: boolean) => Promise<boolean>;
}) {
  const [targetUserId, setTargetUserId] = useState('');
  // Pre-filled with the SOURCE strategy's name (cross-user clones are not
  // renamed) but editable; the API suffixes `_copy`, `_copy2`, … on collision.
  const [name, setName] = useState(target.name);
  const [start, setStart] = useState(false);
  const [saving, setSaving] = useState(false);

  // Which exchange the clone is bound to — `target.exchange` is a lowercase id
  // (`binance`), so prefer the display name from SUPPORTED_EXCHANGES.
  const sourceExchange = target.exchange
    ? (getExchangeInfo(target.exchange)?.name ?? target.exchange)
    : '';
  const sourceBinding = [target.symbol?.trim(), sourceExchange && `on ${sourceExchange}`]
    .filter(Boolean)
    .join(' ');

  const handleSave = async () => {
    if (!targetUserId) {
      toast.error('Select a target user');
      return;
    }
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    await onSave(targetUserId, name, start);
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Clone strategy to another user</DialogTitle>
          {/* Include the SOURCE exchange, not just the symbol: the clone keeps the
              source's exchange binding and can only run for a target user holding an
              account there. */}
          <DialogDescription>
            Copy &quot;{target.name}&quot;
            {sourceBinding ? ` (${sourceBinding})` : ''} — the clone is created as STOPPED
            unless you start it.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Target user</Label>
            <UserSelector
              value={targetUserId}
              onValueChange={setTargetUserId}
              users={users}
              placeholder="Select target user"
              emptyText={
                listingBoundUsers ? 'No users with a bound exchange account' : 'No users'
              }
            />
            {/* Say which candidate set this is. Without it the fallback (owners
                lookup failed -> every user) is indistinguishable from the normal
                narrowed list, and an admin could pick someone who cannot trade.
                Claim only what the list actually guarantees: a bound exchange
                account — not an account ON the source strategy's exchange. */}
            <p className="text-xs text-muted-foreground">
              {listingBoundUsers
                ? 'Only users with a bound exchange account are listed.'
                : 'Could not verify exchange accounts — showing all users.'}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="c-name">Clone name</Label>
            <Input
              id="c-name"
              value={name}
              maxLength={MAX_STRATEGY_NAME_LENGTH}
              placeholder={target.name}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Defaults to the original name. If the target user already has a strategy
              with this name, a <code>_copy</code> suffix is added automatically.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="c-start" checked={start} onCheckedChange={setStart} />
            <Label htmlFor="c-start">Start the clone immediately</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Cloning...' : 'Clone'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
