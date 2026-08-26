import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { AppSidebar } from '@/components/app-sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { ChatWidget } from '@/components/chatbot/chat-widget';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { SessionGuard } from '@/components/session-guard';
import { getAuthFromHeaders } from '@/lib/auth';

export const metadata: Metadata = {
  title: {
    default: 'Dashboard',
    template: '%s - Dashboard - iTrade',
  },
  description: 'Manage your trading strategies and monitor your portfolio',
};

/**
 * Dashboard Layout
 *
 * Provides a consistent layout for all dashboard pages with:
 * - Server-side session check: redirect to sign-in if no valid session
 * - Client-side session guard: redirect on session expiry while page is open
 * - Collapsible sidebar navigation (SidebarProvider)
 * - AppSidebar with trading-specific navigation
 * - Responsive design
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side session check — validates the session cookie against the DB
  const requestHeaders = await headers();
  const auth = getAuthFromHeaders(requestHeaders);
  const session = await auth.api.getSession({ headers: requestHeaders });

  if (!session?.user) {
    redirect('/auth/sign-in');
  }

  return (
    <SessionGuard>
      <SidebarProvider
        style={
          {
            '--sidebar-width': 'calc(var(--spacing) * 72)', // 288px
            '--header-height': 'calc(var(--spacing) * 12)', // 48px
          } as React.CSSProperties
        }
      >
        <AppSidebar variant="inset" />
        <main className="flex-1">
          <ImpersonationBanner />
          {children}
        </main>
        <ChatWidget />
      </SidebarProvider>
    </SessionGuard>
  );
}
