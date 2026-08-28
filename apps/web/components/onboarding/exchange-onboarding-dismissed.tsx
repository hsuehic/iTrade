'use client';

import { useSyncExternalStore, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SidebarInset } from '@/components/ui/sidebar';
import { SiteHeader } from '@/components/site-header';
import { ExchangeOnboardingWizard } from '@/components/onboarding/exchange-onboarding-wizard';
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

/** SSR snapshot: always false (not dismissed). Matches the client's first
 *  paint when localStorage is empty → no hydration mismatch. */
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
 * Client component that manages the onboarding wizard dismiss state.
 *
 * - Not dismissed → renders the wizard dialog on top of an empty dashboard shell.
 * - Dismissed → renders a persistent banner with a "Connect Exchange" button
 *   that re-opens the wizard.
 *
 * Used by the dashboard page (server component) when the user has no exchange
 * accounts. The server checks `getAccounts() === []`; this component handles
 * the client-side localStorage dismiss/re-open lifecycle.
 */
export function ExchangeOnboardingDismissed() {
  const t = useTranslations('dashboard');

  // Single source of truth: isDismissed drives both wizard visibility and
  // the persistent banner. No separate wizardOpen state needed.
  const isDismissed = useSyncExternalStore(subscribe, readDismissed, getServerSnapshot);

  const showWizard = !isDismissed;
  const showBanner = isDismissed;

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  const handleReopen = useCallback(() => {
    setDismissed(false);
  }, []);

  return (
    <SidebarInset>
      <SiteHeader title={t('title')} />
      <div className="flex flex-1 flex-col main-content">
        {/* Persistent banner when dismissed */}
        {showBanner ? (
          <div className="p-4 lg:p-6">
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
        ) : (
          /* Placeholder text behind the wizard dialog (semi-visible through overlay) */
          <div className="flex flex-1 items-center justify-center p-8">
            <p className="text-muted-foreground text-sm">{t('onboarding.loading')}</p>
          </div>
        )}
      </div>

      {/* The wizard dialog */}
      {showWizard ? <ExchangeOnboardingWizard onDismiss={handleDismiss} /> : null}
    </SidebarInset>
  );
}
