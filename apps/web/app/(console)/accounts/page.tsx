import { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
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
  const t = await getTranslations('accounts');
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
      <SiteHeader title={t('title')} />
      <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('manageTitle')}</CardTitle>
            <CardDescription>{t('manageDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <AccountList initialAccounts={accounts} />
          </CardContent>
        </Card>
      </div>
    </SidebarInset>
  );
}
