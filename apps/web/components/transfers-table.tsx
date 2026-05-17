'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
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
import { Transfer } from '@itrade/core';

interface TransfersTableProps {
  selectedExchange: string;
}

export function TransfersTable({ selectedExchange }: TransfersTableProps) {
  const locale = useLocale();
  const [timeRange, setTimeRange] = useState('30d');
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

        const response = await fetch(`/api/analytics/transfers?${params.toString()}`);
        if (!response.ok) {
          throw new Error('Failed to fetch transfers');
        }

        const data = await response.json();
        setTransfers(data.transfers || []);
      } catch (error) {
        console.error('Failed to load transfers:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTransfers();
  }, [selectedExchange, timeRange]);

  const getStatusColor = (status: string) => {
    switch (status.toUpperCase()) {
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

  const stats = transfers.reduce(
    (acc, t) => {
      if (t.status === 'COMPLETED') {
        const asset = t.asset.toUpperCase();
        if (!acc[asset]) {
          acc[asset] = { deposit: 0, withdrawal: 0, net: 0 };
        }
        const amt = Number(t.amount);
        if (t.type === 'DEPOSIT') {
          acc[asset].deposit += amt;
          acc[asset].net += amt;
        } else if (t.type === 'WITHDRAW') {
          acc[asset].withdrawal += amt;
          acc[asset].net -= amt;
        }
      }
      return acc;
    },
    {} as Record<string, { deposit: number; withdrawal: number; net: number }>,
  );

  return (
    <div className="space-y-4">
      {Object.keys(stats).length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {Object.entries(stats).map(([asset, s]) => (
            <Card key={asset}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {asset} Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {s.net >= 0 ? '+' : ''}
                  {s.net.toFixed(4).replace(/\.?0+$/, '')} {asset}
                </div>
                <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                  <span className="text-emerald-500">
                    In: {s.deposit.toFixed(4).replace(/\.?0+$/, '')}
                  </span>
                  <span className="text-rose-500">
                    Out: {s.withdrawal.toFixed(4).replace(/\.?0+$/, '')}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Transfer History</CardTitle>
          <div className="flex items-center gap-2">
            <ToggleGroup
              type="single"
              value={timeRange}
              onValueChange={(value) => value && setTimeRange(value)}
              variant="outline"
              className="hidden *:data-[slot=toggle-group-item]:!px-3 md:flex"
            >
              <ToggleGroupItem value="all">All</ToggleGroupItem>
              <ToggleGroupItem value="90d">90d</ToggleGroupItem>
              <ToggleGroupItem value="30d">30d</ToggleGroupItem>
              <ToggleGroupItem value="7d">7d</ToggleGroupItem>
              <ToggleGroupItem value="1d">1d</ToggleGroupItem>
            </ToggleGroup>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[100px] md:hidden">
                <SelectValue placeholder="30d" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="90d">90 days</SelectItem>
                <SelectItem value="30d">30 days</SelectItem>
                <SelectItem value="7d">7 days</SelectItem>
                <SelectItem value="1d">24 hours</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
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
                No transfers found for the selected exchange.
              </div>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Exchange</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Asset</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Network / TxId</TableHead>
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
                          {transfer.type}
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
                          {transfer.status}
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
