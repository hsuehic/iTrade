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

// Local mirror of core types — this table intentionally has NO overlap with
// TransferType/TransferEntity (deposits/withdrawals). See
// packages/data-manager/src/entities/InternalTransfer.ts for why these live
// in a separate table.
enum TransferStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELED = 'CANCELED',
}
interface InternalTransfer {
  id: string;
  exchange: string;
  accountId?: number;
  asset: string;
  amount: { toString(): string };
  fromWallet: string;
  toWallet: string;
  status: TransferStatus;
  timestamp: Date;
  providerTransactionId?: string;
}

interface InternalTransfersTableProps {
  selectedExchange: string;
}

type StatusFilter = 'all' | 'COMPLETED' | 'PENDING' | 'FAILED' | 'CANCELED';

const DEFAULT_STATUS: StatusFilter = 'all';

/** Debounce a value so filter inputs don't fire a request per keystroke. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function InternalTransfersTable({
  selectedExchange,
}: InternalTransfersTableProps) {
  const locale = useLocale();
  const t = useTranslations('portfolio.internalTransfers');

  const [timeRange, setTimeRange] = useState('30d');
  const [transfers, setTransfers] = useState<InternalTransfer[]>([]);
  const [loading, setLoading] = useState(true);

  const [status, setStatus] = useState<StatusFilter>(DEFAULT_STATUS);
  const [keyword, setKeyword] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');

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

        const response = await fetch(
          `/api/analytics/internal-transfers?${params.toString()}`,
        );
        if (!response.ok) {
          throw new Error('Failed to fetch internal transfers');
        }

        const data: { transfers: InternalTransfer[] } = await response.json();
        if (cancelled) return;
        setTransfers(data.transfers || []);
      } catch (error) {
        console.error('Failed to load internal transfers:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchTransfers();
    return () => {
      cancelled = true;
    };
  }, [selectedExchange, timeRange, status, debouncedKeyword, debouncedMin, debouncedMax]);

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

  const translateWallet = (wallet: string): string => {
    const upper = wallet.toUpperCase();
    if (
      upper === 'FUNDING' ||
      upper === 'SPOT' ||
      upper === 'PERPETUAL' ||
      upper === 'TRADING'
    ) {
      return t(
        `wallets.${upper}` as
          | 'wallets.FUNDING'
          | 'wallets.SPOT'
          | 'wallets.PERPETUAL'
          | 'wallets.TRADING',
      );
    }
    return wallet;
  };

  const hasActiveFilters =
    status !== DEFAULT_STATUS ||
    keyword.trim() !== '' ||
    minAmount.trim() !== '' ||
    maxAmount.trim() !== '';

  const resetFilters = () => {
    setStatus(DEFAULT_STATUS);
    setKeyword('');
    setMinAmount('');
    setMaxAmount('');
  };

  return (
    <div className="space-y-4">
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
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
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
              {t('filters.resultCount', { shown: transfers.length })}
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
                    <TableHead>{t('columns.asset')}</TableHead>
                    <TableHead>{t('columns.route')}</TableHead>
                    <TableHead className="text-right">{t('columns.amount')}</TableHead>
                    <TableHead>{t('columns.status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transfers.map((transfer) => (
                    <TableRow key={transfer.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(transfer.timestamp, locale)}
                      </TableCell>
                      <TableCell className="capitalize">{transfer.exchange}</TableCell>
                      <TableCell className="font-medium">{transfer.asset}</TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {translateWallet(transfer.fromWallet)} {'→'}{' '}
                        {translateWallet(transfer.toWallet)}
                      </TableCell>
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
