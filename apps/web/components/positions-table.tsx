'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  IconSearch,
  IconSortAscending,
  IconSortDescending,
  IconFilter,
  IconX,
  IconRefresh,
  IconTrendingUp,
  IconTrendingDown,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconMinus,
} from '@tabler/icons-react';
import {
  ColumnDef,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ExchangeLogo } from '@/components/exchange-logo';
import { SymbolIcon } from '@/components/symbol-icon';
import { cn, formatDate } from '@/lib/utils';
import { getDisplaySymbol, extractBaseCurrency } from '@/lib/exchanges';

interface PositionData {
  id: number;
  symbol: string;
  exchange: string;
  side: 'long' | 'short';
  quantity: string;
  avgPrice: string;
  markPrice: string;
  unrealizedPnl: string;
  leverage: string;
  marketValue: string;
  pnlPercentage: string;
  timestamp: string;
  updatedAt: string;
  // 🆕 null when the exchange doesn't report a liquidation price for this position.
  liquidationPrice: string | null;
  // 🆕 null when the exchange doesn't report a margin mode.
  marginMode: 'isolated' | 'cross' | null;
  // 🆕 Whether the exchange supports increase/reduce margin for this position.
  canAdjustMargin: boolean;
}

type MarginAdjustmentType = 'add' | 'reduce';

interface PositionsTableProps {
  selectedExchange?: string;
  refreshInterval?: number;
}

const formatCurrency = (value: string | number) => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '$0.00';

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  }).format(num);
};

const formatNumber = (value: string | number, decimals: number = 8) => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0';

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(num);
};

const formatPercentage = (value: string | number) => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0.00%';
  return `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`;
};

