import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { SendResetPasswordLinkForm } from '@/components/send-reset-password-link-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.meta');
  return {
    title: t('forgetPasswordTitle'),
  };
}

export default function ResetPassword() {
  return <SendResetPasswordLinkForm />;
}
