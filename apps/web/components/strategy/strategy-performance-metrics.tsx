'use client';

import { useTranslations } from 'next-intl';
import { StrategyPerformanceEntity } from '@itrade/data-manager';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  IconTrendingUp,
  IconTrendingDown,
  IconChartBar,
  IconActivity,
  IconClock,
  IconTarget,
} from '@tabler/icons-react';
import { cn } from '@/lib/utils';
import { Decimal } from 'decimal.js';

interface StrategyPerformanceMetricsProps {
  performance?: StrategyPerformanceEntity;
}

const formatCurrency = (value: number | string | Decimal) => {
  const num =
    typeof value === 'object' && 'toNumber' in value ? value.toNumber() : Number(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

const formatPercent = (value: number | string | Decimal) => {
  const num =
    typeof value === 'object' && 'toNumber' in value ? value.toNumber() : Number(value);
  return `${num.toFixed(2)}%`;
};

const formatNumber = (value: number | string | Decimal, decimals = 2) => {
  const num =
    typeof value === 'object' && 'toNumber' in value ? value.toNumber() : Number(value);
  return num.toLocaleString('en-US', { maximumFractionDigits: decimals });
};

export function StrategyPerformanceMetrics({
  performance,
}: StrategyPerformanceMetricsProps) {
  const t = useTranslations('strategy.performance');

  if (!performance) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{t('noData')}</p>
        </CardContent>
      </Card>
    );
  }

  const isProfitable = Number(performance.totalPnL) >= 0;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Total PnL Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('totalPnL')}</CardTitle>
          {isProfitable ? (
            <IconTrendingUp className="h-4 w-4 text-green-500" />
          ) : (
            <IconTrendingDown className="h-4 w-4 text-red-500" />
          )}
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              'text-2xl font-bold',
              isProfitable ? 'text-green-500' : 'text-red-500',
            )}
          >
            {formatCurrency(performance.totalPnL)}
          </div>
          <p className="text-xs text-muted-foreground">
            {t('roi')}: {formatPercent(performance.roi)}
          </p>
        </CardContent>
      </Card>

      {/* Win Rate Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('winRate')}</CardTitle>
          <IconTarget className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatPercent(performance.winRate)}</div>
          <p className="text-xs text-muted-foreground">
            {formatNumber(performance.winningTrades)} W /{' '}
            {formatNumber(performance.losingTrades)} L
          </p>
        </CardContent>
      </Card>

      {/* Orders Summary Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('orders')}</CardTitle>
          <IconActivity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatNumber(performance.totalOrders, 0)}
          </div>
          <p className="text-xs text-muted-foreground">
            Filled:{' '}
            {formatNumber(
              performance.longOrdersFilledCount + performance.shortOrdersFilledCount,
              0,
            )}
          </p>
        </CardContent>
      </Card>

      {/* Drawdown/Risk Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('maxDrawdown')}</CardTitle>
          <IconChartBar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-500">
            {formatPercent(performance.maxDrawdown)}
          </div>
          <p className="text-xs text-muted-foreground">
            Sharpe: {formatNumber(performance.sharpeRatio)}
          </p>
        </CardContent>
      </Card>

      {/* Detailed stats can go into a larger section below if needed */}
    </div>
  );
}
