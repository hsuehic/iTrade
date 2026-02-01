import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PushNotificationsClient } from './push-notifications-client';
import { SidebarInset } from '@/components/ui/sidebar';
import { SiteHeader } from '@/components/site-header';
import { getAuthFromHeaders } from '@/lib/auth';

export default async function PushPage() {
  const t = await getTranslations('push');
  const requestHeaders = await headers();
  const auth = getAuthFromHeaders(requestHeaders);
  const session = await auth.api.getSession({
    headers: requestHeaders,
  });
  const role = (session?.user as { role?: string | null } | undefined)?.role ?? null;
  const isAdmin = role === 'admin';

  return (
    <SidebarInset>
      <SiteHeader title={t('title')} />
      <div className="flex flex-col gap-6 p-4 lg:p-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('cardTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <PushNotificationsClient isAdmin={isAdmin} />
          </CardContent>
        </Card>
      </div>
    </SidebarInset>
  );
}
