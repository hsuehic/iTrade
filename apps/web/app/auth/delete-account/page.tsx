import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { DeleteAccountForm } from '@/components/delete-account-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.meta');
  return {
    title: t('deleteAccountTitle'),
  };
}

export default async function DeleteAccountPage() {
  // No login required - user will verify with email + password + verification code
  return <DeleteAccountForm />;
}
