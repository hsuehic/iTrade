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

  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          placeholder="m@example.com"
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
          placeholder="Password"
        />
      </div>

      <Button
        type="submit"
        className="w-full"
        disabled={loading}
        onClick={async () => {
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
        {loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          'Reset Password'
        )}
      </Button>
    </div>
  );
}
