import { getTranslations } from 'next-intl/server';

import { DashboardContent } from '@/components/dashboard/dashboard-content';
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

  // Always render the full dashboard layout (cards + charts).
  // When hasAccounts is false, DashboardContent shows an onboarding
  // banner / wizard overlay on top of the empty dashboard.
  return <DashboardContent hasAccounts={hasAccounts} />;
}
