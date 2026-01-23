'use client';

import * as React from 'react';
import {
  IconSearch,
  IconSortAscending,
  IconSortDescending,
  IconFilter,
  IconX,
  IconRefresh,
  IconChevronLeft,
  IconChevronRight,
  IconCalendar,
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconLoader,
  IconAlertCircle,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { getDisplaySymbol, extractBaseCurrency } from '@/lib/exchanges';

interface OrderData {
  id: string;
  clientOrderId?: string;
  symbol: string;
  exchange?: string;
  side: 'BUY' | 'SELL';
  type: string;
  quantity: string;
  price?: string;
  status: string;
  timeInForce: string;
  timestamp: string;
  updateTime?: string;
  executedQuantity?: string;
  cummulativeQuoteQuantity?: string;
  averagePrice?: string;
  strategyId?: number;
  strategyName?: string;
  realizedPnl?: string;
  commission?: string;
  commissionAsset?: string;
}

interface OrdersTableProps {
  selectedExchange?: string;
  selectedStrategy?: number;
  refreshInterval?: number;
}

const formatCurrency = (value: string | number | undefined) => {
  if (value === undefined || value === null) return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '-';

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

const formatNumber = (value: string | number | undefined, decimals: number = 4) => {
  if (value === undefined || value === null) return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '-';

  if (Math.abs(num) >= 1000000) {
    return `${(num / 1000000).toFixed(2)}M`;
  } else if (Math.abs(num) >= 1000) {
    return `${(num / 1000).toFixed(2)}K`;
  }
  return num.toFixed(decimals);
};

const formatDate = (dateStr: string | undefined) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatFullDate = (dateStr: string | undefined) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const getStatusIcon = (status: string) => {
  switch (status.toUpperCase()) {
    case 'FILLED':
      return <IconCircleCheck className="h-4 w-4 text-emerald-500" />;
    case 'CANCELED':
    case 'REJECTED':
    case 'EXPIRED':
      return <IconCircleX className="h-4 w-4 text-rose-500" />;
    case 'PARTIALLY_FILLED':
      return <IconLoader className="h-4 w-4 text-amber-500 animate-spin" />;
    case 'NEW':
      return <IconClock className="h-4 w-4 text-blue-500" />;
    default:
      return <IconAlertCircle className="h-4 w-4 text-muted-foreground" />;
  }
};

const getStatusColor = (status: string) => {
  switch (status.toUpperCase()) {
    case 'FILLED':
      return 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
    case 'CANCELED':
    case 'REJECTED':
      return 'border-rose-500/50 bg-rose-500/10 text-rose-600 dark:text-rose-400';
    case 'EXPIRED':
      return 'border-orange-500/50 bg-orange-500/10 text-orange-600 dark:text-orange-400';
    case 'PARTIALLY_FILLED':
      return 'border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400';
    case 'NEW':
      return 'border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400';
    default:
      return 'border-muted-foreground/50 bg-muted/50 text-muted-foreground';
  }
};

const getSideColor = (side: string) => {
  return side.toUpperCase() === 'BUY'
    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
    : 'border-rose-500/50 bg-rose-500/10 text-rose-600 dark:text-rose-400';
};

const columns: ColumnDef<OrderData>[] = [
  {
    accessorKey: 'timestamp',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="-ml-4 h-8 data-[state=open]:bg-accent"
      >
        Time
        {column.getIsSorted() === 'asc' ? (
          <IconSortAscending className="ml-2 h-4 w-4" />
        ) : column.getIsSorted() === 'desc' ? (
          <IconSortDescending className="ml-2 h-4 w-4" />
        ) : null}
      </Button>
    ),
    cell: ({ row }) => (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="text-sm whitespace-nowrap cursor-help">
              {formatDate(row.original.timestamp)}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{formatFullDate(row.original.timestamp)}</p>
            {row.original.updateTime && (
              <p className="text-xs text-muted-foreground mt-1">
                Updated: {formatFullDate(row.original.updateTime)}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ),
    sortingFn: (rowA, rowB) =>
      new Date(rowA.original.timestamp).getTime() -
      new Date(rowB.original.timestamp).getTime(),
  },
  {
    accessorKey: 'symbol',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="-ml-4 h-8 data-[state=open]:bg-accent"
      >
        Symbol
        {column.getIsSorted() === 'asc' ? (
          <IconSortAscending className="ml-2 h-4 w-4" />
        ) : column.getIsSorted() === 'desc' ? (
          <IconSortDescending className="ml-2 h-4 w-4" />
        ) : null}
      </Button>
    ),
    cell: ({ row }) => {
      const exchange = row.original.exchange || '';
      const displaySymbol = exchange
        ? getDisplaySymbol(row.original.symbol, exchange)
        : row.original.symbol;
      const baseCurrency = extractBaseCurrency(row.original.symbol);
      return (
        <div className="flex items-center gap-2">
          <SymbolIcon symbol={baseCurrency} size="sm" />
          <span className="font-medium font-mono">{displaySymbol}</span>
        </div>
      );
    },
  },
  {
    accessorKey: 'exchange',
    header: 'Exchange',
    cell: ({ row }) => {
      const exchange = row.original.exchange;
      if (!exchange) return <span className="text-muted-foreground">-</span>;
      return (
        <div className="flex items-center gap-2">
          <ExchangeLogo exchange={exchange} className="h-4 w-4" />
          <span className="capitalize text-sm">{exchange}</span>
        </div>
      );
    },
    filterFn: (row, id, value) => {
      if (value === 'all') return true;
      return row.getValue(id) === value;
    },
  },
  {
    accessorKey: 'side',
    header: 'Side',
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className={cn('font-medium', getSideColor(row.original.side))}
      >
        {row.original.side}
      </Badge>
    ),
    filterFn: (row, id, value) => {
      if (value === 'all') return true;
      return row.getValue(id) === value;
    },
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ row }) => (
      <Badge variant="secondary" className="font-mono text-xs">
        {row.original.type}
      </Badge>
    ),
    filterFn: (row, id, value) => {
      if (value === 'all') return true;
      return row.getValue(id) === value;
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
        Quantity
        {column.getIsSorted() === 'asc' ? (
          <IconSortAscending className="ml-2 h-4 w-4" />
        ) : column.getIsSorted() === 'desc' ? (
          <IconSortDescending className="ml-2 h-4 w-4" />
        ) : null}
      </Button>
    ),
    cell: ({ row }) => {
      const qty = formatNumber(row.original.quantity);
      const execQty = row.original.executedQuantity
        ? formatNumber(row.original.executedQuantity)
        : null;
      return (
        <div className="text-right font-mono tabular-nums">
          <div>{qty}</div>
          {execQty && execQty !== qty && (
            <div className="text-xs text-muted-foreground">Filled: {execQty}</div>
          )}
        </div>
      );
    },
    sortingFn: (rowA, rowB) =>
      parseFloat(rowA.original.quantity) - parseFloat(rowB.original.quantity),
  },
  {
    accessorKey: 'price',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="-ml-4 h-8 data-[state=open]:bg-accent"
      >
        Price
        {column.getIsSorted() === 'asc' ? (
          <IconSortAscending className="ml-2 h-4 w-4" />
        ) : column.getIsSorted() === 'desc' ? (
          <IconSortDescending className="ml-2 h-4 w-4" />
        ) : null}
      </Button>
    ),
    cell: ({ row }) => {
      const price = row.original.price;
      const avgPrice = row.original.averagePrice;
      return (
        <div className="text-right font-mono tabular-nums">
          <div>{price ? formatCurrency(price) : 'MARKET'}</div>
          {avgPrice && price !== avgPrice && (
            <div className="text-xs text-muted-foreground">
              Avg: {formatCurrency(avgPrice)}
            </div>
          )}
        </div>
      );
    },
    sortingFn: (rowA, rowB) => {
      const priceA = parseFloat(rowA.original.price || '0');
      const priceB = parseFloat(rowB.original.price || '0');
      return priceA - priceB;
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className={cn('font-medium gap-1', getStatusColor(row.original.status))}
      >
        {getStatusIcon(row.original.status)}
        {row.original.status}
      </Badge>
    ),
    filterFn: (row, id, value) => {
      if (value === 'all') return true;
      return row.getValue(id) === value;
    },
  },
  {
    accessorKey: 'strategyName',
    header: 'Strategy',
    cell: ({ row }) => {
      const name = row.original.strategyName;
      if (!name) return <span className="text-muted-foreground">-</span>;
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="max-w-[120px] truncate cursor-help">
                {name}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>{name}</p>
              {row.original.strategyId && (
                <p className="text-xs text-muted-foreground">
                  ID: {row.original.strategyId}
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    },
  },
  {
    accessorKey: 'realizedPnl',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="-ml-4 h-8 data-[state=open]:bg-accent"
      >
        PnL
        {column.getIsSorted() === 'asc' ? (
          <IconSortAscending className="ml-2 h-4 w-4" />
        ) : column.getIsSorted() === 'desc' ? (
          <IconSortDescending className="ml-2 h-4 w-4" />
        ) : null}
      </Button>
    ),
    cell: ({ row }) => {
      const pnl = row.original.realizedPnl;
      if (!pnl) return <span className="text-muted-foreground text-right">-</span>;

      const pnlNum = parseFloat(pnl);
      const isPositive = pnlNum >= 0;

      return (
        <div
          className={cn(
            'text-right font-mono tabular-nums font-medium',
            isPositive
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-rose-600 dark:text-rose-400',
          )}
        >
          {isPositive ? '+' : ''}
          {formatCurrency(pnl)}
        </div>
      );
    },
    sortingFn: (rowA, rowB) => {
      const pnlA = parseFloat(rowA.original.realizedPnl || '0');
      const pnlB = parseFloat(rowB.original.realizedPnl || '0');
      return pnlA - pnlB;
    },
  },
];

