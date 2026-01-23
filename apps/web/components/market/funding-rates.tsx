'use client';

import { memo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Flame, Info, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { SymbolIcon } from '@/components/symbol-icon';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { type PerpetualTicker, formatFundingRate } from '@/lib/market-types';

interface FundingRatesProps {
  tickers: PerpetualTicker[];
  className?: string;
}

/**
 * Helper to calculate time until next funding
 */
function calculateTimeUntilFunding(fundingTime: number, now: number): string {
  const diff = fundingTime - now;
  if (diff <= 0) return 'Now';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

const FundingBar = memo(function FundingBar({
  ticker,
  index,
  maxRate,
}: {
  ticker: PerpetualTicker;
  index: number;
  maxRate: number;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [timeUntilFunding, setTimeUntilFunding] = useState('--');
  const rate = ticker.fundingRate;
  const isPositive = rate >= 0;
  const absRate = Math.abs(rate);
  const barWidth = Math.min((absRate / maxRate) * 100, 100);

  // Update time countdown every minute
  useEffect(() => {
    const updateTime = () => {
      setTimeUntilFunding(calculateTimeUntilFunding(ticker.fundingTime, Date.now()));
    };

    // Initial update
    updateTime();

    // Update every minute
    const interval = setInterval(updateTime, 60000);

    return () => clearInterval(interval);
  }, [ticker.fundingTime]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className={cn(
        'group relative rounded-lg p-3 transition-all duration-200',
        'hover:bg-muted/30',
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-center gap-3">
        {/* Symbol */}
        <div className="flex items-center gap-2">
          <SymbolIcon symbol={ticker.symbol} size="md" />
          <div className="w-16">
            <div className="font-medium">{ticker.base}</div>
            <div className="text-xs text-muted-foreground">{ticker.exchange}</div>
          </div>
        </div>

        {/* Bar visualization */}
        <div className="flex flex-1 items-center gap-2">
          {/* Left side (negative) */}
          <div className="flex h-6 w-1/2 justify-end">
            {!isPositive && (
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${barWidth}%` }}
                transition={{ duration: 0.5, delay: index * 0.05 }}
                className="flex items-center justify-start rounded-l-full bg-red-500/80"
                style={{ minWidth: barWidth > 0 ? '8px' : '0' }}
              >
                {barWidth > 15 && <TrendingDown className="ml-1 size-3 text-white" />}
              </motion.div>
            )}
          </div>

          {/* Center divider */}
          <div className="h-8 w-px bg-border" />

          {/* Right side (positive) */}
          <div className="flex h-6 w-1/2 justify-start">
            {isPositive && (
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${barWidth}%` }}
                transition={{ duration: 0.5, delay: index * 0.05 }}
                className="flex items-center justify-end rounded-r-full bg-green-500/80"
                style={{ minWidth: barWidth > 0 ? '8px' : '0' }}
              >
                {barWidth > 15 && <TrendingUp className="mr-1 size-3 text-white" />}
              </motion.div>
            )}
          </div>
        </div>

        {/* Rate value */}
        <div className="w-24 text-right">
          <div
            className={cn(
              'flex items-center justify-end gap-1 font-medium',
              isPositive ? 'text-green-500' : 'text-red-500',
            )}
          >
            {absRate > 0.0005 && <Flame className="size-3 text-orange-500" />}
            {formatFundingRate(rate)}
          </div>
          <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
            <Clock className="size-3" />
            {timeUntilFunding}
          </div>
        </div>
      </div>

      {/* Hover info */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 overflow-hidden border-t pt-2 text-xs text-muted-foreground"
          >
            <div className="flex justify-between">
              <span>Annualized: {(rate * 3 * 365 * 100).toFixed(2)}%</span>
              <span>{isPositive ? 'Longs pay Shorts' : 'Shorts pay Longs'}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

export const FundingRates = memo(function FundingRates({
  tickers,
  className,
}: FundingRatesProps) {
  // Sort by absolute funding rate
  const sorted = [...tickers].sort(
    (a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate),
  );

  const maxRate = Math.max(...sorted.map((t) => Math.abs(t.fundingRate)), 0.001);

  // Calculate average
  const avgRate =
    sorted.length > 0
      ? sorted.reduce((sum, t) => sum + t.fundingRate, 0) / sorted.length
      : 0;

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
              Funding Rates
            </span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="size-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>
                    Funding rates are periodic payments between long and short traders.
                    Positive rates mean longs pay shorts, negative rates mean shorts pay
                    longs.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
          <div className="text-sm text-muted-foreground">
            Avg:{' '}
            <span className={avgRate >= 0 ? 'text-green-500' : 'text-red-500'}>
              {formatFundingRate(avgRate)}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {/* Legend */}
        <div className="mb-4 flex items-center justify-center gap-8 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="h-3 w-6 rounded-l-full bg-red-500/80" />
            <span>Shorts pay</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <div className="h-3 w-6 rounded-r-full bg-green-500/80" />
            <span>Longs pay</span>
          </div>
        </div>

        {/* Funding bars */}
        <div className="space-y-1">
          {sorted.slice(0, 10).map((ticker, index) => (
            <FundingBar
              key={`${ticker.exchange}-${ticker.symbol}`}
              ticker={ticker}
              index={index}
              maxRate={maxRate}
            />
          ))}
        </div>

        {sorted.length === 0 && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            Loading funding rates...
          </div>
        )}
      </CardContent>
    </Card>
  );
});
