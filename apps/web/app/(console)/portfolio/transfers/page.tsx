'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

import { ExchangeSelector } from '@/components/exchange-selector';
import { TransfersTable } from '@/components/transfers-table';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';
import { ExchangeId, SUPPORTED_EXCHANGES } from '@/lib/exchanges';

const toExchangeId = (value: string): ExchangeId | null =>
  SUPPORTED_EXCHANGES.some((exchange) => exchange.id === value)
    ? (value as ExchangeId)
    : null;

export default function TransfersPage() {
  const t = useTranslations('portfolio');
  const [selectedExchange, setSelectedExchange] = useState('all');
  const [availableExchanges, setAvailableExchanges] = useState<string[]>([]);

  useEffect(() => {
    // Fetch available exchanges from accounts
    const fetchExchanges = async () => {
      try {
        const accountsResponse = await fetch('/api/accounts');
        if (accountsResponse.ok) {
          const accounts = await accountsResponse.json();
          const rawAccountExchanges = Array.isArray(accounts)
            ? accounts
                .map((acc: { exchange?: string }) => acc.exchange)
                .filter((exchange): exchange is string => Boolean(exchange))
            : [];
          const uniqueAccountExchanges = Array.from(new Set<string>(rawAccountExchanges));
          const accountExchanges = uniqueAccountExchanges.filter(
            (exchange): exchange is string =>
              Boolean(exchange) && Boolean(toExchangeId(exchange)),
          );
          if (accountExchanges.length > 0) {
            setAvailableExchanges(accountExchanges);
          }
        }
      } catch (error) {
        console.error('Failed to fetch exchanges:', error);
      }
    };

    fetchExchanges();
  }, []);

  const handleExchangeChange = (value: string) => {
    setSelectedExchange(value);
  };

  return (
    <SidebarInset>
      <SiteHeader
        title={t('transfers') || 'Transfers'}
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
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
            <TransfersTable selectedExchange={selectedExchange} />
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}
