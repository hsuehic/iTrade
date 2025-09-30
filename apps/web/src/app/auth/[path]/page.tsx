import { notFound, redirect } from 'next/navigation';

import { auth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

import SignInClient from '../SignInClient';

const VALID = new Set(['sign-in', 'sign-up', 'forgot-password']);

export default async function AuthPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;
  if (!VALID.has(path)) return notFound();

  return (
    <main className="flex min-h-[80vh] items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="capitalize">{path.replace('-', ' ')}</CardTitle>
        </CardHeader>
        <CardContent>
          {path === 'sign-in' && <SignInClient />}
          {path === 'sign-up' && <SignUpForm />}
          {path === 'forgot-password' && <ForgotPasswordForm />}
        </CardContent>
      </Card>
    </main>
  );
}

function SignUpForm() {
  return (
    <form
      action={async (formData: FormData) => {
        'use server';
        const email = String(formData.get('email') || '');
        const name = String(formData.get('name') || '');
        const password = String(formData.get('password') || '');
        await auth.api.signUpEmail({
          body: { email, password, name, role: 'user' },
        });
        redirect('/');
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" type="text" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" required />
      </div>
      <Button>Sign up</Button>
    </form>
  );
}

function ForgotPasswordForm() {
  return (
    <form
      action={async (formData: FormData) => {
        'use server';
        // Placeholder: implement reset flow later
        console.log(formData);
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <Button>Send reset link</Button>
    </form>
  );
}
