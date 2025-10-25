import { Metadata } from 'next';

import { DeleteAccountForm } from '@/components/delete-account-form';

export const metadata: Metadata = {
  title: 'Delete Account',
};

export default async function DeleteAccountPage() {
  // No login required - user will verify with email + password + verification code
  return <DeleteAccountForm />;
}
