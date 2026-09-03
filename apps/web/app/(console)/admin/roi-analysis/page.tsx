'use client';

import { useState, useEffect, useCallback } from 'react';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
import { Input } from '@/components/ui/input';
import {
  IconSearch,
  IconLoader2,
  IconRefresh,
  IconTrendingUp,
  IconTrendingDown,
} from '@tabler/icons-react';
import { toast } from 'sonner';

interface RoiRow {
  userId: string;
  name: string;
  email: string;
  accountCount: number;
  balance: number;
  feeBalance: number;
  lockedBalance: number;
  mtoNowPnl: number;
  mtoNowRoi: number;
  mtoNowBaseline: number;
  ytoNowPnl: number;
  ytoNowRoi: number;
  ytoNowBaseline: number;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCurrencySigned(value: number) {
  const formatted = formatCurrency(Math.abs(value));
  return value < 0 ? `-${formatted}` : `+${formatted}`;
}

function formatPercentage(value: number, showSign = true) {
  const formatted = Math.abs(value).toFixed(2);
  const sign = value >= 0 ? '+' : '-';
  return showSign ? `${sign}${formatted}%` : `${formatted}%`;
}

export default function AdminRoiAnalysisPage() {
  const [rows, setRows] = useState<RoiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [computedAt, setComputedAt] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/roi-analysis', {
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(data.error || 'Failed to load ROI analysis');
        return;
      }
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setComputedAt(data.computedAt ?? null);
    } catch (error) {
      console.error('Error fetching ROI analysis:', error);
      toast.error('An unexpected error occurred while loading ROI analysis');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchRows();
  };

  const filteredRows = rows.filter((row) => {
    const q = searchQuery.toLowerCase();
    return (
      row.name?.toLowerCase().includes(q) ||
      row.email?.toLowerCase().includes(q) ||
      row.userId?.toLowerCase().includes(q)
    );
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.accountCount += r.accountCount;
      acc.balance += r.balance;
      acc.feeBalance += r.feeBalance;
      acc.lockedBalance += r.lockedBalance;
      // PnL and ROI baselines: only count users with a real period-start baseline
      // (baseline > 0), so a user with no snapshot doesn't skew the aggregate.
      if (r.mtoNowBaseline > 0) {
        acc.mtoNowPnl += r.mtoNowPnl;
        acc.mtoNowBaseline += r.mtoNowBaseline;
      }
      if (r.ytoNowBaseline > 0) {
        acc.ytoNowPnl += r.ytoNowPnl;
        acc.ytoNowBaseline += r.ytoNowBaseline;
      }
      return acc;
    },
    {
      accountCount: 0,
      balance: 0,
      feeBalance: 0,
      lockedBalance: 0,
      mtoNowPnl: 0,
      mtoNowBaseline: 0,
      ytoNowPnl: 0,
      ytoNowBaseline: 0,
    },
  );
  // Aggregate ROI for the cards = total PnL / total baseline (weighted), so the
  // badge reflects real portfolio return across all users with a baseline.
  const mtoNowRoiPct =
    totals.mtoNowBaseline > 0 ? (totals.mtoNowPnl / totals.mtoNowBaseline) * 100 : 0;
  const ytoNowRoiPct =
    totals.ytoNowBaseline > 0 ? (totals.ytoNowPnl / totals.ytoNowBaseline) * 100 : 0;

  return (
    <SidebarInset>
      <SiteHeader title="Admin - ROI Analysis" />
      <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">ROI Analysis</h2>
            <p className="text-muted-foreground text-sm">
              Asset status and period ROI for all users with linked exchange accounts.{' '}
              {computedAt
                ? `Computed ${new Date(computedAt).toLocaleString('en-US')}`
                : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-64">
              <IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name / email / user id..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
              aria-label="Refresh"
            >
              <IconRefresh className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Users</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums">
                {rows.length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Exchange Accounts</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums">
                {totals.accountCount}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Balance (USD)</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums">
                {formatCurrency(totals.balance)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Locked Balance (USD)</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums">
                {formatCurrency(totals.lockedBalance)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>MTD PnL (USD)</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums">
                {formatCurrencySigned(totals.mtoNowPnl)}
              </CardTitle>
              <div className="mt-1">
                <ChangeBadge
                  value={mtoNowRoiPct}
                  hasBaseline={totals.mtoNowBaseline > 0}
                />
              </div>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>YTD PnL (USD)</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums">
                {formatCurrencySigned(totals.ytoNowPnl)}
              </CardTitle>
              <div className="mt-1">
                <ChangeBadge
                  value={ytoNowRoiPct}
                  hasBaseline={totals.ytoNowBaseline > 0}
                />
              </div>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3 px-6 pt-6">
            <div className="flex flex-col gap-2">
              <CardTitle>Users with Linked Accounts</CardTitle>
              <CardDescription>
                Admin view of asset status &amp; ROI. MTD ROI = return from start of
                month; YTD ROI = return from start of year. N/A shown when no period-start
                snapshot baseline exists.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            {loading && !isRefreshing ? (
              <div className="flex h-64 flex-col items-center justify-center">
                <IconLoader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="mt-2 text-sm text-muted-foreground">
                  Loading ROI analysis...
                </p>
              </div>
            ) : (
              <div className="relative overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead className="text-right">Accounts</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead className="text-right">Fee Balance</TableHead>
                      <TableHead className="text-right">Locked</TableHead>
                      <TableHead className="text-right">MTD PnL</TableHead>
                      <TableHead className="text-right">MTD ROI</TableHead>
                      <TableHead className="text-right">YTD PnL</TableHead>
                      <TableHead className="text-right">YTD ROI</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.length > 0 ? (
                      filteredRows.map((row) => (
                        <TableRow key={row.userId}>
                          <TableCell className="py-3">
                            <div className="flex flex-col">
                              <span className="font-medium">{row.name || 'No Name'}</span>
                              <span className="text-xs text-muted-foreground">
                                {row.email}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.accountCount}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(row.balance)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(row.feeBalance)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(row.lockedBalance)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <PnlValue
                              value={row.mtoNowPnl}
                              hasBaseline={row.mtoNowBaseline > 0}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <ChangeBadge
                              value={row.mtoNowRoi}
                              hasBaseline={row.mtoNowBaseline > 0}
                            />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <PnlValue
                              value={row.ytoNowPnl}
                              hasBaseline={row.ytoNowBaseline > 0}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <ChangeBadge
                              value={row.ytoNowRoi}
                              hasBaseline={row.ytoNowBaseline > 0}
                            />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={9} className="h-24 text-center">
                          {searchQuery
                            ? 'No users match your search.'
                            : 'No users with linked exchange accounts found.'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SidebarInset>
  );
}

function PnlValue({ value, hasBaseline }: { value: number; hasBaseline: boolean }) {
  if (!hasBaseline) {
    return <span className="text-muted-foreground">N/A</span>;
  }
  const positive = value >= 0;
  return (
    <span className="tabular-nums" style={{ color: positive ? '#16c784' : '#ea3943' }}>
      {formatCurrencySigned(value)}
    </span>
  );
}

function ChangeBadge({ value, hasBaseline }: { value: number; hasBaseline: boolean }) {
  if (!hasBaseline) {
    return <Badge variant="secondary">N/A</Badge>;
  }
  const positive = value >= 0;
  const Icon = positive ? IconTrendingUp : IconTrendingDown;
  return (
    <Badge
      className="flex w-fit items-center gap-1 border bg-transparent ml-auto"
      style={{
        color: positive ? '#16c784' : '#ea3943',
        borderColor: positive ? '#16c784' : '#ea3943',
      }}
    >
      <Icon className="size-3" />
      {formatPercentage(value)}
    </Badge>
  );
}
