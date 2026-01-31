'use client';

import { memo, useEffect, useState } from 'react';
import { motion, useAnimation, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, Flame } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SymbolIcon } from '@/components/symbol-icon';
import { MiniSparkline } from './mini-sparkline';
import { cn } from '@/lib/utils';
import {
  type PerpetualTicker,
  formatPrice,
  formatLargeNumber,
  formatFundingRate,
} from '@/lib/market-types';

interface PerpetualTickerRowProps {
  ticker: PerpetualTicker;
  rank: number;
  onSelect?: (ticker: PerpetualTicker) => void;
}

export const PerpetualTickerRow = memo(function PerpetualTickerRow({
  ticker,
  rank,
  onSelect,
}: PerpetualTickerRowProps) {
  const t = useTranslations('market.perpetuals');
  const controls = useAnimation();
  const [prevPrice, setPrevPrice] = useState(ticker.price);
  const [priceDirection, setPriceDirection] = useState<'up' | 'down' | null>(null);

  // Sync prevPrice during render when price changes (React recommended pattern)
  // This is the pattern suggested by React docs for "adjusting state when props change"
  // See: https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (ticker.price !== prevPrice && ticker.price > 0 && prevPrice > 0) {
    const direction = ticker.price > prevPrice ? 'up' : 'down';
    setPrevPrice(ticker.price);
    setPriceDirection(direction);
  }

  // Flash animation effect - only triggers when priceDirection changes
  useEffect(() => {
    if (!priceDirection) return;

    controls
      .start({
        backgroundColor:
          priceDirection === 'up' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
        transition: { duration: 0.2 },
      })
      .then(() => {
        controls.start({
          backgroundColor: 'rgba(0, 0, 0, 0)',
          transition: { duration: 0.4 },
        });
      });

    // Clear direction after animation
    const timeout = setTimeout(() => {
      setPriceDirection(null);
    }, 500);

    return () => clearTimeout(timeout);
  }, [priceDirection, controls]);

  const isPositive = ticker.change24h >= 0;
  const fundingIsPositive = ticker.fundingRate >= 0;

  // Determine if funding rate is notable (high)
  const isHighFunding = Math.abs(ticker.fundingRate) > 0.0005; // 0.05%

  return (
    <motion.div
      animate={controls}
      onClick={() => onSelect?.(ticker)}
      className={cn(
        'group grid cursor-pointer grid-cols-12 items-center gap-2 rounded-lg px-4 py-3',
        'border border-transparent transition-all duration-200',
        'hover:border-border/50 hover:bg-muted/30',
      )}
      whileHover={{ x: 4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      {/* Rank */}
      <div className="col-span-1 text-sm font-medium text-muted-foreground">#{rank}</div>

      {/* Symbol */}
      <div className="col-span-2 flex items-center gap-3">
        <div className="relative">
          <SymbolIcon symbol={ticker.symbol} size="lg" />
          {/* Exchange badge */}
          <div
            className={cn(
              'absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full text-[8px] font-bold',
              ticker.exchange === 'Binance'
                ? 'bg-yellow-500 text-black'
                : 'bg-black text-white dark:bg-white dark:text-black',
            )}
          >
            {ticker.exchange === 'Binance' ? 'B' : 'O'}
          </div>
        </div>
        <div>
          <div className="font-semibold">{ticker.base}</div>
          <div className="text-xs text-muted-foreground">{t('perpetual')}</div>
        </div>
      </div>

      {/* Price with animation */}
      <div className="col-span-2 text-right">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={ticker.priceStr}
            initial={{
              y: priceDirection === 'up' ? 10 : priceDirection === 'down' ? -10 : 0,
              opacity: priceDirection ? 0 : 1,
            }}
            animate={{ y: 0, opacity: 1 }}
            exit={{
              y: priceDirection === 'up' ? -10 : priceDirection === 'down' ? 10 : 0,
              opacity: 0,
            }}
            transition={{ duration: 0.2 }}
            className={cn(
              'text-lg font-bold tabular-nums',
              priceDirection === 'up' && 'text-green-500',
              priceDirection === 'down' && 'text-red-500',
            )}
          >
            ${ticker.priceStr}
          </motion.div>
        </AnimatePresence>
        <div className="text-xs text-muted-foreground">
          {t('mark')}: ${formatPrice(ticker.markPrice)}
        </div>
      </div>

      {/* 24h Change */}
      <div className="col-span-2 text-right">
        <div
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-medium',
            isPositive
              ? 'bg-green-500/10 text-green-600 dark:text-green-400'
              : 'bg-red-500/10 text-red-600 dark:text-red-400',
          )}
        >
          {isPositive ? (
            <TrendingUp className="size-3" />
          ) : (
            <TrendingDown className="size-3" />
          )}
          {isPositive ? '+' : ''}
          {ticker.change24h.toFixed(2)}%
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {ticker.changePrice24h >= 0 ? '+' : ''}
          {formatPrice(ticker.changePrice24h)}
        </div>
      </div>

      {/* 24h Volume */}
      <div className="col-span-2 text-right">
        <div className="font-medium tabular-nums">
          {formatLargeNumber(ticker.volume24h)}
        </div>
        <div className="text-xs text-muted-foreground">{t('table.volume')}</div>
      </div>

      {/* Funding Rate */}
      <div className="col-span-1 text-right">
        <div
          className={cn(
            'flex items-center justify-end gap-1 text-sm font-medium',
            fundingIsPositive ? 'text-green-500' : 'text-red-500',
          )}
        >
          {isHighFunding && <Flame className="size-3 text-orange-500" />}
          {formatFundingRate(ticker.fundingRate)}
        </div>
        <div className="text-xs text-muted-foreground">{t('table.funding')}</div>
      </div>

      {/* Mini Chart */}
      <div className="col-span-2 flex justify-end">
        <MiniSparkline
          data={ticker.priceHistory}
          width={100}
          height={40}
          positive={isPositive}
          animate={false}
        />
      </div>
    </motion.div>
  );
});
