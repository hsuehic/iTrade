'use client';

import { useEffect, useRef } from 'react';

interface Candle {
  x: number;
  open: number;
  close: number;
  high: number;
  low: number;
  color: string;
}

export function ChartBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match parent
    const updateSize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = parent.getBoundingClientRect();

      // Fallback to window dimensions if parent has no dimensions yet
      const width = rect.width > 0 ? rect.width : window.innerWidth;
      const height = rect.height > 0 ? rect.height : Math.max(600, window.innerHeight);

      if (width === 0 || height === 0) return;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
    };

    // Initial size with small delay to ensure layout is ready
    setTimeout(updateSize, 10);
    window.addEventListener('resize', updateSize);

    // Chart configuration
    const candleCount = 60;
    const candleWidth = 8;
    const candleGap = 4;
    const basePrice = 50000;

    // Generate initial candles with random market conditions
    let candles: Candle[] = [];
    let currentPrice = basePrice;
    let trend = 0; // -1 = bearish, 0 = neutral, 1 = bullish
    let trendStrength = 0.5; // 0 to 1
    let candlesSinceTrendChange = 0;

    const generateCandle = (x: number): Candle => {
      candlesSinceTrendChange++;

      // Randomly change trend every 3-8 candles
      if (candlesSinceTrendChange > 3 + Math.floor(Math.random() * 5)) {
        const rand = Math.random();
        if (rand < 0.33) {
          trend = -1; // Bearish
          trendStrength = 0.3 + Math.random() * 0.5;
        } else if (rand < 0.66) {
          trend = 0; // Neutral/choppy
          trendStrength = 0.2 + Math.random() * 0.3;
        } else {
          trend = 1; // Bullish
          trendStrength = 0.3 + Math.random() * 0.5;
        }
        candlesSinceTrendChange = 0;
      }

      // Calculate price change based on trend
      let baseChange: number;
      let isBullish: boolean;

      if (trend === 1) {
        // Bullish trend: 65% green candles
        isBullish = Math.random() < 0.65;
        if (isBullish) {
          baseChange = Math.random() * 0.012 * trendStrength; // Up to 1.2%
        } else {
          baseChange = -Math.random() * 0.006 * trendStrength; // Small pullback
        }
      } else if (trend === -1) {
        // Bearish trend: 65% red candles
        isBullish = Math.random() < 0.35;
        if (isBullish) {
          baseChange = Math.random() * 0.006 * trendStrength; // Small bounce
        } else {
          baseChange = -Math.random() * 0.012 * trendStrength; // Down to -1.2%
        }
      } else {
        // Neutral: 50/50 with small moves
        isBullish = Math.random() < 0.5;
        baseChange = (Math.random() - 0.5) * 0.008 * trendStrength;
      }

      const open = currentPrice;
      const close = currentPrice * (1 + baseChange);

      // Realistic wicks based on volatility
      const volatility = 0.003 + Math.random() * 0.005;
      const high = Math.max(open, close) * (1 + volatility);
      const low = Math.min(open, close) * (1 - volatility);

      currentPrice = close;

      return {
        x,
        open,
        close,
        high,
        low,
        color: close > open ? '#10b981' : '#ef4444',
      };
    };

    // Initialize candles
    for (let i = 0; i < candleCount; i++) {
      candles.push(generateCandle(i * (candleWidth + candleGap)));
    }

    // Animation
    let scrollOffset = 0;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Calculate price range
      const allPrices = candles.flatMap((c) => [c.open, c.close, c.high, c.low]);
      const minPrice = Math.min(...allPrices);
      const maxPrice = Math.max(...allPrices);
      const priceRange = maxPrice - minPrice;
      const padding = priceRange * 0.1;

      // Scale function
      const scaleY = (price: number) => {
        return (
          height - ((price - minPrice + padding) / (priceRange + padding * 2)) * height
        );
      };

      // Draw grid lines
      ctx.strokeStyle = 'rgba(100, 100, 100, 0.1)';
      ctx.lineWidth = 1;

      for (let i = 0; i <= 4; i++) {
        const y = (height / 4) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw candles with gradient
      candles.forEach((candle) => {
        const x = candle.x - scrollOffset;

        // Skip if off screen
        if (x < -candleWidth * 2 || x > width + candleWidth * 2) return;

        const openY = scaleY(candle.open);
        const closeY = scaleY(candle.close);
        const highY = scaleY(candle.high);
        const lowY = scaleY(candle.low);
        const bodyY = Math.min(openY, closeY);
        const bodyHeight = Math.abs(closeY - openY);

        // Create gradient for body
        const gradient = ctx.createLinearGradient(x, bodyY, x, bodyY + bodyHeight);
        if (candle.close > candle.open) {
          // Bullish - green gradient
          gradient.addColorStop(0, 'rgba(16, 185, 129, 0.8)');
          gradient.addColorStop(1, 'rgba(16, 185, 129, 0.3)');
        } else {
          // Bearish - red gradient
          gradient.addColorStop(0, 'rgba(239, 68, 68, 0.8)');
          gradient.addColorStop(1, 'rgba(239, 68, 68, 0.3)');
        }

        // Draw wick
        ctx.strokeStyle = candle.color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(x + candleWidth / 2, highY);
        ctx.lineTo(x + candleWidth / 2, lowY);
        ctx.stroke();

        // Draw body with gradient
        ctx.fillStyle = gradient;
        ctx.globalAlpha = 0.8;
        ctx.fillRect(x, bodyY, candleWidth, Math.max(bodyHeight, 2));

        // Add subtle glow effect
        ctx.shadowColor = candle.color;
        ctx.shadowBlur = 4;
        ctx.fillRect(x, bodyY, candleWidth, Math.max(bodyHeight, 2));
        ctx.shadowBlur = 0;
      });

      ctx.globalAlpha = 1;
    };

    const animate = () => {
      // Slow scroll speed
      scrollOffset += 0.5;

      // Add new candle when needed
      const lastCandle = candles[candles.length - 1];
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width / dpr;
      const distanceFromRight = lastCandle.x - scrollOffset;

      if (distanceFromRight < width - (candleWidth + candleGap) * 3) {
        const newX = lastCandle.x + candleWidth + candleGap;
        candles.push(generateCandle(newX));
      }

      // Remove candles that are off screen
      candles = candles.filter((c) => c.x - scrollOffset > -candleWidth * 5);

      draw();
      animationRef.current = requestAnimationFrame(animate);
    };

    // Start animation after ensuring canvas is sized
    setTimeout(() => animate(), 100);

    return () => {
      window.removeEventListener('resize', updateSize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      style={{
        opacity: 0.6,
        filter: 'blur(1px)',
      }}
    />
  );
}
