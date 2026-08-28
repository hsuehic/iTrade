'use client';

import { useState, useEffect, useSyncExternalStore, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { TradingDashboardCards } from '@/components/trading-dashboard-cards';
import { AccountBalanceChart } from '@/components/account-balance-chart';
import { PnlBarChart } from '@/components/pnl-bar-chart';
import { StrategyPerformanceTable } from '@/components/strategy-performance-table';
import { ExchangeSelector } from '@/components/exchange-selector';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';
import { ExchangeOnboardingWizard } from '@/components/onboarding/exchange-onboarding-wizard';
import { Plus, LinkIcon } from 'lucide-react';
import Link from 'next/link';

// Configurable refresh interval (milliseconds)
const REFRESH_INTERVAL = parseInt(
  process.env.NEXT_PUBLIC_DASHBOARD_REFRESH_INTERVAL || '30000',
);

/* ── Onboarding dismiss state (localStorage + useSyncExternalStore) ── */

const DISMISS_KEY = 'itrade:onboarding-dismissed';
const DISMISS_EVENT = 'itrade:onboarding-dismissed-change';

function subscribeOnboarding(callback: () => void) {
  window.addEventListener(DISMISS_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(DISMISS_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function getServerSnapshot(): boolean {
  return false;
}

function setDismissed(value: boolean) {
  try {
    if (value) {
      localStorage.setItem(DISMISS_KEY, '1');
    } else {
      localStorage.removeItem(DISMISS_KEY);
    }
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(DISMISS_EVENT));
}

/* ── Dashboard content ── */

interface DashboardContentProps {
  /** When false, show onboarding banner / wizard overlay on top of the
   *  normal dashboard layout (which renders with empty data). */
  hasAccounts?: boolean;
}

export function DashboardContent({ hasAccounts = true }: DashboardContentProps) {
  const t = useTranslations('dashboard');
  const [selectedExchange, setSelectedExchange] = useState('all');
  const [availableExchanges, setAvailableExchanges] = useState<string[]>([]);

  // Onboarding dismiss state — only used when hasAccounts === false
  const isDismissed = useSyncExternalStore(
    subscribeOnboarding,
    readDismissed,
    getServerSnapshot,
  );

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  const handleReopen = useCallback(() => {
    setDismissed(false);
  }, []);

  useEffect(() => {
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

  const showOnboarding = !hasAccounts;
  const showBanner = showOnboarding && isDismissed;
  const showWizard = showOnboarding && !isDismissed;

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
            {/* Onboarding banner — shown when wizard is dismissed */}
            {showBanner ? (
              <div className="px-4 lg:px-6">
                <Alert className="border-primary/30 bg-primary/5">
                  <LinkIcon className="h-4 w-4 text-primary" />
                  <AlertTitle className="text-primary">
                    {t('onboarding.banner.title')}
                  </AlertTitle>
                  <AlertDescription className="flex items-center justify-between">
                    <span>{t('onboarding.banner.description')}</span>
                    <div className="flex gap-2 mt-2 sm:mt-0">
                      <Button size="sm" onClick={handleReopen}>
                        <Plus className="mr-2 h-4 w-4" />
                        {t('onboarding.banner.action')}
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <Link href="/accounts">
                          {t('onboarding.banner.goToAccounts')}
                        </Link>
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              </div>
            ) : null}

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

            {/* P&L Bar Chart */}
            <div className="px-4 lg:px-6">
              <PnlBarChart
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

      {/* Onboarding wizard — overlay dialog */}
      {showWizard ? <ExchangeOnboardingWizard onDismiss={handleDismiss} /> : null}
    </SidebarInset>
  );
}
