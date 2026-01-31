import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { SignUpForm } from '@/components/sign-up-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.meta');
  return {
    title: t('signUpTitle'),
  };
}

export default function SignUp() {
  return <SignUpForm />;
}
