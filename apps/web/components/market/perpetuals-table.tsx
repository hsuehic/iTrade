'use client';

import { memo, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, SlidersHorizontal, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PerpetualTickerRow } from './perpetual-ticker-row';
import { cn } from '@/lib/utils';
import { type PerpetualTicker, type MarketFilter } from '@/lib/market-types';

interface PerpetualsTableProps {
  tickers: PerpetualTicker[];
  onSelectTicker?: (ticker: PerpetualTicker) => void;
  className?: string;
}

type SortField = 'symbol' | 'price' | 'change' | 'volume' | 'funding';
type SortDirection = 'asc' | 'desc';

const TableHeader = memo(function TableHeader({
  field,
  label,
  sortField,
  sortDirection,
  onSort,
  align = 'left',
  colSpan = 1,
}: {
  field: SortField;
  label: string;
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  align?: 'left' | 'right' | 'center';
  colSpan?: number;
}) {
  const isActive = sortField === field;

  return (
    <div
      className={cn(
        'flex cursor-pointer select-none items-center gap-1 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground',
        align === 'right' && 'justify-end',
        align === 'center' && 'justify-center',
        `col-span-${colSpan}`,
      )}
      onClick={() => onSort(field)}
    >
      <span>{label}</span>
      {isActive ? (
        sortDirection === 'asc' ? (
          <ArrowUp className="size-3" />
        ) : (
          <ArrowDown className="size-3" />
        )
      ) : (
        <ArrowUpDown className="size-3 opacity-30" />
      )}
    </div>
  );
});

export const PerpetualsTable = memo(function PerpetualsTable({
  tickers,
  onSelectTicker,
  className,
}: PerpetualsTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<MarketFilter>('all');
  const [sortField, setSortField] = useState<SortField>('volume');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const filteredAndSortedTickers = useMemo(() => {
    let result = [...tickers];

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.base.toLowerCase().includes(query) || t.symbol.toLowerCase().includes(query),
      );
    }

    // Apply filter
    switch (filter) {
      case 'gainers':
        result = result.filter((t) => t.change24h > 0);
        break;
      case 'losers':
        result = result.filter((t) => t.change24h < 0);
        break;
      case 'volume':
        result = result.filter((t) => t.volume24h > 100_000_000); // > $100M
        break;
      case 'funding':
        result = result.filter((t) => Math.abs(t.fundingRate) > 0.0003); // > 0.03%
        break;
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'symbol':
          comparison = a.base.localeCompare(b.base);
          break;
        case 'price':
          comparison = a.price - b.price;
          break;
        case 'change':
          comparison = a.change24h - b.change24h;
          break;
        case 'volume':
          comparison = a.volume24h - b.volume24h;
          break;
        case 'funding':
          comparison = a.fundingRate - b.fundingRate;
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [tickers, searchQuery, filter, sortField, sortDirection]);

  const filterOptions: { value: MarketFilter; label: string }[] = [
    { value: 'all', label: 'All Perpetuals' },
    { value: 'gainers', label: 'Gainers Only' },
    { value: 'losers', label: 'Losers Only' },
    { value: 'volume', label: 'High Volume (>$100M)' },
    { value: 'funding', label: 'Notable Funding' },
  ];

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2">
            <span className="bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">
              Perpetual Futures
            </span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-normal text-primary">
              {filteredAndSortedTickers.length} markets
            </span>
          </CardTitle>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-48 pl-9"
              />
            </div>

            {/* Filter dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <SlidersHorizontal className="size-4" />
                  <span className="hidden sm:inline">
                    {filterOptions.find((f) => f.value === filter)?.label}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {filterOptions.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => setFilter(option.value)}
                    className={cn(filter === option.value && 'bg-accent')}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* Table header */}
        {/* Table body with sticky header */}
        <div className="overflow-y-auto overflow-x-hidden">
          {/* Table header */}
          <div className="sticky top-0 z-10 bg-card grid grid-cols-12 gap-2 border-b px-4 py-2">
            <div className="col-span-1 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              #
            </div>
            <TableHeader
              field="symbol"
              label="Symbol"
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
              colSpan={2}
            />
            <TableHeader
              field="price"
              label="Price"
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
              align="right"
              colSpan={2}
            />
            <TableHeader
              field="change"
              label="24h Change"
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
              align="right"
              colSpan={2}
            />
            <TableHeader
              field="volume"
              label="Volume"
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
              align="right"
              colSpan={2}
            />
            <TableHeader
              field="funding"
              label="Funding"
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
              align="right"
              colSpan={1}
            />
            <div className="col-span-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Chart
            </div>
          </div>
          {filteredAndSortedTickers.map((ticker, index) => (
            <motion.div
              key={`${ticker.exchange}-${ticker.symbol}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, delay: Math.min(index * 0.02, 0.5) }}
            >
              <PerpetualTickerRow
                ticker={ticker}
                rank={index + 1}
                onSelect={onSelectTicker}
              />
            </motion.div>
          ))}

          {filteredAndSortedTickers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Search className="mb-2 size-8" />
              <p>No perpetuals found</p>
              {searchQuery && (
                <p className="text-sm">Try adjusting your search or filter</p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
});