export function PositionsTable({
  selectedExchange = 'all',
  refreshInterval = 30000,
}: PositionsTableProps) {
  const t = useTranslations('positions');
  const locale = useLocale();
  const [positions, setPositions] = React.useState<PositionData[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'marketValue', desc: true },
  ]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [exchanges, setExchanges] = React.useState<string[]>([]);
  const [selectedFilterExchange, setSelectedFilterExchange] = React.useState('all');
  const [selectedSide, setSelectedSide] = React.useState('all');
  const [totalPnl, setTotalPnl] = React.useState('0');
  const [lastRefresh, setLastRefresh] = React.useState<Date | null>(null);

  const [marginDialog, setMarginDialog] = React.useState<{
    position: PositionData;
    type: MarginAdjustmentType;
  } | null>(null);
  const [marginAmount, setMarginAmount] = React.useState('');
  const [marginError, setMarginError] = React.useState<string | null>(null);
  const [isSubmittingMargin, setIsSubmittingMargin] = React.useState(false);
  const [marginLimits, setMarginLimits] = React.useState<{
    maxAdd: string;
    maxReduce: string;
    currentMargin: string | null;
    marginAsset: string;
  } | null>(null);
  const [isLoadingMarginLimits, setIsLoadingMarginLimits] = React.useState(false);

  const getSideLabel = React.useCallback(
    (side: string) =>
      side === 'long' ? t('side.long') : side === 'short' ? t('side.short') : side,
    [t],
  );

  const openMarginDialog = React.useCallback(
    (position: PositionData, type: MarginAdjustmentType) => {
      setMarginDialog({ position, type });
      setMarginAmount('');
      setMarginError(null);
      setMarginLimits(null);
    },
    [],
  );

  React.useEffect(() => {
    if (!marginDialog) {
      setIsLoadingMarginLimits(false);
      return;
    }

    let cancelled = false;
    const loadLimits = async () => {
      setIsLoadingMarginLimits(true);
      try {
        const response = await fetch(
          `/api/portfolio/positions/${marginDialog.position.id}/margin`,
        );
        if (!response.ok) {
          if (!cancelled) setMarginLimits(null);
          return;
        }
        const data = await response.json();
        if (!cancelled) {
          setMarginLimits({
            maxAdd: data.maxAdd,
            maxReduce: data.maxReduce,
            currentMargin: data.currentMargin,
            marginAsset: data.marginAsset || 'USDT',
          });
        }
      } catch {
        if (!cancelled) setMarginLimits(null);
      } finally {
        if (!cancelled) setIsLoadingMarginLimits(false);
      }
    };

    void loadLimits();
    return () => {
      cancelled = true;
    };
  }, [marginDialog]);

  const closeMarginDialog = React.useCallback(() => {
    if (isSubmittingMargin) return;
    setMarginDialog(null);
  }, [isSubmittingMargin]);

  const columns = React.useMemo<ColumnDef<PositionData>[]>(
    () => [
      {
        accessorKey: 'symbol',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="-ml-4 h-8 data-[state=open]:bg-accent"
          >
            {t('columns.symbol')}
            {column.getIsSorted() === 'asc' ? (
              <IconSortAscending className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <IconSortDescending className="ml-2 h-4 w-4" />
            ) : null}
          </Button>
        ),
        cell: ({ row }) => {
          const displaySymbol = getDisplaySymbol(
            row.original.symbol,
            row.original.exchange,
          );
          const baseCurrency = extractBaseCurrency(row.original.symbol);
          return (
            <div className="flex items-center gap-2">
              <SymbolIcon
                symbol={baseCurrency}
                exchangeId={row.original.exchange?.toLowerCase()}
                size="md"
              />
              <div className="flex flex-col">
                <span className="font-medium font-mono">{displaySymbol}</span>
                <span className="text-xs text-muted-foreground">
                  {t('cells.leverage', { value: row.original.leverage })}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'exchange',
        header: t('columns.exchange'),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <ExchangeLogo exchange={row.original.exchange} className="h-5 w-5" />
            <span className="capitalize">{row.original.exchange}</span>
          </div>
        ),
        filterFn: (row, id, value) => {
          return value === 'all' || row.getValue(id) === value;
        },
      },
      {
        accessorKey: 'side',
        header: t('columns.side'),
        cell: ({ row }) => (
          <Badge
            variant="outline"
            className={cn(
              'font-medium',
              row.original.side === 'long'
                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'border-rose-500/50 bg-rose-500/10 text-rose-600 dark:text-rose-400',
            )}
          >
            {row.original.side === 'long' ? (
              <IconTrendingUp className="mr-1 h-3 w-3" />
            ) : (
              <IconTrendingDown className="mr-1 h-3 w-3" />
            )}
            {getSideLabel(row.original.side)}
          </Badge>
        ),
        filterFn: (row, id, value) => {
          return value === 'all' || row.getValue(id) === value;
        },
      },
      {
        accessorKey: 'quantity',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="-ml-4 h-8 data-[state=open]:bg-accent"
          >
            {t('columns.quantity')}
            {column.getIsSorted() === 'asc' ? (
              <IconSortAscending className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <IconSortDescending className="ml-2 h-4 w-4" />
            ) : null}
          </Button>
        ),
        cell: ({ row }) => (
          <div className="text-right font-mono tabular-nums">
            {formatNumber(row.original.quantity)}
          </div>
        ),
        sortingFn: (rowA, rowB) =>
          parseFloat(rowA.original.quantity) - parseFloat(rowB.original.quantity),
      },
      {
        accessorKey: 'avgPrice',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="-ml-4 h-8 data-[state=open]:bg-accent"
          >
            {t('columns.avgPrice')}
            {column.getIsSorted() === 'asc' ? (
              <IconSortAscending className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <IconSortDescending className="ml-2 h-4 w-4" />
            ) : null}
          </Button>
        ),
        cell: ({ row }) => (
          <div className="text-right font-mono tabular-nums">
            {formatCurrency(row.original.avgPrice)}
          </div>
        ),
        sortingFn: (rowA, rowB) =>
          parseFloat(rowA.original.avgPrice) - parseFloat(rowB.original.avgPrice),
      },
      {
        accessorKey: 'markPrice',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="-ml-4 h-8 data-[state=open]:bg-accent"
          >
            {t('columns.markPrice')}
            {column.getIsSorted() === 'asc' ? (
              <IconSortAscending className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <IconSortDescending className="ml-2 h-4 w-4" />
            ) : null}
          </Button>
        ),
        cell: ({ row }) => (
          <div className="text-right font-mono tabular-nums">
            {formatCurrency(row.original.markPrice)}
          </div>
        ),
        sortingFn: (rowA, rowB) =>
          parseFloat(rowA.original.markPrice) - parseFloat(rowB.original.markPrice),
      },
      {
        accessorKey: 'liquidationPrice',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="-ml-4 h-8 data-[state=open]:bg-accent"
          >
            {t('columns.liquidationPrice')}
            {column.getIsSorted() === 'asc' ? (
              <IconSortAscending className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <IconSortDescending className="ml-2 h-4 w-4" />
            ) : null}
          </Button>
        ),
        cell: ({ row }) =>
          row.original.liquidationPrice ? (
            <div className="text-right font-mono tabular-nums text-amber-600 dark:text-amber-400">
              {formatCurrency(row.original.liquidationPrice)}
            </div>
          ) : (
            <div className="text-right text-muted-foreground">
              {t('cells.notAvailable')}
            </div>
          ),
        sortingFn: (rowA, rowB) =>
          parseFloat(rowA.original.liquidationPrice || '0') -
          parseFloat(rowB.original.liquidationPrice || '0'),
      },
      {
        accessorKey: 'marketValue',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="-ml-4 h-8 data-[state=open]:bg-accent"
          >
            {t('columns.marketValue')}
            {column.getIsSorted() === 'asc' ? (
              <IconSortAscending className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <IconSortDescending className="ml-2 h-4 w-4" />
            ) : null}
          </Button>
        ),
        cell: ({ row }) => (
          <div className="text-right font-medium font-mono tabular-nums">
            {formatCurrency(row.original.marketValue)}
          </div>
        ),
        sortingFn: (rowA, rowB) =>
          parseFloat(rowA.original.marketValue) - parseFloat(rowB.original.marketValue),
      },
      {
        accessorKey: 'unrealizedPnl',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="-ml-4 h-8 data-[state=open]:bg-accent"
          >
            {t('columns.unrealizedPnl')}
            {column.getIsSorted() === 'asc' ? (
              <IconSortAscending className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <IconSortDescending className="ml-2 h-4 w-4" />
            ) : null}
          </Button>
        ),
        cell: ({ row }) => {
          const pnl = parseFloat(row.original.unrealizedPnl);
          const pnlPct = parseFloat(row.original.pnlPercentage);
          const isPositive = pnl >= 0;

          return (
            <div
              className={cn(
                'text-right font-mono tabular-nums',
                isPositive
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400',
              )}
            >
              <div className="font-medium">
                {isPositive ? '+' : ''}
                {formatCurrency(pnl)}
              </div>
              <div className="text-xs opacity-80">{formatPercentage(pnlPct)}</div>
            </div>
          );
        },
        sortingFn: (rowA, rowB) =>
          parseFloat(rowA.original.unrealizedPnl) -
          parseFloat(rowB.original.unrealizedPnl),
      },
      {
        accessorKey: 'updatedAt',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="-ml-4 h-8 data-[state=open]:bg-accent"
          >
            {t('columns.updated')}
            {column.getIsSorted() === 'asc' ? (
              <IconSortAscending className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === 'desc' ? (
              <IconSortDescending className="ml-2 h-4 w-4" />
            ) : null}
          </Button>
        ),
        cell: ({ row }) => (
          <div className="text-right text-sm text-muted-foreground">
            {formatDate(row.original.updatedAt, locale)}
          </div>
        ),
        sortingFn: (rowA, rowB) =>
          new Date(rowA.original.updatedAt).getTime() -
          new Date(rowB.original.updatedAt).getTime(),
      },
      {
        id: 'actions',
        header: t('columns.actions'),
        cell: ({ row }) => {
          const position = row.original;
          // Hide entirely when the exchange/position doesn't support margin
          // adjustment (e.g. Coinbase, or a cross-margin position).
          if (!position.canAdjustMargin) {
            return <span className="text-muted-foreground">-</span>;
          }

          // 🆕 Icon-only buttons (not full text labels) so this column stays
          // narrow — with 11 columns, wide text buttons here were the main
          // reason the table needed horizontal scrolling on normal desktop
          // widths. Labels are still available via tooltip + aria-label.
          return (
            <div className="flex items-center justify-end gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    onClick={() => openMarginDialog(position, 'add')}
                    aria-label={t('margin.actions.increase')}
                  >
                    <IconPlus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('margin.actions.increase')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    onClick={() => openMarginDialog(position, 'reduce')}
                    aria-label={t('margin.actions.reduce')}
                  >
                    <IconMinus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('margin.actions.reduce')}</TooltipContent>
              </Tooltip>
            </div>
          );
        },
      },
    ],
    [getSideLabel, locale, openMarginDialog, t],
  );

  const fetchData = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedExchange !== 'all') {
        params.set('exchange', selectedExchange);
      }

      const response = await fetch(`/api/portfolio/positions?${params.toString()}`);

      if (response.ok) {
        const data = await response.json();
        setPositions(data.positions || []);
        setExchanges(data.summary?.exchanges || []);
        setTotalPnl(data.summary?.totalUnrealizedPnl || '0');
        setLastRefresh(new Date());
      }
    } catch (error) {
      console.error(t('errors.fetchPositions'), error);
    } finally {
      setLoading(false);
    }
  }, [selectedExchange, t]);

  React.useEffect(() => {
    fetchData();

    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchData, refreshInterval]);

  const handleSubmitMargin = React.useCallback(async () => {
    if (!marginDialog) return;

    const amountNum = parseFloat(marginAmount);
    if (!marginAmount.trim() || !Number.isFinite(amountNum) || amountNum <= 0) {
      setMarginError(t('margin.errors.invalidAmount'));
      return;
    }

    if (marginLimits) {
      const maxAmount = parseFloat(
        marginDialog.type === 'add' ? marginLimits.maxAdd : marginLimits.maxReduce,
      );
      if (Number.isFinite(maxAmount) && amountNum > maxAmount) {
        setMarginError(
          marginDialog.type === 'add'
            ? t('margin.errors.exceedsMaxAdd', {
                amount: formatNumber(maxAmount, 8),
                asset: marginLimits.marginAsset,
              })
            : t('margin.errors.exceedsMaxReduce', {
                amount: formatNumber(maxAmount, 8),
                asset: marginLimits.marginAsset,
              }),
        );
        return;
      }
    }

    setMarginError(null);
    setIsSubmittingMargin(true);
    try {
      const response = await fetch(
        `/api/portfolio/positions/${marginDialog.position.id}/margin`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: marginDialog.type, amount: marginAmount.trim() }),
        },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || t('margin.errors.adjustFailed'));
      }

      toast.success(
        marginDialog.type === 'add'
          ? t('margin.messages.increased')
          : t('margin.messages.reduced'),
      );
      setMarginDialog(null);
      await fetchData();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('margin.errors.adjustFailed');
      setMarginError(message);
      toast.error(message);
    } finally {
      setIsSubmittingMargin(false);
    }
  }, [fetchData, marginAmount, marginDialog, marginLimits, t]);

  const table = useReactTable({
    data: positions,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  React.useEffect(() => {
    if (selectedFilterExchange !== 'all') {
      table.getColumn('exchange')?.setFilterValue(selectedFilterExchange);
    } else {
      table.getColumn('exchange')?.setFilterValue(undefined);
    }
  }, [selectedFilterExchange, table]);

  React.useEffect(() => {
    if (selectedSide !== 'all') {
      table.getColumn('side')?.setFilterValue(selectedSide);
    } else {
      table.getColumn('side')?.setFilterValue(undefined);
    }
  }, [selectedSide, table]);

  const totalPnlNum = parseFloat(totalPnl);
  const isPnlPositive = totalPnlNum >= 0;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-4">
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-10 w-32" />
            </div>
            <Skeleton className="h-[400px] w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <Dialog
        open={Boolean(marginDialog)}
        onOpenChange={(open) => !open && closeMarginDialog()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {marginDialog?.type === 'add'
                ? t('margin.dialog.increaseTitle')
                : t('margin.dialog.reduceTitle')}
            </DialogTitle>
            <DialogDescription>
              {marginDialog
                ? t('margin.dialog.description', {
                    symbol: marginDialog.position.symbol,
                    exchange: marginDialog.position.exchange,
                  })
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="margin-amount">
                {marginLimits
                  ? t('margin.dialog.amountLabelWithAsset', {
                      asset: marginLimits.marginAsset,
                    })
                  : t('margin.dialog.amountLabel')}
              </Label>
              <Input
                id="margin-amount"
                inputMode="decimal"
                placeholder="0.00"
                value={marginAmount}
                onChange={(event) => setMarginAmount(event.target.value)}
                disabled={isSubmittingMargin}
              />
              {marginError && <p className="text-sm text-rose-500">{marginError}</p>}
            </div>
            {isLoadingMarginLimits ? (
              <p className="text-xs text-muted-foreground">
                {t('margin.dialog.loadingLimits')}
              </p>
            ) : marginLimits ? (
              <div className="space-y-1 text-xs text-muted-foreground">
                {marginLimits.currentMargin && (
                  <p>
                    {t('margin.dialog.currentMargin', {
                      amount: formatNumber(marginLimits.currentMargin, 8),
                      asset: marginLimits.marginAsset,
                    })}
                  </p>
                )}
                <p>
                  {marginDialog?.type === 'add'
                    ? t('margin.dialog.maxAdd', {
                        amount: formatNumber(marginLimits.maxAdd, 8),
                        asset: marginLimits.marginAsset,
                      })
                    : t('margin.dialog.maxReduce', {
                        amount: formatNumber(marginLimits.maxReduce, 8),
                        asset: marginLimits.marginAsset,
                      })}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t('margin.dialog.boundsNotAvailable')}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeMarginDialog}
              disabled={isSubmittingMargin}
            >
              {t('margin.actions.cancel')}
            </Button>
            <Button onClick={handleSubmitMargin} disabled={isSubmittingMargin}>
              {isSubmittingMargin
                ? t('margin.actions.submitting')
                : t('margin.actions.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex flex-col gap-1">
          <CardTitle>{t('title')}</CardTitle>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">
              {t('stats.openPositions', { count: positions.length })}
            </span>
            <span
              className={cn(
                'font-medium',
                isPnlPositive
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400',
              )}
            >
              {t('stats.totalPnl')}: {isPnlPositive ? '+' : ''}
              {formatCurrency(totalPnl)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="text-xs text-muted-foreground">
              {t('stats.updated', {
                time: formatDate(lastRefresh.toISOString(), locale),
              })}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={fetchData}>
            <IconRefresh className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex flex-col gap-4 mb-4 md:flex-row md:items-center md:flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('filters.searchPlaceholder')}
              value={globalFilter ?? ''}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-9"
            />
            {globalFilter && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                onClick={() => setGlobalFilter('')}
              >
                <IconX className="h-4 w-4" />
              </Button>
            )}
          </div>

          {exchanges.length > 0 && (
            <div className="flex items-center gap-2">
              <IconFilter className="h-4 w-4 text-muted-foreground" />
              <Select
                value={selectedFilterExchange}
                onValueChange={setSelectedFilterExchange}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder={t('filters.allExchanges')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('filters.allExchanges')}</SelectItem>
                  {exchanges.map((exchange) => (
                    <SelectItem key={exchange} value={exchange}>
                      <div className="flex items-center gap-2">
                        <ExchangeLogo exchange={exchange} className="h-4 w-4" />
                        <span className="capitalize">{exchange}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Select value={selectedSide} onValueChange={setSelectedSide}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder={t('filters.allSides')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('filters.allSides')}</SelectItem>
                <SelectItem value="long">
                  <div className="flex items-center gap-2">
                    <IconTrendingUp className="h-4 w-4 text-emerald-500" />
                    {t('side.long')}
                  </div>
                </SelectItem>
                <SelectItem value="short">
                  <div className="flex items-center gap-2">
                    <IconTrendingDown className="h-4 w-4 text-rose-500" />
                    {t('side.short')}
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(globalFilter ||
            selectedFilterExchange !== 'all' ||
            selectedSide !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setGlobalFilter('');
                setSelectedFilterExchange('all');
                setSelectedSide('all');
              }}
              className="text-muted-foreground"
            >
              <IconX className="h-4 w-4 mr-1" />
              {t('filters.clear')}
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    {globalFilter ||
                    selectedFilterExchange !== 'all' ||
                    selectedSide !== 'all'
                      ? t('empty.filtered')
                      : t('empty.default')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {table.getPageCount() > 1 && (
          <div className="flex items-center justify-between space-x-2 py-4">
            <div className="text-sm text-muted-foreground">
              {t('pagination.showing', {
                start:
                  table.getState().pagination.pageIndex *
                    table.getState().pagination.pageSize +
                  1,
                end: Math.min(
                  (table.getState().pagination.pageIndex + 1) *
                    table.getState().pagination.pageSize,
                  table.getFilteredRowModel().rows.length,
                ),
                total: table.getFilteredRowModel().rows.length,
              })}
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <IconChevronLeft className="h-4 w-4" />
                {t('pagination.previous')}
              </Button>
              <div className="text-sm text-muted-foreground">
                {t('pagination.page', {
                  current: table.getState().pagination.pageIndex + 1,
                  total: table.getPageCount(),
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                {t('pagination.next')}
                <IconChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
