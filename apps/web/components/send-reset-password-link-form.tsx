'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { requestPasswordReset } from '@/lib/auth-client';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function SendResetPasswordLinkForm() {
  const t = useTranslations('auth.forgetPassword');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <div className="grid gap-4 p-6 md:p-8">
      <div className="flex flex-col items-center text-center">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
      </div>
      {sent ? (
        <div>
          {t('sent.line1', { email })} <br />
          {t('sent.line2')} <br />
          <Button
            type="button"
            className="mt-2"
            onClick={() => router.push('/auth/sign-in')}
          >
            {t('sent.back')}
          </Button>
        </div>
      ) : (
        <>
          <p className="text-muted-foreground text-balance">
            {t('description')}{' '}
            <a href="/auth/sign-in" className="primary-text!">
              {t('signInLink')}
            </a>
            {t('descriptionEnd')}
          </p>
          <div className="grid gap-2">
            <Label htmlFor="email">{t('emailLabel')}</Label>
            <Input
              id="email"
              type="email"
              placeholder={t('emailPlaceholder')}
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
                setError(t('errors.emailRequired'));
                return;
              }
              if (!regex.test(email)) {
                setError(t('errors.emailInvalid'));
                return;
              }
              try {
                setLoading(true);
                await requestPasswordReset({
                  email,
                  redirectTo: '/auth/reset-password',
                });
                toast.success(t('messages.sent'));
                setSent(true);
              } catch (error) {
                toast.error((error as { message: string }).message);
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : t('submit')}
          </Button>
        </>
      )}
    </div>
  );
}
