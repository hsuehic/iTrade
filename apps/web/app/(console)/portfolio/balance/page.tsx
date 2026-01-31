'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

import { BalanceOverviewCards } from '@/components/balance-overview-cards';
import { AccountBalanceChart } from '@/components/account-balance-chart';
import { ExchangeBalanceBreakdown } from '@/components/exchange-balance-breakdown';
import { ExchangeSelector } from '@/components/exchange-selector';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';

// Configurable refresh interval (milliseconds)
const REFRESH_INTERVAL = parseInt(
  process.env.NEXT_PUBLIC_DASHBOARD_REFRESH_INTERVAL || '5000',
);

export default function BalancePage() {
  const t = useTranslations('portfolio.balance');
  const [selectedExchange, setSelectedExchange] = useState('all');
  const [availableExchanges, setAvailableExchanges] = useState<string[]>([]);

  useEffect(() => {
    // Fetch available exchanges
    const fetchExchanges = async () => {
      try {
        const response = await fetch('/api/analytics/account?period=7d');
        if (response.ok) {
          const data = await response.json();
          if (data.exchanges && data.exchanges.length > 0) {
            const exchanges = data.exchanges.map((e: { exchange: string }) => e.exchange);
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
        title={t('title')}
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
            {/* Balance Overview Cards */}
            <div className="px-4 lg:px-6">
              <BalanceOverviewCards
                selectedExchange={selectedExchange}
                refreshInterval={REFRESH_INTERVAL}
              />
            </div>

            {/* Balance History Chart */}
            <div className="px-4 lg:px-6">
              <AccountBalanceChart
                selectedExchange={selectedExchange}
                refreshInterval={REFRESH_INTERVAL}
              />
            </div>

            {/* Exchange Breakdown (only show when 'all' is selected and multiple exchanges exist) */}
            {selectedExchange === 'all' && availableExchanges.length > 1 && (
              <div className="px-4 lg:px-6">
                <ExchangeBalanceBreakdown
                  selectedExchange={selectedExchange}
                  refreshInterval={REFRESH_INTERVAL}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}
