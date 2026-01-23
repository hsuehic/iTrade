'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

import { ExchangeSelector } from '@/components/exchange-selector';
import { OrdersTable } from '@/components/orders-table';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';

// Configurable refresh interval (milliseconds)
const REFRESH_INTERVAL = parseInt(
  process.env.NEXT_PUBLIC_DASHBOARD_REFRESH_INTERVAL || '30000',
);

export default function TransactionPage() {
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get('status') || undefined;
  const exchangeFilter = searchParams.get('exchange') || undefined;

  // When URL has exchange filter, use it; otherwise use local state
  const [localExchange, setLocalExchange] = useState('all');
  const [availableExchanges, setAvailableExchanges] = useState<string[]>([]);

  // Derive the effective exchange from URL or local state
  const selectedExchange = exchangeFilter || localExchange;

  // When user changes via selector, only update local state (URL filter takes priority)
  const handleExchangeChange = (value: string) => {
    setLocalExchange(value);
  };

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

  // Use a key to reset OrdersTable when URL filters change
  const tableKey = `${statusFilter || 'all'}-${exchangeFilter || 'all'}`;

  return (
    <SidebarInset>
      <SiteHeader
        title="Transactions"
        links={
          <ExchangeSelector
            value={selectedExchange}
            onChange={handleExchangeChange}
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
                key={tableKey}
                selectedExchange={selectedExchange}
                refreshInterval={REFRESH_INTERVAL}
                initialStatusFilter={statusFilter}
              />
            </div>
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}