const STATUS_OPTIONS = [
  'all',
  'NEW',
  'FILLED',
  'PARTIALLY_FILLED',
  'CANCELED',
  'REJECTED',
  'EXPIRED',
];
const SIDE_OPTIONS = ['all', 'BUY', 'SELL'];
const TYPE_OPTIONS = [
  'all',
  'MARKET',
  'LIMIT',
  'STOP_LOSS',
  'STOP_LOSS_LIMIT',
  'TAKE_PROFIT',
  'TAKE_PROFIT_LIMIT',
];

// Date range presets
const DATE_PRESETS = [
  { label: 'Today', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: 'All time', days: 0 },
];

export function OrdersTable({
  selectedExchange = 'all',
  selectedStrategy,
  refreshInterval = 30000,
}: OrdersTableProps) {
  const [orders, setOrders] = React.useState<OrderData[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'timestamp', desc: true },
  ]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [exchanges, setExchanges] = React.useState<string[]>([]);
  const [selectedFilterExchange, setSelectedFilterExchange] = React.useState('all');
  const [selectedStatus, setSelectedStatus] = React.useState('all');
  const [selectedSide, setSelectedSide] = React.useState('all');
  const [selectedType, setSelectedType] = React.useState('all');
  const [datePreset, setDatePreset] = React.useState(0); // Default to all time
  const [lastRefresh, setLastRefresh] = React.useState<Date | null>(null);

  const fetchData = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedExchange !== 'all') {
        params.set('exchange', selectedExchange);
      }
      if (selectedStrategy) {
        params.set('strategyId', selectedStrategy.toString());
      }
      if (datePreset > 0) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - datePreset);
        params.set('startDate', startDate.toISOString());
      }

      const response = await fetch(`/api/orders?${params.toString()}`);

      if (response.ok) {
        const data = await response.json();
        // Convert order data
        const ordersData = (data.orders || []).map((order: Record<string, unknown>) => ({
          ...order,
          quantity: order.quantity?.toString() || '0',
          price: order.price?.toString(),
          executedQuantity: order.executedQuantity?.toString(),
          cummulativeQuoteQuantity: order.cummulativeQuoteQuantity?.toString(),
          averagePrice: order.averagePrice?.toString(),
          realizedPnl: order.realizedPnl?.toString(),
          commission: order.commission?.toString(),
        }));
        setOrders(ordersData);

        // Extract unique exchanges
        const uniqueExchanges = [
          ...new Set(ordersData.map((o: OrderData) => o.exchange).filter(Boolean)),
        ] as string[];
        setExchanges(uniqueExchanges);
        setLastRefresh(new Date());
      }
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedExchange, selectedStrategy, datePreset]);

  React.useEffect(() => {
    fetchData();

    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchData, refreshInterval]);

  const table = useReactTable({
    data: orders,
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
        pageSize: 20,
      },
    },
  });

  // Apply column filters
  React.useEffect(() => {
    const newFilters: ColumnFiltersState = [];

    if (selectedFilterExchange !== 'all') {
      newFilters.push({ id: 'exchange', value: selectedFilterExchange });
    }
    if (selectedStatus !== 'all') {
      newFilters.push({ id: 'status', value: selectedStatus });
    }
    if (selectedSide !== 'all') {
      newFilters.push({ id: 'side', value: selectedSide });
    }
    if (selectedType !== 'all') {
      newFilters.push({ id: 'type', value: selectedType });
    }

    setColumnFilters(newFilters);
  }, [selectedFilterExchange, selectedStatus, selectedSide, selectedType]);

  const hasFilters =
    globalFilter ||
    selectedFilterExchange !== 'all' ||
    selectedStatus !== 'all' ||
    selectedSide !== 'all' ||
    selectedType !== 'all';

  const clearFilters = () => {
    setGlobalFilter('');
    setSelectedFilterExchange('all');
    setSelectedStatus('all');
    setSelectedSide('all');
    setSelectedType('all');
  };

  // Calculate statistics from raw orders data (not filtered table model)
  const stats = React.useMemo(() => {
    // Apply the same filters as the column filters
    let filteredOrders = orders;

    if (selectedFilterExchange !== 'all') {
      filteredOrders = filteredOrders.filter(
        (o) => o.exchange === selectedFilterExchange,
      );
    }
    if (selectedStatus !== 'all') {
      filteredOrders = filteredOrders.filter((o) => o.status === selectedStatus);
    }
    if (selectedSide !== 'all') {
      filteredOrders = filteredOrders.filter((o) => o.side === selectedSide);
    }
    if (selectedType !== 'all') {
      filteredOrders = filteredOrders.filter((o) => o.type === selectedType);
    }
    if (globalFilter) {
      const lowerFilter = globalFilter.toLowerCase();
      filteredOrders = filteredOrders.filter(
        (o) =>
          o.symbol.toLowerCase().includes(lowerFilter) ||
          o.id.toLowerCase().includes(lowerFilter) ||
          o.clientOrderId?.toLowerCase().includes(lowerFilter) ||
          o.strategyName?.toLowerCase().includes(lowerFilter),
      );
    }

    const filledOrders = filteredOrders.filter((o) => o.status === 'FILLED');
    const totalPnl = filledOrders.reduce(
      (sum, o) => sum + parseFloat(o.realizedPnl || '0'),
      0,
    );
    const buyOrders = filteredOrders.filter((o) => o.side === 'BUY').length;
    const sellOrders = filteredOrders.filter((o) => o.side === 'SELL').length;

    return {
      total: filteredOrders.length,
      filled: filledOrders.length,
      totalPnl,
      buyOrders,
      sellOrders,
    };
  }, [
    orders,
    selectedFilterExchange,
    selectedStatus,
    selectedSide,
    selectedType,
    globalFilter,
  ]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-4 flex-wrap">
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-10 w-32" />
            </div>
            <Skeleton className="h-[500px] w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex flex-col gap-1">
          <CardTitle>Transaction History</CardTitle>
          <div className="flex items-center gap-4 text-sm flex-wrap">
            <span className="text-muted-foreground">
              {stats.total} order{stats.total !== 1 ? 's' : ''}
              {stats.filled > 0 && ` (${stats.filled} filled)`}
            </span>
            {stats.totalPnl !== 0 && (
              <span
                className={cn(
                  'font-medium',
                  stats.totalPnl >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400',
                )}
              >
                Total PnL: {stats.totalPnl >= 0 ? '+' : ''}
                {formatCurrency(stats.totalPnl)}
              </span>
            )}
            <span className="text-muted-foreground">
              <span className="text-emerald-600 dark:text-emerald-400">
                {stats.buyOrders} buys
              </span>
              {' / '}
              <span className="text-rose-600 dark:text-rose-400">
                {stats.sellOrders} sells
              </span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="text-xs text-muted-foreground hidden md:inline">
              Updated {formatDate(lastRefresh.toISOString())}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={fetchData}>
            <IconRefresh className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters Row 1: Search and Date Range */}
        <div className="flex flex-col gap-4 mb-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search orders..."
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

            <div className="flex items-center gap-2">
              <IconCalendar className="h-4 w-4 text-muted-foreground" />
              <Select
                value={datePreset.toString()}
                onValueChange={(v) => setDatePreset(parseInt(v))}
              >
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Date range" />
                </SelectTrigger>
                <SelectContent>
                  {DATE_PRESETS.map((preset) => (
                    <SelectItem key={preset.days} value={preset.days.toString()}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Filters Row 2: Column Filters */}
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:flex-wrap">
            <div className="flex items-center gap-2">
              <IconFilter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Filters:</span>
            </div>

            {exchanges.length > 0 && (
              <Select
                value={selectedFilterExchange}
                onValueChange={setSelectedFilterExchange}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Exchange" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Exchanges</SelectItem>
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
            )}

            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status === 'all' ? 'All Status' : status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedSide} onValueChange={setSelectedSide}>
              <SelectTrigger className="w-[110px]">
                <SelectValue placeholder="Side" />
              </SelectTrigger>
              <SelectContent>
                {SIDE_OPTIONS.map((side) => (
                  <SelectItem key={side} value={side}>
                    {side === 'all' ? 'All Sides' : side}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type === 'all' ? 'All Types' : type.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-muted-foreground"
              >
                <IconX className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className="whitespace-nowrap">
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
                    {hasFilters
                      ? 'No orders found matching your filters.'
                      : 'No orders found for the selected time period.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {table.getPageCount() > 1 && (
          <div className="flex items-center justify-between space-x-2 py-4">
            <div className="flex items-center gap-4">
              <div className="text-sm text-muted-foreground">
                Showing{' '}
                {table.getState().pagination.pageIndex *
                  table.getState().pagination.pageSize +
                  1}{' '}
                to{' '}
                {Math.min(
                  (table.getState().pagination.pageIndex + 1) *
                    table.getState().pagination.pageSize,
                  table.getFilteredRowModel().rows.length,
                )}{' '}
                of {table.getFilteredRowModel().rows.length} orders
              </div>
              <Select
                value={table.getState().pagination.pageSize.toString()}
                onValueChange={(value) => table.setPageSize(Number(value))}
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 20, 50, 100].map((size) => (
                    <SelectItem key={size} value={size.toString()}>
                      {size} / page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <IconChevronLeft className="h-4 w-4" />
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
                <IconChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
