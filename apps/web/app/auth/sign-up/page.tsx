import type { Metadata } from 'next';

import { SignUpForm } from '@/components/sign-up-form';

export const metadata: Metadata = {
  title: 'Sign up',
};

export default function SignUp() {
  return <SignUpForm />;
}
