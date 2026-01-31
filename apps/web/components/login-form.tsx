'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { signIn } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IconApple, IconGithub, IconGoogle } from '@/components/icons';
export function LoginForm({ ...props }: React.ComponentProps<'form'>) {
  const t = useTranslations('auth.login');
  const router = useRouter();
  const searchParams = useSearchParams();
  const callback = (searchParams.get('callbackUrl') as string) || '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const res = await signIn.email({
      email,
      password,
      callbackURL: callback,
    });
    if (res.error) {
      setError(res.error.message || t('errors.signInFailed'));
      setLoading(false);
      return;
    }
    // Ensure navigation + data refresh
    startTransition(() => {
      const key = 'nav:auth-redirect';
      const now = Date.now();
      sessionStorage.setItem(key, String(now));
      router.replace(callback);
      router.refresh();
    });
    setLoading(false);
  };
  return (
    <form className="p-6 md:p-8" onSubmit={handleSubmit} {...props}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center text-center">
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground text-balance">{t('subtitle')}</p>
        </div>
        <div className="grid gap-3">
          <Label htmlFor="email">{t('emailLabel')}</Label>
          <Input
            id="email"
            type="email"
            placeholder={t('emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="grid gap-3">
          <div className="flex items-center">
            <Label htmlFor="password">{t('passwordLabel')}</Label>
            <a
              href="/auth/forget-password"
              className="ml-auto text-sm underline-offset-2 hover:underline"
            >
              {t('forgotPassword')}
            </a>
          </div>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-red-500">{error}</p>}
        <Button type="submit" className="w-full" disabled={isPending || loading}>
          {t('submit')}
        </Button>
        <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
          <span className="bg-card text-muted-foreground relative z-10 px-2">
            {t('continueWith')}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4 center">
          <Button
            variant="outline"
            type="button"
            className="w-full"
            onClick={() => signIn.social({ provider: 'apple', callbackURL: callback })}
          >
            <IconApple />
            <span className="sr-only">{t('social.apple')}</span>
          </Button>
          <Button
            variant="outline"
            type="button"
            className="w-full"
            onClick={() => signIn.social({ provider: 'google', callbackURL: callback })}
          >
            <IconGoogle />
            <span className="sr-only">{t('social.google')}</span>
          </Button>
          <Button
            variant="outline"
            type="button"
            className="w-full"
            onClick={() => signIn.social({ provider: 'github', callbackURL: callback })}
          >
            <IconGithub />
            <span className="sr-only">{t('social.github')}</span>
          </Button>
        </div>
        <div className="text-center text-sm">
          {t('noAccount')}{' '}
          <a href="/auth/sign-up" className="underline underline-offset-4">
            {t('signUp')}
          </a>
        </div>
      </div>
    </form>
  );
}
