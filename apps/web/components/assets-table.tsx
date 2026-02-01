'use client';

import * as React from 'react';
import {
  IconSearch,
  IconSortAscending,
  IconSortDescending,
  IconFilter,
  IconX,
} from '@tabler/icons-react';
import {
  Column,
  ColumnDef,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  RowData,
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

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    align?: 'left' | 'right';
  }
}

interface AssetData {
  asset: string;
  exchange: string;
  free: number;
  locked: number;
  total: number;
  percentage: number;
  estimatedValue?: number;
}

interface AssetsTableProps {
  selectedExchange: string;
  refreshInterval?: number;
}

const formatCurrency = (value: number) => {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  } else if (value >= 1000) {
    return `$${(value / 1000).toFixed(2)}K`;
  } else if (value >= 1) {
    return `$${value.toFixed(2)}`;
  } else if (value >= 0.0001) {
    return `$${value.toFixed(4)}`;
  }
  return `$${value.toFixed(8)}`;
};

const formatNumber = (value: number) => {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M`;
  } else if (value >= 1000) {
    return `${(value / 1000).toFixed(2)}K`;
  } else if (value >= 1) {
    return value.toFixed(4);
  } else if (value >= 0.0001) {
    return value.toFixed(6);
  }
  return value.toFixed(8);
};

const getAssetValue = (asset: AssetData) => {
  return asset.estimatedValue ?? asset.total;
};

const renderSortableHeader = (
  label: string,
  column: Column<AssetData, unknown>,
  align: 'left' | 'right' = 'left',
) => (
  <div className={align === 'right' ? 'flex w-full justify-end' : 'flex w-full'}>
    <Button
      variant="ghost"
      onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      className={
        align === 'right'
          ? 'h-8 px-2 data-[state=open]:bg-accent'
          : '-ml-4 h-8 data-[state=open]:bg-accent'
      }
    >
      {label}
      {column.getIsSorted() === 'asc' ? (
        <IconSortAscending className="ml-2 h-4 w-4" />
      ) : column.getIsSorted() === 'desc' ? (
        <IconSortDescending className="ml-2 h-4 w-4" />
      ) : null}
    </Button>
  </div>
);

const columns: ColumnDef<AssetData>[] = [
  {
    accessorKey: 'asset',
    header: ({ column }) => renderSortableHeader('Asset', column),
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <SymbolIcon symbol={row.original.asset} size="md" />
        <span className="font-medium">{row.original.asset}</span>
      </div>
    ),
  },
  {
    accessorKey: 'exchange',
    header: 'Exchange',
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
    accessorKey: 'free',
    meta: { align: 'right' },
    header: ({ column }) => renderSortableHeader('Available', column, 'right'),
    cell: ({ row }) => (
      <div className="text-right tabular-nums">{formatNumber(row.original.free)}</div>
    ),
  },
  {
    accessorKey: 'locked',
    meta: { align: 'right' },
    header: ({ column }) => renderSortableHeader('Locked', column, 'right'),
    cell: ({ row }) => (
      <div className="text-right tabular-nums text-muted-foreground">
        {row.original.locked > 0 ? formatNumber(row.original.locked) : '-'}
      </div>
    ),
  },
  {
    id: 'totalValue',
    accessorFn: (row) => getAssetValue(row),
    meta: { align: 'right' },
    header: ({ column }) => renderSortableHeader('Total Value', column, 'right'),
    cell: ({ row }) => (
      <div className="text-right font-medium tabular-nums">
        {formatCurrency(getAssetValue(row.original))}
      </div>
    ),
  },
  {
    accessorKey: 'percentage',
    header: ({ column }) => renderSortableHeader('Allocation', column),
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${Math.min(row.original.percentage, 100)}%` }}
          />
        </div>
        <span className="text-sm tabular-nums text-muted-foreground w-14 text-right">
          {row.original.percentage.toFixed(1)}%
        </span>
      </div>
    ),
  },
];

export function AssetsTable({
  selectedExchange,
  refreshInterval = 10000,
}: AssetsTableProps) {
  const [assets, setAssets] = React.useState<AssetData[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'totalValue', desc: true },
  ]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [exchanges, setExchanges] = React.useState<string[]>([]);
  const [selectedFilterExchange, setSelectedFilterExchange] = React.useState('all');

  React.useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(
          `/api/portfolio/assets?exchange=${selectedExchange}&minValue=1`,
        );

        if (response.ok) {
          const data = await response.json();
          setAssets(data.assets || []);
          setExchanges(data.summary?.exchanges || []);
        }
      } catch (error) {
        console.error('Failed to fetch assets:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [selectedExchange, refreshInterval]);

  const table = useReactTable({
    data: assets,
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

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Assets</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-4">
              <Skeleton className="h-10 w-64" />
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
        <CardTitle>Assets</CardTitle>
        <Badge variant="secondary">{assets.length} assets</Badge>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex flex-col gap-4 mb-4 @md:flex-row @md:items-center">
          <div className="relative flex-1 max-w-sm">
            <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search assets..."
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

          {exchanges.length > 1 && selectedExchange === 'all' && (
            <div className="flex items-center gap-2">
              <IconFilter className="h-4 w-4 text-muted-foreground" />
              <Select
                value={selectedFilterExchange}
                onValueChange={setSelectedFilterExchange}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="All Exchanges" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Exchanges</SelectItem>
                  {exchanges.map((exchange) => (
                    <SelectItem key={exchange} value={exchange}>
                      <span className="capitalize">{exchange}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={
                        header.column.columnDef.meta?.align === 'right'
                          ? 'text-right'
                          : 'text-left'
                      }
                    >
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
                      <TableCell
                        key={cell.id}
                        className={
                          cell.column.columnDef.meta?.align === 'right'
                            ? 'text-right'
                            : 'text-left'
                        }
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    {globalFilter
                      ? 'No assets found matching your search.'
                      : 'No assets found.'}
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
              Showing{' '}
              {table.getState().pagination.pageIndex *
                table.getState().pagination.pageSize +
                1}{' '}
              to{' '}
              {Math.min(
                (table.getState().pagination.pageIndex + 1) *
                  table.getState().pagination.pageSize,
                assets.length,
              )}{' '}
              of {assets.length} assets
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                Previous
              </Button>
              <div className="text-sm text-muted-foreground">
                Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
