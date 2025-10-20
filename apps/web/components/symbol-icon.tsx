import Image from 'next/image';
import { cn } from '@/lib/utils';
import { getCryptoIconUrl } from '@/lib/exchanges';

interface SymbolIconProps {
  symbol: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function SymbolIcon({ symbol, size = 'md', className }: SymbolIconProps) {
  // Extract base asset from symbol (e.g., BTC from BTC/USDT or BTCUSDT)
  const baseAsset =
    symbol.split('/')[0] || symbol.replace(/USDT|USD|EUR|BUSD|TUSD$/i, '');

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

  const iconUrl = getCryptoIconUrl(baseAsset);

  if (!iconUrl) {
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
      className={cn(sizeClasses[size], 'rounded-full flex-shrink-0', className)}
      onError={(e) => {
        const target = e.target as HTMLImageElement;
        // Fallback: replace with letter
        const parent = target.parentElement;
        if (parent) {
          parent.innerHTML = `<div class="${cn(
            sizeClasses[size],
            'flex items-center justify-center rounded-full bg-muted font-semibold',
            textSizeClasses[size],
          )}">${baseAsset.charAt(0)}</div>`;
        }
      }}
    />
  );
}
