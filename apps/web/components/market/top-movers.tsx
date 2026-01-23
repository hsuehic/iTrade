'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Rocket, Skull } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { SymbolIcon } from '@/components/symbol-icon';
import { MiniSparkline } from './mini-sparkline';
import { cn } from '@/lib/utils';
import { type PerpetualTicker } from '@/lib/market-types';

interface TopMoversProps {
  tickers: PerpetualTicker[];
  type: 'gainers' | 'losers';
  className?: string;
}

const MoverCard = memo(function MoverCard({
  ticker,
  rank,
  index,
}: {
  ticker: PerpetualTicker;
  rank: number;
  index: number;
}) {
  const isPositive = ticker.change24h >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: isPositive ? -20 : 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      className={cn(
        'group relative flex items-center gap-3 rounded-xl p-3',
        'border border-transparent transition-all duration-300',
        'hover:border-border/50',
        isPositive
          ? 'bg-gradient-to-r from-green-500/5 to-transparent hover:from-green-500/10'
          : 'bg-gradient-to-r from-red-500/5 to-transparent hover:from-red-500/10',
      )}
    >
      {/* Rank badge */}
      <div
        className={cn(
          'flex size-8 items-center justify-center rounded-lg text-sm font-bold',
          isPositive
            ? 'bg-green-500/10 text-green-600 dark:text-green-400'
            : 'bg-red-500/10 text-red-600 dark:text-red-400',
        )}
      >
        {rank}
      </div>

      {/* Symbol */}
      <div className="flex items-center gap-2">
        <SymbolIcon symbol={ticker.symbol} size="lg" />
        <div>
          <div className="font-semibold">{ticker.base}</div>
          <div className="text-xs text-muted-foreground">{ticker.exchange}</div>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Sparkline */}
      <MiniSparkline
        data={ticker.priceHistory}
        width={60}
        height={28}
        positive={isPositive}
        showGradient={false}
        animate={false}
      />

      {/* Price & Change */}
      <div className="text-right">
        <div className="font-semibold tabular-nums">${ticker.priceStr}</div>
        <div
          className={cn(
            'flex items-center justify-end gap-1 text-sm font-medium',
            isPositive ? 'text-green-500' : 'text-red-500',
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
      </div>
    </motion.div>
  );
});

export const TopMovers = memo(function TopMovers({
  tickers,
  type,
  className,
}: TopMoversProps) {
  // Sort and take top 5
  const sorted = [...tickers]
    .sort((a, b) =>
      type === 'gainers' ? b.change24h - a.change24h : a.change24h - b.change24h,
    )
    .slice(0, 5);

  const isGainers = type === 'gainers';

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          {isGainers ? (
            <>
              <Rocket className="size-5 text-green-500" />
              <span className="bg-gradient-to-r from-green-500 to-emerald-500 bg-clip-text text-transparent">
                Top Gainers
              </span>
            </>
          ) : (
            <>
              <Skull className="size-5 text-red-500" />
              <span className="bg-gradient-to-r from-red-500 to-rose-500 bg-clip-text text-transparent">
                Top Losers
              </span>
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sorted.map((ticker, index) => (
          <MoverCard
            key={`${ticker.exchange}-${ticker.symbol}`}
            ticker={ticker}
            rank={index + 1}
            index={index}
          />
        ))}

        {sorted.length === 0 && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            No {type} to display
          </div>
        )}
      </CardContent>
    </Card>
  );
});
