'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

import { requestPasswordReset } from '@/lib/auth-client';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function SendResetPasswordLinkForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <div className="grid gap-4 p-6 md:p-8">
      <div className="flex flex-col items-center text-center">
        <h1 className="text-2xl font-bold">Send Reset Password Link</h1>
      </div>
      {sent ? (
        <div>
          We sent a password reset link to <i>{email}</i>. <br />
          Please check your inbox and click the link to reset your password.{' '}
          <br />
          <Button
            type="button"
            className="mt-2"
            onClick={() => router.push('/auth/sign-in')}
          >
            Back to sign in
          </Button>
        </div>
      ) : (
        <>
          <p className="text-muted-foreground text-balance">
            Please input your register email address, we will send a reset
            password link to your email. Back to{' '}
            <a href="/auth/sign-in" className="primary-text!">
              sign in
            </a>
            ;
          </p>
          <div className="grid gap-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              required
              onChange={(e) => {
                setEmail(e.target.value);
              }}
              value={email}
            />
          </div>

          {error && <p className="text-red-500">{error}</p>}
          <Button
            type="submit"
            className="w-full"
            disabled={loading}
            onClick={async () => {
              const regex = /^[\w.-]+@[a-zA-Z\d.-]+\.[a-zA-Z]{2,}$/;
              if (!email) {
                setError('Email is required');
                return;
              }
              if (!regex.test(email)) {
                setError('Invalid email address format');
                return;
              }
              try {
                setLoading(true);
                await requestPasswordReset({
                  email,
                  redirectTo: '/auth/reset-password',
                });
                toast.success('Password reset email sent');
                setSent(true);
              } catch (error) {
                toast.error((error as { message: string }).message);
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              'Send Reset Password Link'
            )}
          </Button>
        </>
      )}
    </div>
  );
}
