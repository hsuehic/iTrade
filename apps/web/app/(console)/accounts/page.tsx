import { Metadata } from 'next';
import { AccountList } from './account-list';
import { getAccounts } from '@/app/actions/accounts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';

export const metadata: Metadata = {
  title: 'My Accounts - iTrade',
};

export default async function AccountsPage() {
  const accounts = await getAccounts();

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <h2 className="text-lg font-semibold">Accounts</h2>
        </div>
      </header>{/* */}
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
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
    </>
  );
}
