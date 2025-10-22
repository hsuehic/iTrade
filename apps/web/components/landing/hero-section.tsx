'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { TrendingUp, Zap, Shield } from 'lucide-react';

interface HeroSectionProps {
  isAuthenticated: boolean;
}

export function HeroSection({ isAuthenticated }: HeroSectionProps) {
  return (
    <section className="relative min-h-[600px] overflow-hidden py-20 sm:py-32">
      {/* Background decoration */}
      <div className="absolute inset-0 -z-10">
        {/* Gradient overlay */}
        <div className="absolute left-1/2 top-0 -translate-x-1/2 opacity-30 dark:opacity-20">
          <div className="h-[600px] w-[600px] rounded-full bg-primary/20 blur-3xl" />
        </div>
      </div>

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8 inline-flex items-center gap-2 rounded-full border bg-background/50 px-4 py-2 text-sm backdrop-blur-sm"
          >
            <Zap className="size-4 text-primary" />
            <span>Intelligent & Strategic Crypto Trading</span>
          </motion.div>

          {/* Main Heading */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
          >
            Markets thrive on{' '}
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              chaos
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-4 text-lg font-medium text-foreground/90 sm:text-xl md:text-2xl"
          >
            For the bold, chaos isn&apos;t a downfall — it&apos;s a{' '}
            <span className="font-bold text-primary">ladder to rise</span>
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mx-auto mb-10 max-w-2xl text-base text-muted-foreground sm:text-lg"
          >
            Trade smarter with AI-powered strategies across multiple exchanges. Real-time
            analytics, automated execution, and risk management built for professionals.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="flex flex-col gap-4 sm:flex-row sm:justify-center"
          >
            {isAuthenticated ? (
              <Button asChild size="lg" className="text-base">
                <Link href="/dashboard">
                  <TrendingUp className="mr-2 size-5" />
                  Go to Dashboard
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild size="lg" className="text-base">
                  <Link href="/auth/sign-up">
                    Get Started Free
                    <TrendingUp className="ml-2 size-5" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="text-base">
                  <Link href="/auth/sign-in">Sign In</Link>
                </Button>
              </>
            )}
          </motion.div>

          {/* Features */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-3"
          >
            <FeatureCard
              icon={<TrendingUp className="size-6" />}
              title="Multi-Exchange"
              description="Trade on Binance, OKX, and Coinbase from one platform"
            />
            <FeatureCard
              icon={<Zap className="size-6" />}
              title="Real-Time"
              description="Live market data and instant order execution"
            />
            <FeatureCard
              icon={<Shield className="size-6" />}
              title="Risk Management"
              description="Built-in stop-loss, position sizing, and portfolio tracking"
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-6 text-left transition-colors hover:bg-accent/50">
      <div className="mb-3 inline-flex rounded-lg bg-primary/10 p-3 text-primary">
        {icon}
      </div>
      <h3 className="mb-2 font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
