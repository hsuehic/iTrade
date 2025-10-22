import type { Metadata } from 'next';

import { AppSidebar } from '@/components/app-sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';

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
 * - Collapsible sidebar navigation (SidebarProvider)
 * - AppSidebar with trading-specific navigation
 * - Responsive design
 * - Proper spacing and structure
 *
 * Note: SessionProvider is handled globally in app/layout.tsx
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': 'calc(var(--spacing) * 72)', // 288px
          '--header-height': 'calc(var(--spacing) * 12)', // 48px
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <main className="flex-1">{children}</main>
    </SidebarProvider>
  );
}
