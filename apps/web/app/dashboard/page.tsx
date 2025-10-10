'use client';

import { useState, useEffect } from 'react';

import { TradingDashboardCards } from '@/components/trading-dashboard-cards';
import { AccountBalanceChart } from '@/components/account-balance-chart';
import { StrategyPerformanceTable } from '@/components/strategy-performance-table';
import { ExchangeSelector } from '@/components/exchange-selector';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';

// 可配置的刷新间隔（毫秒）
// 1000 = 1秒, 5000 = 5秒, 10000 = 10秒
const REFRESH_INTERVAL = parseInt(
  process.env.NEXT_PUBLIC_DASHBOARD_REFRESH_INTERVAL || '5000'
);

export default function Page() {
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
            const exchanges = data.exchanges.map((e: any) => e.exchange);
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
        title="Trading Dashboard"
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
            {/* Account Overview Cards */}
            <TradingDashboardCards
              selectedExchange={selectedExchange}
              refreshInterval={REFRESH_INTERVAL}
            />

            {/* Account Balance Chart */}
            <div className="px-4 lg:px-6">
              <AccountBalanceChart
                selectedExchange={selectedExchange}
                refreshInterval={REFRESH_INTERVAL}
              />
            </div>

            {/* Strategy Performance Table */}
            <div className="px-4 lg:px-6">
              <StrategyPerformanceTable />
            </div>
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}
