'use client';

import * as React from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  duration?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
}

/**
 * AnimatedNumber - 带动画效果的数字组件
 * 
 * 使用 framer-motion 实现平滑的数字过渡动画
 */
export function AnimatedNumber({
  value,
  decimals = 2,
  duration = 0.5,
  className,
  prefix = '',
  suffix = '',
}: AnimatedNumberProps) {
  const spring = useSpring(value, {
    damping: 60,
    stiffness: 100,
    duration: duration * 1000,
  });

  const display = useTransform(spring, (current) => {
    return `${prefix}${current.toFixed(decimals)}${suffix}`;
  });

  React.useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  return <motion.span className={className}>{display}</motion.span>;
}

/**
 * AnimatedCurrency - 格式化货币的动画数字
 */
export function AnimatedCurrency({
  value,
  decimals = 2,
  duration = 0.5,
  className,
  locale = 'en-US',
  currency = 'USD',
}: AnimatedNumberProps & { locale?: string; currency?: string }) {
  const spring = useSpring(value, {
    damping: 60,
    stiffness: 100,
    duration: duration * 1000,
  });

  const display = useTransform(spring, (current) => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(current);
  });

  React.useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  return <motion.span className={className}>{display}</motion.span>;
}

/**
 * AnimatedPercentage - 百分比动画数字
 */
export function AnimatedPercentage({
  value,
  decimals = 2,
  duration = 0.5,
  className,
  showSign = true,
}: AnimatedNumberProps & { showSign?: boolean }) {
  const spring = useSpring(value, {
    damping: 60,
    stiffness: 100,
    duration: duration * 1000,
  });

  const display = useTransform(spring, (current) => {
    const sign = showSign && current > 0 ? '+' : '';
    return `${sign}${current.toFixed(decimals)}%`;
  });

  React.useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  return <motion.span className={className}>{display}</motion.span>;
}

/**
 * AnimatedInteger - 整数动画（无小数）
 */
export function AnimatedInteger({
  value,
  duration = 0.5,
  className,
  prefix = '',
  suffix = '',
}: Omit<AnimatedNumberProps, 'decimals'>) {
  const spring = useSpring(value, {
    damping: 60,
    stiffness: 100,
    duration: duration * 1000,
  });

  const display = useTransform(spring, (current) => {
    return `${prefix}${Math.round(current).toLocaleString()}${suffix}`;
  });

  React.useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  return <motion.span className={className}>{display}</motion.span>;
}

