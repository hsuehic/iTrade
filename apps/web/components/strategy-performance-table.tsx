'use client';

import { useEffect, useState } from 'react';
import { IconTrendingDown, IconTrendingUp, IconCheck, IconX } from '@tabler/icons-react';
import { useLocale, useTranslations } from 'next-intl';

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
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExchangeLogo } from '@/components/exchange-logo';
import { SymbolIcon } from '@/components/symbol-icon';

interface Strategy {
  id: number;
  name: string;
  symbol: string;
  exchange: string;
  status: string;
  totalPnl: number;
  roi: string;
  totalOrders: number;
  filledOrders: number;
  fillRate: string;
  normalizedSymbol?: string;
  marketType?: string;
}

interface ExchangeStats {
  exchange: string;
  count: number;
  totalPnl: number;
  activeCount: number;
}

interface SymbolStats {
  symbol: string;
  count: number;
  totalPnl: number;
  activeCount: number;
  normalizedSymbol?: string;
  marketType?: string;
}

const StrategySymbol = ({
  strategy,
}: {
  strategy: { symbol: string; normalizedSymbol?: string; marketType?: string };
}) => {
  return (
    <div className="flex items-center gap-2">
      <SymbolIcon symbol={strategy.symbol} size="sm" />
      <div className="flex flex-col">
        <span className="font-mono text-sm">{strategy.symbol}</span>
        {strategy.normalizedSymbol && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            {strategy.normalizedSymbol}
            {strategy.marketType === 'perpetual' && ' ⚡'}
          </span>
        )}
      </div>
    </div>
  );
};

export function StrategyPerformanceTable() {
  const t = useTranslations('dashboard.performance');
  const locale = useLocale();
  const [topStrategies, setTopStrategies] = useState<Strategy[]>([]);
  const [exchangeStats, setExchangeStats] = useState<ExchangeStats[]>([]);
  const [symbolStats, setSymbolStats] = useState<SymbolStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/analytics/strategies?limit=10');
        if (response.ok) {
          const data = await response.json();
          setTopStrategies(data.topPerformers || []);
          setExchangeStats(data.byExchange || []);
          setSymbolStats(data.bySymbol || []);
        }
      } catch (error) {
        console.error('Failed to fetch strategy data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Refresh every minute
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="strategies" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="strategies">{t('tabs.strategies')}</TabsTrigger>
            <TabsTrigger value="exchanges">{t('tabs.exchanges')}</TabsTrigger>
            <TabsTrigger value="symbols">{t('tabs.symbols')}</TabsTrigger>
          </TabsList>

          <TabsContent value="strategies" className="mt-4">
            {topStrategies.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                {t('empty.strategies')}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('table.strategy')}</TableHead>
                      <TableHead>{t('table.symbol')}</TableHead>
                      <TableHead>{t('table.exchange')}</TableHead>
                      <TableHead className="text-right">{t('table.pnl')}</TableHead>
                      <TableHead className="text-right">{t('table.roi')}</TableHead>
                      <TableHead className="text-right">{t('table.orders')}</TableHead>
                      <TableHead className="text-center">{t('table.status')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topStrategies.map((strategy) => (
                      <TableRow key={strategy.id}>
                        <TableCell className="font-medium">{strategy.name}</TableCell>
                        <TableCell>
                          <StrategySymbol strategy={strategy} />
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="flex items-center gap-1.5 w-fit capitalize"
                          >
                            <ExchangeLogo exchange={strategy.exchange} size="sm" />
                            {strategy.exchange}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={
                              strategy.totalPnl >= 0
                                ? 'font-medium text-green-600 dark:text-green-400'
                                : 'font-medium text-red-600 dark:text-red-400'
                            }
                          >
                            {formatCurrency(strategy.totalPnl)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {parseFloat(strategy.roi) >= 0 ? (
                              <IconTrendingUp className="size-3 text-green-500" />
                            ) : (
                              <IconTrendingDown className="size-3 text-red-500" />
                            )}
                            <span
                              className={
                                parseFloat(strategy.roi) >= 0
                                  ? 'text-green-600 dark:text-green-400'
                                  : 'text-red-600 dark:text-red-400'
                              }
                            >
                              {strategy.roi}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {strategy.filledOrders}/{strategy.totalOrders}
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({strategy.fillRate}%)
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {strategy.status === 'active' ? (
                            <Badge className="bg-green-500/10 text-green-700 dark:text-green-400">
                              <IconCheck className="size-3" />
                              {t('status.active')}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <IconX className="size-3" />
                              {t('status.inactive')}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="exchanges" className="mt-4">
            {exchangeStats.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                {t('empty.exchanges')}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('table.exchange')}</TableHead>
                      <TableHead className="text-right">
                        {t('table.totalStrategies')}
                      </TableHead>
                      <TableHead className="text-right">{t('table.active')}</TableHead>
                      <TableHead className="text-right">{t('table.totalPnl')}</TableHead>
                      <TableHead className="text-right">{t('table.avgPnl')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exchangeStats.map((stat) => {
                      const avgPnl = stat.totalPnl / Math.max(stat.count, 1);
                      return (
                        <TableRow key={stat.exchange}>
                          <TableCell className="font-medium capitalize">
                            <Badge
                              variant="outline"
                              className="flex items-center gap-1.5 w-fit text-sm"
                            >
                              <ExchangeLogo exchange={stat.exchange} size="sm" />
                              {stat.exchange}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {stat.count}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge className="bg-green-500/10 text-green-700 dark:text-green-400">
                              {stat.activeCount}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <span
                              className={
                                stat.totalPnl >= 0
                                  ? 'font-semibold text-green-600 dark:text-green-400'
                                  : 'font-semibold text-red-600 dark:text-red-400'
                              }
                            >
                              {formatCurrency(stat.totalPnl)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-muted-foreground">
                              {formatCurrency(avgPnl)}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="symbols" className="mt-4">
            {symbolStats.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                {t('empty.symbols')}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('table.symbol')}</TableHead>
                      <TableHead className="text-right">
                        {t('table.totalStrategies')}
                      </TableHead>
                      <TableHead className="text-right">{t('table.active')}</TableHead>
                      <TableHead className="text-right">{t('table.totalPnl')}</TableHead>
                      <TableHead className="text-right">{t('table.avgPnl')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {symbolStats.map((stat) => {
                      const avgPnl = stat.totalPnl / Math.max(stat.count, 1);
                      return (
                        <TableRow key={stat.symbol}>
                          <TableCell>
                            <StrategySymbol strategy={stat} />
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {stat.count}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge className="bg-green-500/10 text-green-700 dark:text-green-400">
                              {stat.activeCount}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <span
                              className={
                                stat.totalPnl >= 0
                                  ? 'font-semibold text-green-600 dark:text-green-400'
                                  : 'font-semibold text-red-600 dark:text-red-400'
                              }
                            >
                              {formatCurrency(stat.totalPnl)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-muted-foreground">
                              {formatCurrency(avgPnl)}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
