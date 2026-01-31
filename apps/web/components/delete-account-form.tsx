'use client';

import { useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type Step = 'email' | 'verify' | 'success';

export function DeleteAccountForm() {
  const t = useTranslations('auth.deleteAccount');
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const router = useRouter();

  const handleSendCode = async () => {
    const emailRegex = /^[\w.-]+@[a-zA-Z\d.-]+\.[a-zA-Z]{2,}$/;
    if (!email) {
      setError(t('errors.emailRequired'));
      return;
    }
    if (!emailRegex.test(email)) {
      setError(t('errors.emailInvalid'));
      return;
    }
    if (!password) {
      setError(t('errors.passwordRequired'));
      return;
    }

    try {
      setLoading(true);
      setError('');

      const response = await fetch('/api/auth/delete-account/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t('errors.sendCodeFailed'));
      }

      toast.success(t('messages.codeSent'));
      setStep('verify');
    } catch (err) {
      const errorMessage = (err as Error).message;
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!verificationCode) {
      setError(t('errors.codeRequired'));
      return;
    }

    try {
      setLoading(true);
      setError('');

      const response = await fetch('/api/auth/delete-account/verify', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: verificationCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t('errors.deleteFailed'));
      }

      setStep('success');
      toast.success(t('messages.deleted'));

      // Redirect to home page after 3 seconds
      setTimeout(() => {
        router.push('/');
      }, 3000);
    } catch (err) {
      const errorMessage = (err as Error).message;
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-4 p-6 md:p-8 max-w-md mx-auto">
      <div className="flex flex-col items-center text-center mb-4">
        <AlertTriangle className="h-12 w-12 text-destructive mb-2" />
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mt-2">{t('subtitle')}</p>
      </div>

      {step === 'email' && (
        <>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{t('warning.title')}</AlertTitle>
            <AlertDescription>{t('warning.description')}</AlertDescription>
          </Alert>

          <div className="grid gap-2">
            <Label htmlFor="email">{t('emailLabel')}</Label>
            <Input
              id="email"
              type="email"
              placeholder={t('emailPlaceholder')}
              required
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
              value={email}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="password">{t('passwordLabel')}</Label>
            <Input
              id="password"
              type="password"
              placeholder={t('passwordPlaceholder')}
              required
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              value={password}
            />
            <p className="text-xs text-muted-foreground">{t('passwordHint')}</p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              disabled={loading}
              onClick={handleSendCode}
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : t('sendCode')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => router.push('/')}
            >
              {t('cancel')}
            </Button>
          </div>
        </>
      )}

      {step === 'verify' && (
        <>
          <Alert>
            <AlertDescription>{t('verify.description', { email })}</AlertDescription>
          </Alert>

          <div className="grid gap-2">
            <Label htmlFor="code">{t('verify.codeLabel')}</Label>
            <Input
              id="code"
              type="text"
              placeholder={t('verify.codePlaceholder')}
              required
              maxLength={6}
              onChange={(e) => {
                setVerificationCode(e.target.value);
                setError('');
              }}
              value={verificationCode}
            />
            <p className="text-xs text-muted-foreground">{t('verify.codeHint')}</p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              disabled={loading}
              onClick={handleDeleteAccount}
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                t('confirmDelete')
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setStep('email')}
              disabled={loading}
            >
              {t('back')}
            </Button>
          </div>
        </>
      )}

      {step === 'success' && (
        <div className="text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
            <svg
              className="h-6 w-6 text-green-600 dark:text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>

          <div>
            <h2 className="text-xl font-semibold">{t('success.title')}</h2>
            <p className="mt-2 text-muted-foreground">{t('success.description')}</p>
          </div>

          <div className="rounded-lg bg-muted p-4">
            <p className="text-sm">{t('success.note')}</p>
          </div>

          <p className="text-xs text-muted-foreground">{t('success.redirect')}</p>
        </div>
      )}
    </div>
  );
}
