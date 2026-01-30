import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PushNotificationsClient } from './push-notifications-client';
import { SidebarInset } from '@/components/ui/sidebar';
import { SiteHeader } from '@/components/site-header';

export default function PushPage() {
  return (
    <SidebarInset>
      <SiteHeader title="Push notifications" />
      <div className="flex flex-col gap-6 p-4 lg:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Push Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <PushNotificationsClient />
          </CardContent>
        </Card>
      </div>
    </SidebarInset>
  );
}
