import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';
import { MarketDashboard } from '@/components/market';

export const metadata = {
  title: 'Market',
  description:
    'Real-time perpetual futures market data, funding rates, and price movements',
};

export default function Page() {
  return (
    <SidebarInset>
      <SiteHeader title="Market" />
      <div className="flex flex-1 flex-col main-content">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
            <MarketDashboard />
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}
