import { getTranslations } from 'next-intl/server';

import { DashboardContent } from '@/components/dashboard/dashboard-content';
import { ExchangeOnboardingDismissed } from '@/components/onboarding/exchange-onboarding-dismissed';
import { getAccounts } from '@/app/actions/accounts';

export default async function DashboardPage() {
  await getTranslations('dashboard'); // prefetch i18n

  let hasAccounts = false;
  try {
    const accounts = await getAccounts();
    hasAccounts = accounts.length > 0;
  } catch {
    // If getAccounts fails (DB down, session issue), default to showing
    // the dashboard — the layout's session guard already handles auth.
    hasAccounts = true;
  }

  // When the user has no exchange accounts, show the onboarding wizard.
  // The dismissed wrapper (client component) also checks localStorage and
  // renders a persistent "connect your exchange" reminder if the user closed
  // the wizard without completing it.
  if (!hasAccounts) {
    return <ExchangeOnboardingDismissed />;
  }

  return <DashboardContent />;
}
