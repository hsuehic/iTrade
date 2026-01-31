'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
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
import { cn } from '@/lib/utils';
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
}

interface PositionsTableProps {
  selectedExchange?: string;
  refreshInterval?: number;
}

const formatCurrency = (value: string | number) => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '$0.00';

  if (Math.abs(num) >= 1000000) {
    return `$${(num / 1000000).toFixed(2)}M`;
  } else if (Math.abs(num) >= 1000) {
    return `$${(num / 1000).toFixed(2)}K`;
  } else if (Math.abs(num) >= 1) {
    return `$${num.toFixed(2)}`;
  } else if (Math.abs(num) >= 0.0001) {
    return `$${num.toFixed(4)}`;
  }
  return `$${num.toFixed(8)}`;
};

const formatNumber = (value: string | number, decimals: number = 4) => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0';

  if (Math.abs(num) >= 1000000) {
    return `${(num / 1000000).toFixed(2)}M`;
  } else if (Math.abs(num) >= 1000) {
    return `${(num / 1000).toFixed(2)}K`;
  }
  return num.toFixed(decimals);
};

const formatPercentage = (value: string | number) => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0.00%';
  return `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`;
};

const formatDate = (dateStr: string, locale: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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

  const getSideLabel = React.useCallback(
    (side: string) =>
      side === 'long' ? t('side.long') : side === 'short' ? t('side.short') : side,
    [t],
  );

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
              <SymbolIcon symbol={baseCurrency} size="md" />
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
    ],
    [getSideLabel, locale, t],
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
