'use client';

import { memo, useMemo, useId } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface MiniSparklineProps {
  data: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
  positive?: boolean;
  className?: string;
  showGradient?: boolean;
  animate?: boolean;
}

/**
 * MiniSparkline - A lightweight sparkline chart for price history
 * Uses SVG path for optimal performance
 */
export const MiniSparkline = memo(function MiniSparkline({
  data,
  width = 80,
  height = 32,
  strokeWidth = 1.5,
  positive = true,
  className,
  showGradient = true,
  animate = true,
}: MiniSparklineProps) {
  // Use React's useId for stable unique IDs across renders
  const uniqueId = useId();
  const gradientId = `sparkline-gradient-${uniqueId}`;

  const { path, areaPath } = useMemo(() => {
    if (!data || data.length < 2) {
      return { path: '', areaPath: '' };
    }

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const padding = 2;
    const effectiveWidth = width - padding * 2;
    const effectiveHeight = height - padding * 2;

    const points = data.map((value, index) => {
      const x = padding + (index / (data.length - 1)) * effectiveWidth;
      const y = padding + effectiveHeight - ((value - min) / range) * effectiveHeight;
      return { x, y };
    });

    // Create line path
    const linePath = points.reduce((acc, point, index) => {
      if (index === 0) return `M ${point.x} ${point.y}`;
      return `${acc} L ${point.x} ${point.y}`;
    }, '');

    // Create area path for gradient fill
    const areaPathStr =
      linePath +
      ` L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

    return { path: linePath, areaPath: areaPathStr };
  }, [data, width, height]);

  // Calculate end dot position
  const endDotY = useMemo(() => {
    if (!data || data.length === 0) return height / 2;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    return 2 + (height - 4) - ((data[data.length - 1] - min) / range) * (height - 4);
  }, [data, height]);

  if (!path) {
    return (
      <div
        className={cn('flex items-center justify-center', className)}
        style={{ width, height }}
      >
        <div className="h-px w-full bg-muted" />
      </div>
    );
  }

  const strokeColor = positive
    ? 'rgb(34, 197, 94)' // green-500
    : 'rgb(239, 68, 68)'; // red-500

  const fillColor = positive ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)';

  return (
    <svg
      width={width}
      height={height}
      className={cn('overflow-visible', className)}
      viewBox={`0 0 ${width} ${height}`}
    >
      {showGradient && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity={0.3} />
            <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
          </linearGradient>
        </defs>
      )}

      {/* Area fill */}
      {showGradient && (
        <motion.path
          d={areaPath}
          fill={`url(#${gradientId})`}
          initial={animate ? { opacity: 0 } : undefined}
          animate={animate ? { opacity: 1 } : undefined}
          transition={{ duration: 0.5 }}
        />
      )}

      {/* Line */}
      <motion.path
        d={path}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={animate ? { pathLength: 0, opacity: 0 } : undefined}
        animate={animate ? { pathLength: 1, opacity: 1 } : undefined}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        style={{ filter: `drop-shadow(0 0 3px ${fillColor})` }}
      />

      {/* End dot */}
      {data.length > 0 && (
        <motion.circle
          cx={width - 2}
          cy={endDotY}
          r={2}
          fill={strokeColor}
          initial={animate ? { scale: 0, opacity: 0 } : undefined}
          animate={animate ? { scale: 1, opacity: 1 } : undefined}
          transition={{ delay: 0.6, duration: 0.3 }}
        />
      )}
    </svg>
  );
});
