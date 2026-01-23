'use client';

import { useState, useEffect } from 'react';

import { ExchangeSelector } from '@/components/exchange-selector';
import { OrdersTable } from '@/components/orders-table';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';

// Configurable refresh interval (milliseconds)
const REFRESH_INTERVAL = parseInt(
  process.env.NEXT_PUBLIC_DASHBOARD_REFRESH_INTERVAL || '30000',
);

export default function TransactionPage() {
  const [selectedExchange, setSelectedExchange] = useState('all');
  const [availableExchanges, setAvailableExchanges] = useState<string[]>([]);

  useEffect(() => {
    // Fetch available exchanges from orders API
    const fetchExchanges = async () => {
      try {
        const response = await fetch('/api/orders');
        if (response.ok) {
          const data = await response.json();
          // Extract unique exchanges from orders
          const exchanges = [
            ...new Set(
              (data.orders || [])
                .map((o: { exchange?: string }) => o.exchange)
                .filter(Boolean),
            ),
          ] as string[];
          if (exchanges.length > 0) {
            setAvailableExchanges(exchanges);
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
        title="Transactions"
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
            {/* Orders Table */}
            <div className="px-4 lg:px-6">
              <OrdersTable
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
