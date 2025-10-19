'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

import { resetPassword } from '@/lib/auth-client';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function ResetPasswordForm() {
  const [password, setPassword] = useState('');
  const [cpassword, setCpassword] = useState('');
  const [error, setError] = useState('');

  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <div className="grid gap-4 p-6 md:p-8">
      <div className="flex flex-col items-center text-center">
        <h1 className="text-2xl font-bold">Reset Password</h1>
        <p className="text-muted-foreground text-balance">
          Please input your new password.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          placeholder="Fill in new password"
          required
          onChange={(e) => {
            setPassword(e.target.value);
          }}
          value={password}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="cpassword">Comfirm Password</Label>
        <Input
          id="cpassword"
          type="password"
          value={cpassword}
          onChange={(e) => setCpassword(e.target.value)}
          autoComplete="new-password"
          placeholder="Confirm new password"
        />
      </div>

      {error && <p className="text-red-500">{error}</p>}
      <Button
        type="submit"
        className="w-full"
        disabled={loading}
        onClick={async () => {
          if (password !== cpassword) {
            setError('Password not match');
            return;
          } else if (password.length < 6) {
            setError('Minimun 6 characters');
            return;
          }
          await resetPassword({
            newPassword: password,
            token: new URLSearchParams(window.location.search).get('token')!,
            fetchOptions: {
              onResponse: () => {
                setLoading(false);
              },
              onRequest: () => {
                setLoading(true);
              },
              onError: (ctx) => {
                toast.error(ctx.error.message);
              },
              onSuccess: async () => {
                toast.success('Reset password successfully, please sign in.');
                router.push('/dashboard');
              },
            },
          });
        }}
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : 'Reset Password'}
      </Button>
    </div>
  );
}
