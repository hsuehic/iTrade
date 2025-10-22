'use client';

import { memo } from 'react';
import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { getCryptoIconUrl } from '@/lib/exchanges';

interface SymbolIconProps {
  symbol: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const SymbolIcon = memo(({ symbol, size = 'md', className }: SymbolIconProps) => {
  // Extract base asset from symbol (e.g., BTC from BTC/USDT or BTCUSDT)
  const baseAsset =
    symbol.split('/')[0] || symbol.replace(/USDT|USD|EUR|BUSD|TUSD$/i, '');

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

  if (!iconUrl || imageError) {
    // Fallback: show first letter
    return (
      <div
        className={cn(
          sizeClasses[size],
          'flex items-center justify-center rounded-full bg-muted font-semibold',
          textSizeClasses[size],
          className,
        )}
      >
        {baseAsset.charAt(0)}
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
