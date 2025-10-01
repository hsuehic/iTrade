import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

import { LoginForm } from '@/components/login-form';
import { auth } from '@/lib/auth';

export default async function LoginPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (session) {
    return redirect('/dashboard');
  }
  return <LoginForm />;
}
