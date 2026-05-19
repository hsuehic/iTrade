'use client';

import { useState, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatDate } from '@/lib/utils';

// Local mirror of core types — keeps this file working while core dist is stale.
enum TransferType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAW = 'WITHDRAW',
}
enum TransferStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELED = 'CANCELED',
}
interface Transfer {
  id: string;
  type: TransferType;
  asset: string;
  amount: { toString(): string };
  status: TransferStatus;
  timestamp: Date;
  network?: string;
  txId?: string;
  exchange?: string;
}

interface TransfersTableProps {
  selectedExchange: string;
}

type DirectionFilter = 'all' | 'DEPOSIT' | 'WITHDRAW';
type StatusFilter = 'all' | 'COMPLETED' | 'PENDING' | 'FAILED' | 'CANCELED';

const DEFAULT_DIRECTION: DirectionFilter = 'all';
const DEFAULT_STATUS: StatusFilter = 'all';

interface PerAssetSummary {
  asset: string;
  deposit: string;
  withdrawal: string;
  net: string;
}

interface TransfersResponse {
  transfers: Transfer[];
  summary: {
    totalCount: number;
    perAsset: PerAssetSummary[];
  };
}

/**
 * Debounce a value so we don't fire an API request on every keystroke for the
 * keyword / minAmount / maxAmount inputs.
 */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function TransfersTable({ selectedExchange }: TransfersTableProps) {
  const locale = useLocale();
  const t = useTranslations('portfolio.transfers');

  const [timeRange, setTimeRange] = useState('30d');
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [summary, setSummary] = useState<{
    totalCount: number;
    perAsset: PerAssetSummary[];
  }>({ totalCount: 0, perAsset: [] });
  const [loading, setLoading] = useState(true);

  // ── Server-side filters ─────────────────────────────────────────────────
  const [direction, setDirection] = useState<DirectionFilter>(DEFAULT_DIRECTION);
  const [status, setStatus] = useState<StatusFilter>(DEFAULT_STATUS);
  const [keyword, setKeyword] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');

  // Debounce text/number inputs (300ms is enough to avoid a request per
  // keystroke without feeling laggy).
  const debouncedKeyword = useDebouncedValue(keyword, 300);
  const debouncedMin = useDebouncedValue(minAmount, 300);
  const debouncedMax = useDebouncedValue(maxAmount, 300);

  useEffect(() => {
    let cancelled = false;
    const fetchTransfers = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (selectedExchange && selectedExchange !== 'all') {
          params.set('exchange', selectedExchange);
        }

        if (timeRange !== 'all') {
          const startDate = new Date();
          if (timeRange === '1d') startDate.setDate(startDate.getDate() - 1);
          if (timeRange === '7d') startDate.setDate(startDate.getDate() - 7);
          if (timeRange === '30d') startDate.setDate(startDate.getDate() - 30);
          if (timeRange === '90d') startDate.setDate(startDate.getDate() - 90);
          params.set('startDate', startDate.toISOString());
        }

        if (direction !== 'all') params.set('direction', direction);
        if (status !== 'all') params.set('status', status);
        if (debouncedKeyword.trim() !== '') {
          params.set('keyword', debouncedKeyword.trim());
        }
        if (debouncedMin.trim() !== '' && Number.isFinite(Number(debouncedMin))) {
          params.set('minAmount', debouncedMin.trim());
        }
        if (debouncedMax.trim() !== '' && Number.isFinite(Number(debouncedMax))) {
          params.set('maxAmount', debouncedMax.trim());
        }

        const response = await fetch(`/api/analytics/transfers?${params.toString()}`);
        if (!response.ok) {
          throw new Error('Failed to fetch transfers');
        }

        const data: TransfersResponse = await response.json();
        if (cancelled) return;
        setTransfers(data.transfers || []);
        setSummary(data.summary ?? { totalCount: 0, perAsset: [] });
      } catch (error) {
        console.error('Failed to load transfers:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchTransfers();
    return () => {
      cancelled = true;
    };
  }, [
    selectedExchange,
    timeRange,
    direction,
    status,
    debouncedKeyword,
    debouncedMin,
    debouncedMax,
  ]);

  const getStatusColor = (s: string) => {
    switch (s.toUpperCase()) {
      case 'COMPLETED':
        return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
      case 'PENDING':
        return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
      case 'FAILED':
      case 'CANCELED':
        return 'bg-rose-500/15 text-rose-600 dark:text-rose-400';
      default:
        return 'bg-slate-500/15 text-slate-600 dark:text-slate-400';
    }
  };

  const getTypeColor = (type: string) => {
    if (type.toUpperCase() === 'DEPOSIT') {
      return 'text-emerald-600 dark:text-emerald-400';
    }
    return 'text-rose-600 dark:text-rose-400';
  };

  const translateType = (type: string): string => {
    const upper = type.toUpperCase();
    if (upper === 'DEPOSIT' || upper === 'WITHDRAW') {
      return t(`type.${upper}` as 'type.DEPOSIT' | 'type.WITHDRAW');
    }
    return type;
  };

  const translateStatus = (s: string): string => {
    const upper = s.toUpperCase();
    if (
      upper === 'COMPLETED' ||
      upper === 'PENDING' ||
      upper === 'FAILED' ||
      upper === 'CANCELED'
    ) {
      return t(
        `status.${upper}` as
          | 'status.COMPLETED'
          | 'status.PENDING'
          | 'status.FAILED'
          | 'status.CANCELED',
      );
    }
    return s;
  };

  const hasActiveFilters =
    direction !== DEFAULT_DIRECTION ||
    status !== DEFAULT_STATUS ||
    keyword.trim() !== '' ||
    minAmount.trim() !== '' ||
    maxAmount.trim() !== '';

  const resetFilters = () => {
    setDirection(DEFAULT_DIRECTION);
    setStatus(DEFAULT_STATUS);
    setKeyword('');
    setMinAmount('');
    setMaxAmount('');
  };

  const fmtAssetAmount = (raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return raw;
    return n.toFixed(4).replace(/\.?0+$/, '');
  };

  return (
    <div className="space-y-4">
      {summary.perAsset.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {summary.perAsset.map((s) => {
            const net = Number(s.net) || 0;
            return (
              <Card key={s.asset}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {t('summary.assetSummary', { asset: s.asset })}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {net >= 0 ? '+' : ''}
                    {fmtAssetAmount(s.net)} {s.asset}
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                    <span className="text-emerald-500">
                      {t('summary.in', { amount: fmtAssetAmount(s.deposit) })}
                    </span>
                    <span className="text-rose-500">
                      {t('summary.out', { amount: fmtAssetAmount(s.withdrawal) })}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 pb-2 md:flex-row md:items-center md:justify-between">
          <CardTitle>{t('history.title')}</CardTitle>
          <div className="flex items-center gap-2">
            <ToggleGroup
              type="single"
              value={timeRange}
              onValueChange={(value) => value && setTimeRange(value)}
              variant="outline"
              className="hidden *:data-[slot=toggle-group-item]:!px-3 md:flex"
            >
              <ToggleGroupItem value="all">{t('timeRange.all')}</ToggleGroupItem>
              <ToggleGroupItem value="90d">{t('timeRange.90d')}</ToggleGroupItem>
              <ToggleGroupItem value="30d">{t('timeRange.30d')}</ToggleGroupItem>
              <ToggleGroupItem value="7d">{t('timeRange.7d')}</ToggleGroupItem>
              <ToggleGroupItem value="1d">{t('timeRange.1d')}</ToggleGroupItem>
            </ToggleGroup>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[100px] md:hidden">
                <SelectValue placeholder={t('timeRange.placeholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('timeRange.allLong')}</SelectItem>
                <SelectItem value="90d">{t('timeRange.90dLong')}</SelectItem>
                <SelectItem value="30d">{t('timeRange.30dLong')}</SelectItem>
                <SelectItem value="7d">{t('timeRange.7dLong')}</SelectItem>
                <SelectItem value="1d">{t('timeRange.1dLong')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Server-side filter bar. Each change kicks a new /api/analytics/transfers request. */}
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                {t('filters.direction')}
              </label>
              <Select
                value={direction}
                onValueChange={(v) => setDirection(v as DirectionFilter)}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('filters.directionAll')}</SelectItem>
                  <SelectItem value="DEPOSIT">{t('type.DEPOSIT')}</SelectItem>
                  <SelectItem value="WITHDRAW">{t('type.WITHDRAW')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                {t('filters.status')}
              </label>
              <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('filters.statusAll')}</SelectItem>
                  <SelectItem value="COMPLETED">{t('status.COMPLETED')}</SelectItem>
                  <SelectItem value="PENDING">{t('status.PENDING')}</SelectItem>
                  <SelectItem value="FAILED">{t('status.FAILED')}</SelectItem>
                  <SelectItem value="CANCELED">{t('status.CANCELED')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-1 flex-col gap-1 min-w-[200px]">
              <label className="text-xs font-medium text-muted-foreground">
                {t('filters.keyword')}
              </label>
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={t('filters.keywordPlaceholder')}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                {t('filters.minAmount')}
              </label>
              <Input
                type="number"
                inputMode="decimal"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                placeholder="0"
                className="w-[120px]"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                {t('filters.maxAmount')}
              </label>
              <Input
                type="number"
                inputMode="decimal"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
                placeholder="∞"
                className="w-[120px]"
              />
            </div>

            <div className="flex items-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                disabled={!hasActiveFilters}
              >
                {t('filters.reset')}
              </Button>
            </div>
          </div>

          {!loading && (
            <div className="text-xs text-muted-foreground">
              {t('filters.resultCount', {
                shown: transfers.length,
                total: summary.totalCount,
              })}
            </div>
          )}

          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-12 w-full" />
                </div>
              ))}
            </div>
          ) : transfers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="text-muted-foreground">
                {hasActiveFilters ? t('history.emptyFiltered') : t('history.empty')}
              </div>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('columns.time')}</TableHead>
                    <TableHead>{t('columns.exchange')}</TableHead>
                    <TableHead>{t('columns.type')}</TableHead>
                    <TableHead>{t('columns.asset')}</TableHead>
                    <TableHead className="text-right">{t('columns.amount')}</TableHead>
                    <TableHead>{t('columns.status')}</TableHead>
                    <TableHead>{t('columns.networkTxId')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transfers.map((transfer) => (
                    <TableRow key={transfer.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(transfer.timestamp, locale)}
                      </TableCell>
                      <TableCell className="capitalize">{transfer.exchange}</TableCell>
                      <TableCell>
                        <span className={`font-medium ${getTypeColor(transfer.type)}`}>
                          {translateType(transfer.type)}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">{transfer.asset}</TableCell>
                      <TableCell className="text-right">
                        {transfer.amount.toString()}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={getStatusColor(transfer.status)}
                        >
                          {translateStatus(transfer.status)}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className="max-w-[200px] truncate text-xs font-mono"
                        title={transfer.txId || ''}
                      >
                        {transfer.network && <div>{transfer.network}</div>}
                        {transfer.txId && (
                          <div className="text-muted-foreground truncate">
                            {transfer.txId}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
