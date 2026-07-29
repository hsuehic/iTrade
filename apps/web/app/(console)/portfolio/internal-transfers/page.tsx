'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { ExchangeSelector } from '@/components/exchange-selector';
import { InternalTransfersTable } from '@/components/internal-transfers-table';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';
import { ExchangeId, SUPPORTED_EXCHANGES } from '@/lib/exchanges';

const toExchangeId = (value: string): ExchangeId | null =>
  SUPPORTED_EXCHANGES.some((exchange) => exchange.id === value)
    ? (value as ExchangeId)
    : null;

export default function InternalTransfersPage() {
  return (
    <Suspense fallback={null}>
      <InternalTransfersPageContent />
    </Suspense>
  );
}

// useSearchParams() requires a Suspense boundary above it for static
// prerendering — see the wrapper export above.
function InternalTransfersPageContent() {
  const t = useTranslations('portfolio.internalTransfers');
  const searchParams = useSearchParams();

  // Lets the Accounts page's "Transfer history" link deep-link straight into
  // this account's exchange, e.g. /portfolio/internal-transfers?exchange=okx
  const exchangeParam = searchParams.get('exchange');

  const [selectedExchange, setSelectedExchange] = useState(
    exchangeParam && toExchangeId(exchangeParam) ? exchangeParam : 'all',
  );
  const [availableExchanges, setAvailableExchanges] = useState<string[]>([]);

  useEffect(() => {
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
        title={t('title')}
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
            <InternalTransfersTable selectedExchange={selectedExchange} />
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}
