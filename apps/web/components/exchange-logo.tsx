'use client';

import { getExchangeInfo, type ExchangeInfo } from '@/lib/exchanges';
import { cn } from '@/lib/utils';

interface ExchangeLogoProps {
  exchange: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showName?: boolean;
  className?: string;
}

export function ExchangeLogo({
  exchange,
  size = 'sm',
  showName = false,
  className,
}: ExchangeLogoProps) {
  const exchangeInfoData = getExchangeInfo(exchange);

  if (!exchangeInfoData) {
    return null;
  }

  // TypeScript type narrowing after null check
  const exchangeInfo: ExchangeInfo = exchangeInfoData;

  // Extract values to avoid type inference issues in closures
  const { logoUrl, name, iconEmoji } = exchangeInfo;

  const sizeClasses = {
    xs: 'w-3 h-3',
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  const textSizeClasses = {
    xs: 'text-xs',
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={name}
          className={cn('rounded-full flex-shrink-0', sizeClasses[size])}
          onError={(e) => {
            // Fallback to emoji if image fails to load
            const target = e.target as HTMLImageElement;
            const parent = target.parentElement;
            if (parent) {
              parent.innerHTML = `<span class="${textSizeClasses[size]} flex-shrink-0">${iconEmoji}</span>`;
            }
          }}
        />
      ) : (
        <span className={cn('flex-shrink-0', textSizeClasses[size])}>{iconEmoji}</span>
      )}
      {showName && (
        <span className={cn('font-medium capitalize', textSizeClasses[size])}>
          {name}
        </span>
      )}
    </div>
  );
}
