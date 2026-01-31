import { headers } from 'next/headers';
import { LandingHeader } from '@/components/landing/landing-header';
import { HeroSection } from '@/components/landing/hero-section';
import { TickerGrid } from '@/components/landing/ticker-grid';
import { MobileDownload } from '@/components/landing/mobile-download';
import { ChartBackground } from '@/components/landing/chart-background';
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
  const t = await getTranslations('landing.footer');
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
      {/* Footer */}
      <footer className="relative border-t bg-background/80 py-8 backdrop-blur-sm">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground sm:px-6 lg:px-8">
          <p>{t('rights')}</p>
          <p className="mt-2">{t('risk')}</p>
          <div className="mt-4 flex items-center justify-center gap-4">
            <a
              href="/privacy.html"
              target="_blank"
              rel="noopener noreferrer"
              className="underline transition-colors hover:text-foreground"
            >
              {t('privacy')}
            </a>
            <span>•</span>
            <a
              href="/terms.html"
              target="_blank"
              rel="noopener noreferrer"
              className="underline transition-colors hover:text-foreground"
            >
              {t('terms')}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
