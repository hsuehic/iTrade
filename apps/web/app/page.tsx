import { headers } from 'next/headers';
import { LandingHeader } from '@/components/landing/landing-header';
import { HeroSection } from '@/components/landing/hero-section';
import { TickerGrid } from '@/components/landing/ticker-grid';
import { MobileDownload } from '@/components/landing/mobile-download';
import { auth } from '@/lib/auth';

export const metadata = {
  title: 'iTrade - Intelligent & Strategic Crypto Trading ',
  description:
    'Trade smarter with AI-powered strategies across multiple exchanges. Real-time analytics, automated execution, and risk management built for professionals.',
};

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const isAuthenticated = !!session?.user;

  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader isAuthenticated={isAuthenticated} />
      <main className="flex-1">
        <HeroSection isAuthenticated={isAuthenticated} />
        <TickerGrid />
        <MobileDownload />
      </main>
      {/* Footer */}
      <footer className="border-t bg-muted/50 py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground sm:px-6 lg:px-8">
          <p>&copy; {new Date().getFullYear()} iTrade. All rights reserved.</p>
          <p className="mt-2">Trade responsibly. Cryptocurrency trading involves risk.</p>
        </div>
      </footer>
    </div>
  );
}
