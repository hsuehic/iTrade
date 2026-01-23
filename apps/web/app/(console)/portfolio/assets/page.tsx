'use client';

import { useState, useEffect } from 'react';

import { AssetAllocationChart } from '@/components/asset-allocation-chart';
import { AssetsTable } from '@/components/assets-table';
import { ExchangeSelector } from '@/components/exchange-selector';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';

// Configurable refresh interval (milliseconds)
const REFRESH_INTERVAL = parseInt(
  process.env.NEXT_PUBLIC_DASHBOARD_REFRESH_INTERVAL || '10000',
);

export default function AssetsPage() {
  const [selectedExchange, setSelectedExchange] = useState('all');
  const [availableExchanges, setAvailableExchanges] = useState<string[]>([]);

  useEffect(() => {
    // Fetch available exchanges
    const fetchExchanges = async () => {
      try {
        const response = await fetch('/api/portfolio/assets');
        if (response.ok) {
          const data = await response.json();
          if (data.summary?.exchanges && data.summary.exchanges.length > 0) {
            setAvailableExchanges(data.summary.exchanges);
          }
        }
      } catch (error) {
        console.error('Failed to fetch exchanges:', error);
      }
    };

    fetchExchanges();
  }, []);

  return (
    <SidebarInset>
      <SiteHeader
        title="Assets"
        links={
          <ExchangeSelector
            value={selectedExchange}
            onChange={setSelectedExchange}
            exchanges={availableExchanges}
          />
        }
      />
      <div className="flex flex-1 flex-col main-content">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            {/* Asset Allocation Chart */}
            <div className="px-4 lg:px-6">
              <AssetAllocationChart
                selectedExchange={selectedExchange}
                refreshInterval={REFRESH_INTERVAL}
              />
            </div>

            {/* Assets Table */}
            <div className="px-4 lg:px-6">
              <AssetsTable
                selectedExchange={selectedExchange}
                refreshInterval={REFRESH_INTERVAL}
              />
            </div>
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}
