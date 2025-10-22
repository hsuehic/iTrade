'use client';

import { motion, useAnimation } from 'framer-motion';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { SymbolIcon } from '@/components/symbol-icon';
import { cn } from '@/lib/utils';
import { useRef, useEffect } from 'react';

export interface TickerData {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  high24h?: number;
  low24h?: number;
  exchange: string;
}

interface TickerCardProps {
  ticker: TickerData;
  index: number;
  isVisible?: boolean;
  onVisibilityChange?: (visible: boolean) => void;
}

// Component with flash animation on price update
const TickerCardComponent = ({ ticker, index, onVisibilityChange }: TickerCardProps) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const controls = useAnimation();
  const prevPriceRef = useRef<number>(ticker.price);

  // Flash animation when price changes
  useEffect(() => {
    if (prevPriceRef.current !== ticker.price && ticker.price > 0) {
      const priceIncreased = ticker.price > prevPriceRef.current;
      controls
        .start({
          backgroundColor: priceIncreased
            ? 'rgba(34, 197, 94, 0.2)'
            : 'rgba(239, 68, 68, 0.2)',
          transition: { duration: 0.3 },
        })
        .then(() => {
          controls.start({
            backgroundColor: 'rgba(0, 0, 0, 0)', // Use RGBA with 0 alpha instead of 'transparent'
            transition: { duration: 0.5 },
          });
        });
      prevPriceRef.current = ticker.price;
    }
  }, [ticker.price, controls]);

  // IntersectionObserver to track visibility
  useEffect(() => {
    const element = cardRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const visible = entry.isIntersecting;
          onVisibilityChange?.(visible);
        });
      },
      {
        threshold: 0.1,
        rootMargin: '50px',
      },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [onVisibilityChange]);

  const isPositive = ticker.change24h >= 0;
  const baseSymbol = ticker.symbol.split('/')[0] || ticker.symbol.split('-')[0];

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      whileHover={{ scale: 1.02 }}
      className="h-full"
    >
      <motion.div animate={controls} className="h-full rounded-lg">
        <Card className="relative flex h-full min-h-[220px] flex-col overflow-hidden p-4 transition-all hover:shadow-lg">
          {/* Symbol and Icon */}
          <div className="mb-3 flex items-center gap-3">
            <SymbolIcon symbol={ticker.symbol} size="lg" />
            <div className="flex-1">
              <h3 className="font-semibold text-lg">{baseSymbol}</h3>
              <p className="text-xs text-muted-foreground">{ticker.symbol}</p>
            </div>
          </div>

          {/* Price */}
          <div className="mb-2">
            <motion.div
              key={ticker.price}
              initial={{ scale: 1.1 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.2 }}
              className="text-2xl font-bold"
            >
              $
              {ticker.price.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </motion.div>
          </div>

          {/* 24h Change */}
          <div className="mt-auto flex items-center justify-between">
            <div
              className={cn(
                'flex items-center gap-1 rounded-full px-2 py-1 text-sm font-medium',
                isPositive
                  ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                  : 'bg-red-500/10 text-red-600 dark:text-red-400',
              )}
            >
              {isPositive ? (
                <TrendingUp className="size-4" />
              ) : (
                <TrendingDown className="size-4" />
              )}
              <span>
                {isPositive ? '+' : ''}
                {ticker.change24h.toFixed(2)}%
              </span>
            </div>

            {/* Volume */}
            <div className="text-right">
              <p className="text-xs text-muted-foreground">24h Vol</p>
              <p className="text-sm font-medium">
                ${(ticker.volume24h / 1000000).toFixed(1)}M
              </p>
            </div>
          </div>

          {/* High/Low - 2 rows: labels then values */}
          <div className="mt-3 border-t pt-2 text-xs">
            <div className="mb-1 flex justify-between text-muted-foreground">
              <span>High:</span>
              <span>Low:</span>
            </div>
            <div className="flex justify-between font-medium">
              {ticker.high24h && ticker.low24h ? (
                <>
                  <span>${ticker.high24h.toFixed(2)}</span>
                  <span>${ticker.low24h.toFixed(2)}</span>
                </>
              ) : (
                <>
                  <span>--</span>
                  <span>--</span>
                </>
              )}
            </div>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
};

// Export without memo to test if that's blocking updates
export const TickerCard = TickerCardComponent;
