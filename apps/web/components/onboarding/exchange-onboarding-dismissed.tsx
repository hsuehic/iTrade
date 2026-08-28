'use client';

import { useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SidebarInset } from '@/components/ui/sidebar';
import { SiteHeader } from '@/components/site-header';
import { ExchangeOnboardingWizard } from '@/components/onboarding/exchange-onboarding-wizard';
import { Plus, LinkIcon } from 'lucide-react';
import Link from 'next/link';

const DISMISS_KEY = 'itrade:onboarding-dismissed';

/**
 * SSR-safe empty subscribe function for useSyncExternalStore.
 * Returns a no-op unsubscribe.
 */
function emptySubscribe() {
  return () => {};
}

/**
 * Read whether the user has dismissed the onboarding wizard.
 * Returns false during SSR and on first client paint (to avoid hydration
 * mismatch), then reads localStorage on subsequent renders.
 */
function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
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
  const [wizardOpen, setWizardOpen] = useState(false);
  // SSR: false (not dismissed). Client: actual localStorage value.
  // This avoids hydration mismatch — both server and first client paint
  // show the wizard as open, then the store value applies.
  const isDismissed = useSyncExternalStore(
    emptySubscribe,
    readDismissed,
    () => false, // SSR snapshot
  );

  // After hydration, if not dismissed, open the wizard.
  // If dismissed, keep it closed and show the banner.
  const showWizard = !isDismissed && wizardOpen;
  const showBanner = isDismissed && !wizardOpen;

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ignore storage errors
    }
    setWizardOpen(false);
  };

  const handleReopen = () => {
    try {
      localStorage.removeItem(DISMISS_KEY);
    } catch {
      // ignore storage errors
    }
    setWizardOpen(true);
  };

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
