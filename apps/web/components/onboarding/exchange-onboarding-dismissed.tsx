'use client';

import { useSyncExternalStore, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ExchangeOnboardingWizard } from '@/components/onboarding/exchange-onboarding-wizard';
import { DashboardContent } from '@/components/dashboard/dashboard-content';
import { Plus, LinkIcon } from 'lucide-react';
import Link from 'next/link';

const DISMISS_KEY = 'itrade:onboarding-dismissed';
const DISMISS_EVENT = 'itrade:onboarding-dismissed-change';

/**
 * Real subscribe for useSyncExternalStore — listens for a custom event
 * dispatched whenever the dismiss state changes, plus the native 'storage'
 * event for cross-tab sync.
 */
function subscribe(callback: () => void) {
  window.addEventListener(DISMISS_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(DISMISS_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

/** Client snapshot: read actual localStorage value. */
function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/** SSR snapshot: always false (not dismissed). */
function getServerSnapshot(): boolean {
  return false;
}

/** Write dismiss state to localStorage and notify all subscribers. */
function setDismissed(value: boolean) {
  try {
    if (value) {
      localStorage.setItem(DISMISS_KEY, '1');
    } else {
      localStorage.removeItem(DISMISS_KEY);
    }
  } catch {
    // ignore storage errors
  }
  window.dispatchEvent(new Event(DISMISS_EVENT));
}

/**
 * Wraps DashboardContent with the onboarding wizard overlay.
 *
 * - Always renders the full dashboard (cards, charts — empty but visible).
 * - Not dismissed → wizard dialog overlays on top.
 * - Dismissed → persistent banner at the top of the dashboard.
 *
 * Used by the dashboard page (server component) when the user has no exchange
 * accounts.
 */
export function ExchangeOnboardingDismissed() {
  const t = useTranslations('dashboard');

  const isDismissed = useSyncExternalStore(subscribe, readDismissed, getServerSnapshot);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  const handleReopen = useCallback(() => {
    setDismissed(false);
  }, []);

  return (
    <>
      {/* Banner shown when wizard is dismissed */}
      {isDismissed ? (
        <div className="px-4 pt-4 lg:px-6 lg:pt-6">
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
                  <Link href="/accounts">{t('onboarding.banner.goToAccounts')}</Link>
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      ) : null}

      {/* Full dashboard content — always visible (empty data when no accounts) */}
      <DashboardContent />

      {/* Wizard dialog overlay */}
      {!isDismissed ? <ExchangeOnboardingWizard onDismiss={handleDismiss} /> : null}
    </>
  );
}
