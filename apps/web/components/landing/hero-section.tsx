'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { TrendingUp, Zap, Shield } from 'lucide-react';

interface HeroSectionProps {
  isAuthenticated: boolean;
}

const AUTO_PLAY_MS = 8000;

export function HeroSection({ isAuthenticated }: HeroSectionProps) {
  const t = useTranslations('landing.hero');
  const tb = useTranslations('landing.brand');
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setSlide((s) => (s + 1) % 2), AUTO_PLAY_MS);
    return () => clearInterval(id);
  }, [paused, slide]);

  return (
    <section className="relative min-h-[600px] overflow-hidden py-20 sm:py-32">
      {/* Background decoration */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 opacity-30 dark:opacity-20">
          <div className="h-[600px] w-[600px] rounded-full bg-primary/20 blur-3xl" />
        </div>
      </div>

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          {/* Slider: brand intro / product pitch — both slides stay mounted
              (grid-stacked) so SEO content (h1) is always in the DOM */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            className="grid"
          >
            {/* Slide 1 — XTRDE brand */}
            <div
              aria-hidden={slide !== 0}
              className={`col-start-1 row-start-1 flex flex-col items-center justify-center transition-all duration-500 motion-reduce:transition-none ${
                slide === 0
                  ? 'translate-x-0 opacity-100'
                  : 'pointer-events-none -translate-x-8 opacity-0'
              }`}
            >
              <div className="mb-4 flex items-center justify-center gap-4 sm:gap-6">
                {(['x', 't', 'r', 'd', 'e'] as const).map((k) => (
                  <div key={k} className="flex flex-col items-center">
                    <span className="text-4xl font-black tracking-tight text-primary sm:text-5xl md:text-6xl">
                      {k.toUpperCase()}
                    </span>
                    <span className="mt-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground sm:text-xs">
                      {tb(`acronym.${k}`)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mx-auto max-w-2xl text-base italic text-muted-foreground sm:text-xl">
                {tb('mission')}
              </p>
              <p className="mt-4 text-2xl font-bold text-foreground sm:text-3xl">
                {tb('slogan')} <span className="text-primary">{tb('sloganSub')}</span>
              </p>
            </div>

            {/* Slide 2 — product pitch */}
            <div
              aria-hidden={slide !== 1}
              className={`col-start-1 row-start-1 flex flex-col items-center justify-center transition-all duration-500 motion-reduce:transition-none ${
                slide === 1
                  ? 'translate-x-0 opacity-100'
                  : 'pointer-events-none translate-x-8 opacity-0'
              }`}
            >
              <div className="mb-8 inline-flex items-center gap-2 rounded-full border bg-background/50 px-4 py-2 text-sm backdrop-blur-sm">
                <Zap className="size-4 text-primary" />
                <span>{t('badge')}</span>
              </div>
              <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
                {t.rich('title', {
                  emphasis: (chunks) => (
                    <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                      {chunks}
                    </span>
                  ),
                })}
              </h1>
              <p className="mb-4 text-lg font-medium text-foreground/90 sm:text-xl md:text-2xl">
                {t.rich('subtitle', {
                  emphasis: (chunks) => (
                    <span className="font-bold text-primary">{chunks}</span>
                  ),
                })}
              </p>
              <p className="mx-auto max-w-2xl text-base text-muted-foreground sm:text-lg">
                {t('description')}
              </p>
            </div>
          </motion.div>

          {/* Slide dots */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-10 mt-8 flex items-center justify-center gap-2"
          >
            {([0, 1] as const).map((i) => (
              <button
                key={i}
                type="button"
                aria-label={i === 0 ? tb('name') : tb('product')}
                aria-current={slide === i}
                onClick={() => setSlide(i)}
                className={`h-2 rounded-full transition-all motion-reduce:transition-none ${
                  slide === i
                    ? 'w-8 bg-primary'
                    : 'w-2 bg-muted-foreground/40 hover:bg-muted-foreground/60'
                }`}
              />
            ))}
          </motion.div>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col gap-4 sm:flex-row sm:justify-center"
          >
            {isAuthenticated ? (
              <Button asChild size="lg" className="text-base">
                <Link href="/dashboard">
                  <TrendingUp className="mr-2 size-5" />
                  {t('cta.dashboard')}
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild size="lg" className="text-base">
                  <Link href="/auth/sign-up">
                    {t('cta.getStarted')}
                    <TrendingUp className="ml-2 size-5" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="text-base">
                  <Link href="/auth/sign-in">{t('cta.signIn')}</Link>
                </Button>
              </>
            )}
          </motion.div>

          {/* Features */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-3"
          >
            <FeatureCard
              icon={<TrendingUp className="size-6" />}
              title={t('features.multiExchangeTitle')}
              description={t('features.multiExchangeDescription')}
            />
            <FeatureCard
              icon={<Zap className="size-6" />}
              title={t('features.realTimeTitle')}
              description={t('features.realTimeDescription')}
            />
            <FeatureCard
              icon={<Shield className="size-6" />}
              title={t('features.riskTitle')}
              description={t('features.riskDescription')}
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
    <div className="rounded-lg border bg-card/30 backdrop-blur-sm p-6 text-left transition-colors hover:bg-accent/50">
      <div className="mb-3 inline-flex rounded-lg bg-primary/10 p-3 text-primary">
        {icon}
      </div>
      <h3 className="mb-2 font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
