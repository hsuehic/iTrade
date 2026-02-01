'use client';

import { memo, useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { getCryptoIconUrl } from '@/lib/exchanges';

interface SymbolIconProps {
  symbol: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Extract the base asset from various symbol formats:
 * - "BTC/USDT" → "BTC"
 * - "BTC-USDT" → "BTC"
 * - "BTCUSDT" → "BTC"
 * - "BTC" → "BTC"
 */
function extractBaseAsset(symbol: string): string {
  if (!symbol) return '';

  // Handle symbols with separators: BTC/USDT, BTC-USDT, BTC-USDT-SWAP
  if (symbol.includes('/')) {
    return symbol.split('/')[0];
  }
  if (symbol.includes('-')) {
    return symbol.split('-')[0];
  }

  // Handle concatenated symbols: BTCUSDT, ETHUSDT, TIAUSDT
  // Remove common quote currencies from the end, but only if they are not the only thing
  const base = symbol.replace(/(?:USDT|USDC|USD|EUR|BUSD|TUSD|BTC|ETH)$/i, '');
  return base || symbol;
}

export const SymbolIcon = memo(({ symbol, size = 'md', className }: SymbolIconProps) => {
  const baseAsset = extractBaseAsset(symbol);
  const [imageError, setImageError] = useState(false);

  const sizeClasses = {
    sm: 'size-4',
    md: 'size-5',
    lg: 'size-6',
  };

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  const sizePixels = {
    sm: 16,
    md: 20,
    lg: 24,
  };

  const iconUrl = getCryptoIconUrl(baseAsset);

  if (!iconUrl || imageError || !baseAsset) {
    // Fallback: show first letter in a colored circle
    return (
      <div
        className={cn(
          sizeClasses[size],
          'flex items-center justify-center rounded-full bg-muted font-semibold',
          textSizeClasses[size],
          className,
        )}
      >
        {baseAsset.charAt(0) || '?'}
      </div>
    );
  }

  return (
    <Image
      src={iconUrl}
      alt={baseAsset}
      width={sizePixels[size]}
      height={sizePixels[size]}
      className={cn(sizeClasses[size], 'rounded-full flex-shrink-0', className)}
      onError={() => setImageError(true)}
      priority={false}
      loading="lazy"
    />
  );
});
