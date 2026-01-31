import { getTranslations } from 'next-intl/server';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PushNotificationsClient } from './push-notifications-client';
import { SidebarInset } from '@/components/ui/sidebar';
import { SiteHeader } from '@/components/site-header';

export default async function PushPage() {
  const t = await getTranslations('push');

  return (
    <SidebarInset>
      <SiteHeader title={t('title')} />
      <div className="flex flex-col gap-6 p-4 lg:p-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('cardTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <PushNotificationsClient />
          </CardContent>
        </Card>
      </div>
    </SidebarInset>
  );
}
