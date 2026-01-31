import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ResetPasswordForm } from '@/components/reset-password-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.meta');
  return {
    title: t('resetPasswordTitle'),
  };
}

export default function ResetPassword() {
  return <ResetPasswordForm />;
}
