import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PushNotificationsClient } from './push-notifications-client';

export default function PushPage() {
  return (
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
  );
}
