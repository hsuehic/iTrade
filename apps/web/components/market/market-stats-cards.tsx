'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  Layers,
  Percent,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { type MarketStats, formatLargeNumber } from '@/lib/market-types';

interface MarketStatsCardsProps {
  stats: MarketStats;
  className?: string;
}

const StatCard = memo(function StatCard({
  title,
  value,
  icon: Icon,
  iconColor,
  accentColor,
  subValue,
  index,
}: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  accentColor: string;
  subValue?: string;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
    >
      <Card
        className={cn(
          'relative overflow-hidden border p-4',
          'bg-card transition-all duration-300',
          'hover:shadow-md hover:border-border/80',
        )}
      >
        {/* Accent bar at top */}
        <div className={cn('absolute inset-x-0 top-0 h-1', accentColor)} />

        <div className="relative z-10 pt-1">
          {/* Title row */}
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {title}
            </span>
            <div className={cn('rounded-lg p-1.5', iconColor)}>
              <Icon className="size-4" />
            </div>
          </div>

          {/* Value - main focus */}
          <div className="text-2xl font-bold tracking-tight text-foreground">{value}</div>

          {/* Sub-value */}
          {subValue && (
            <div className="mt-1.5 text-xs text-muted-foreground">{subValue}</div>
          )}
        </div>
      </Card>
    </motion.div>
  );
});

export const MarketStatsCards = memo(function MarketStatsCards({
  stats,
  className,
}: MarketStatsCardsProps) {
  const t = useTranslations('market.stats');
  // Handle division by zero
  const gainersPercent =
    stats.tickersCount > 0
      ? ((stats.gainersCount / stats.tickersCount) * 100).toFixed(0)
      : '0';
  const losersPercent =
    stats.tickersCount > 0
      ? ((stats.losersCount / stats.tickersCount) * 100).toFixed(0)
      : '0';

  const cards = [
    {
      title: t('volume24h.title'),
      value: formatLargeNumber(stats.totalVolume24h),
      icon: DollarSign,
      iconColor: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
      accentColor: 'bg-blue-500',
      subValue: t('volume24h.subValue', { count: stats.tickersCount }),
    },
    {
      title: t('openInterest.title'),
      value: formatLargeNumber(stats.totalOpenInterest),
      icon: Layers,
      iconColor: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
      accentColor: 'bg-purple-500',
      subValue: t('openInterest.subValue'),
    },
    {
      title: t('gainers.title'),
      value: stats.gainersCount.toString(),
      icon: TrendingUp,
      iconColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      accentColor: 'bg-emerald-500',
      subValue: t('gainers.subValue', { percent: gainersPercent }),
    },
    {
      title: t('losers.title'),
      value: stats.losersCount.toString(),
      icon: TrendingDown,
      iconColor: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
      accentColor: 'bg-rose-500',
      subValue: t('losers.subValue', { percent: losersPercent }),
    },
    {
      title: t('avgFunding.title'),
      value: `${(stats.avgFundingRate * 100).toFixed(4)}%`,
      icon: Percent,
      iconColor:
        stats.avgFundingRate >= 0
          ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400'
          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      accentColor: stats.avgFundingRate >= 0 ? 'bg-teal-500' : 'bg-amber-500',
      subValue:
        stats.avgFundingRate >= 0 ? t('avgFunding.longs') : t('avgFunding.shorts'),
    },
    {
      title: t('activity.title'),
      value:
        stats.tickersCount > 15
          ? t('activity.level.high')
          : stats.tickersCount > 8
            ? t('activity.level.medium')
            : t('activity.level.low'),
      icon: Activity,
      iconColor: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
      accentColor: 'bg-cyan-500',
      subValue: t('activity.subValue', { count: stats.tickersCount }),
    },
  ];

  return (
    <div
      className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6', className)}
    >
      {cards.map((card, index) => (
        <StatCard
          key={card.title}
          title={card.title}
          value={card.value}
          icon={card.icon}
          iconColor={card.iconColor}
          accentColor={card.accentColor}
          subValue={card.subValue}
          index={index}
        />
      ))}
    </div>
  );
});
