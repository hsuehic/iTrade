import { Metadata } from 'next';
import { headers } from 'next/headers';
import { HeroSection } from '@/components/landing/hero-section';
import { TickerGrid } from '@/components/landing/ticker-grid';
import { auth } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'iTrade - Intelligent and Strategic Crypto Trading',
  description:
    'Trade smarter with AI-powered strategies across multiple exchanges. Real-time analytics, automated execution, and risk management built for professionals.',
};

export default async function LandingPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const isAuthenticated = !!session?.user;

  return (
    <main className="min-h-screen">
      <HeroSection isAuthenticated={isAuthenticated} />
      <TickerGrid />
    </main>
  );
}
