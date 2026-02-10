import { useTranslations } from 'next-intl';
import { StrategyPerformanceEntity } from '@itrade/data-manager';
import type { StrategyPerformance } from '@itrade/core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  IconTrendingUp,
  IconTrendingDown,
  IconChartBar,
  IconActivity,
  IconTarget,
} from '@tabler/icons-react';
import { cn } from '@/lib/utils';
import { Decimal } from 'decimal.js';

interface StrategyPerformanceMetricsProps {
  performance?: StrategyPerformanceEntity | StrategyPerformance | null;
}

const formatCurrency = (value: number | string | Decimal | undefined) => {
  if (value === undefined || value === null) return '$0.00';
  const num =
    typeof value === 'object' && 'toNumber' in value ? value.toNumber() : Number(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

const formatPercent = (value: number | string | Decimal | undefined) => {
  if (value === undefined || value === null) return '0.00%';
  const num =
    typeof value === 'object' && 'toNumber' in value ? value.toNumber() : Number(value);
  return `${num.toFixed(2)}%`;
};

const formatNumber = (value: number | string | Decimal | undefined, decimals = 2) => {
  if (value === undefined || value === null) return '0';
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

  // Normalize data
  let data;
  if ('totalPnL' in performance) {
    // StrategyPerformanceEntity (Flat)
    const p = performance as StrategyPerformanceEntity;
    data = {
      totalPnL: p.totalPnL,
      roi: p.roi,
      winRate: p.winRate,
      winningTrades: p.winningTrades,
      losingTrades: p.losingTrades,
      totalOrders: p.totalOrders,
      filledOrders: p.longOrdersFilledCount + p.shortOrdersFilledCount,
      maxDrawdown: p.maxDrawdown,
      sharpeRatio: p.sharpeRatio,
    };
  } else {
    // StrategyPerformance Interface (Nested)
    const p = performance as StrategyPerformance;
    data = {
      totalPnL: p.pnl?.totalPnL || 0,
      roi: p.pnl?.roi || 0,
      winRate: p.pnl?.winRate || 0,
      winningTrades: p.activity?.winningTrades || 0,
      losingTrades: p.activity?.losingTrades || 0,
      totalOrders:
        (p.orders?.long?.total?.count || 0) + (p.orders?.short?.total?.count || 0),
      filledOrders:
        (p.orders?.long?.filled?.count || 0) + (p.orders?.short?.filled?.count || 0),
      maxDrawdown: (p.pnl as any).maxDrawdown || 0,
      sharpeRatio: (p.pnl as any).sharpeRatio || 0,
    };
  }

  const isProfitable =
    (typeof data.totalPnL === 'object' && 'toNumber' in data.totalPnL
      ? data.totalPnL.toNumber()
      : Number(data.totalPnL)) >= 0;

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
            {formatCurrency(data.totalPnL)}
          </div>
          <p className="text-xs text-muted-foreground">
            {t('roi')}: {formatPercent(data.roi)}
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
          <div className="text-2xl font-bold">{formatPercent(data.winRate)}</div>
          <p className="text-xs text-muted-foreground">
            {formatNumber(data.winningTrades)} W / {formatNumber(data.losingTrades)} L
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
          <div className="text-2xl font-bold">{formatNumber(data.totalOrders, 0)}</div>
          <p className="text-xs text-muted-foreground">
            Filled: {formatNumber(data.filledOrders, 0)}
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
            {formatPercent(data.maxDrawdown)}
          </div>
          <p className="text-xs text-muted-foreground">
            Sharpe: {formatNumber(data.sharpeRatio)}
          </p>
        </CardContent>
      </Card>

      {/* Detailed stats can go into a larger section below if needed */}
    </div>
  );
}
