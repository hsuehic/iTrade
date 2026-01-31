import { getTranslations } from 'next-intl/server';

import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';
import { MarketDashboard } from '@/components/market';

export async function generateMetadata() {
  const t = await getTranslations('market.meta');

  return {
    title: t('title'),
    description: t('description'),
  };
}

export default async function Page() {
  const t = await getTranslations('market');
  return (
    <SidebarInset>
      <SiteHeader title={t('title')} />
      <div className="flex flex-1 flex-col main-content">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
            <MarketDashboard />
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}
