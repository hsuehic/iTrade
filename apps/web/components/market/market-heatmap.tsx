'use client';

import { memo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SymbolIcon } from '@/components/symbol-icon';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { type PerpetualTicker, getHeatmapColor, formatPrice } from '@/lib/market-types';

interface MarketHeatmapProps {
  tickers: PerpetualTicker[];
  className?: string;
}

interface HeatmapCellProps {
  ticker: PerpetualTicker;
  size: 'lg' | 'md' | 'sm';
  index: number;
}

const HeatmapCell = memo(function HeatmapCell({ ticker, size, index }: HeatmapCellProps) {
  const t = useTranslations('market.heatmap');
  const [isHovered, setIsHovered] = useState(false);

  const backgroundColor = getHeatmapColor(ticker.change24h);
  const isPositive = ticker.change24h >= 0;

  const sizeClasses = {
    lg: 'col-span-2 row-span-2',
    md: 'col-span-1 row-span-2',
    sm: 'col-span-1 row-span-1',
  };

  const textSizes = {
    lg: { symbol: 'text-xl', price: 'text-lg', change: 'text-base' },
    md: { symbol: 'text-base', price: 'text-sm', change: 'text-xs' },
    sm: { symbol: 'text-xs', price: 'text-[10px]', change: 'text-[10px]' },
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: index * 0.03 }}
            className={cn(
              'relative cursor-pointer overflow-hidden rounded-lg transition-all duration-200',
              sizeClasses[size],
              isHovered && 'z-10 scale-[1.03] shadow-lg ring-2 ring-white/30',
            )}
            style={{ backgroundColor }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            {/* Content */}
            <div className="flex h-full flex-col items-center justify-center p-2 text-white">
              <div className="flex items-center gap-1.5">
                <SymbolIcon
                  symbol={ticker.symbol}
                  size={size === 'lg' ? 'lg' : size === 'md' ? 'md' : 'sm'}
                />
                <span className={cn('font-bold drop-shadow-sm', textSizes[size].symbol)}>
                  {ticker.base}
                </span>
              </div>

              <div
                className={cn('mt-1 font-semibold drop-shadow-sm', textSizes[size].price)}
              >
                ${ticker.priceStr}
              </div>

              <div
                className={cn(
                  'mt-0.5 flex items-center gap-0.5 font-medium drop-shadow-sm',
                  textSizes[size].change,
                )}
              >
                {isPositive ? (
                  <ArrowUp className="size-3" />
                ) : (
                  <ArrowDown className="size-3" />
                )}
                {Math.abs(ticker.change24h).toFixed(2)}%
              </div>
            </div>

            {/* Subtle hover glow effect */}
            {isHovered && (
              <div className="pointer-events-none absolute inset-0 bg-white/10" />
            )}
          </motion.div>
        </TooltipTrigger>

        <TooltipContent
          side="top"
          className="border-border/50 bg-popover/95 backdrop-blur-sm"
        >
          <div className="space-y-1.5 p-1">
            <div className="flex items-center gap-2">
              <SymbolIcon symbol={ticker.symbol} size="md" />
              <span className="font-semibold">{ticker.base}/USDT</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {ticker.exchange}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div className="text-muted-foreground">{t('tooltip.price')}:</div>
              <div className="font-medium">${ticker.priceStr}</div>

              <div className="text-muted-foreground">{t('tooltip.change24h')}:</div>
              <div
                className={cn(
                  'font-medium',
                  isPositive ? 'text-green-500' : 'text-red-500',
                )}
              >
                {isPositive ? '+' : ''}
                {ticker.change24h.toFixed(2)}%
              </div>

              <div className="text-muted-foreground">{t('tooltip.high24h')}:</div>
              <div className="font-medium">${formatPrice(ticker.high24h)}</div>

              <div className="text-muted-foreground">{t('tooltip.low24h')}:</div>
              <div className="font-medium">${formatPrice(ticker.low24h)}</div>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

export const MarketHeatmap = memo(function MarketHeatmap({
  tickers,
  className,
}: MarketHeatmapProps) {
  const t = useTranslations('market.heatmap');
  // Sort by volume to give larger cells to more important coins
  const sortedTickers = [...tickers].sort((a, b) => b.volume24h - a.volume24h);

  // Assign sizes based on position (top coins get larger cells)
  const getSizeForIndex = (index: number): 'lg' | 'md' | 'sm' => {
    if (index < 2) return 'lg';
    if (index < 6) return 'md';
    return 'sm';
  };

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <span className="bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
              {t('title')}
            </span>
          </CardTitle>
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1">
              <div className="size-3 rounded bg-[#D50000]" />
              <span className="text-muted-foreground">-5%</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="size-3 rounded bg-[#424242]" />
              <span className="text-muted-foreground">0%</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="size-3 rounded bg-[#00C853]" />
              <span className="text-muted-foreground">+5%</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid auto-rows-[80px] grid-cols-6 gap-2">
          {sortedTickers.slice(0, 16).map((ticker, index) => (
            <HeatmapCell
              key={`${ticker.exchange}-${ticker.symbol}`}
              ticker={ticker}
              size={getSizeForIndex(index)}
              index={index}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
});
