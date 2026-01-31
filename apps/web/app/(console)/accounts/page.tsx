import { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccountList } from './account-list';
import { getAccounts } from '@/app/actions/accounts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';
import { getAuthFromHeaders } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'My Accounts - iTrade',
};

export default async function AccountsPage() {
  const requestHeaders = await headers();
  const auth = getAuthFromHeaders(requestHeaders);
  const session = await auth.api.getSession({
    headers: requestHeaders,
  });

  if (!session?.user) {
    redirect('/auth/sign-in');
  }

  const accounts = await getAccounts();

  return (
    <SidebarInset>
      <SiteHeader title="Accounts" />
      <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Manage Exchange Accounts</CardTitle>
            <CardDescription>
              Connect your exchange accounts (Binance, OKX, Coinbase) to enable trading.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AccountList initialAccounts={accounts as any} />
          </CardContent>
        </Card>
      </div>
    </SidebarInset>
  );
}
