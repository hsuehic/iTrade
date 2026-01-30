import { Metadata } from 'next';
import { AccountList } from './account-list';
import { getAccounts } from '@/app/actions/accounts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';

export const metadata: Metadata = {
  title: 'My Accounts - iTrade',
};

export default async function AccountsPage() {
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
