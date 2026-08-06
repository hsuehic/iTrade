import { headers } from 'next/headers';
import { LandingHeader } from '@/components/landing/landing-header';
import { HeroSection } from '@/components/landing/hero-section';
import { TickerGrid } from '@/components/landing/ticker-grid';
import { MobileDownload } from '@/components/landing/mobile-download';
import { ChartBackground } from '@/components/landing/chart-background';
import { LandingFooter } from '@/components/landing/landing-footer';
import { HelpWidget } from '@/components/help-bot/help-widget';
import { auth } from '@/lib/auth';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata() {
  const t = await getTranslations('landing.meta');

  return {
    title: t('title'),
    description: t('description'),
  };
}

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const isAuthenticated = !!session?.user;

  return (
    <div className="relative flex min-h-screen flex-col">
      {/* Full-page animated chart background - positioned below header */}
      <div className="fixed inset-0 top-16 -z-10" style={{ pointerEvents: 'none' }}>
        <ChartBackground />
        {/* Gradient overlay for better content readability */}
        <div
          className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/50 to-background/90"
          style={{ pointerEvents: 'none' }}
        />
      </div>

      <LandingHeader isAuthenticated={isAuthenticated} />
      <main className="relative flex-1">
        <HeroSection isAuthenticated={isAuthenticated} />
        <TickerGrid />
        <MobileDownload />
      </main>
      <LandingFooter />

      {/* Public help bot — landing page only */}
      <HelpWidget />
    </div>
  );
}
