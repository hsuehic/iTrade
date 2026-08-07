'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Zap, Mail, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { signIn } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IconApple, IconGithub, IconGoogle, IconSlack } from '@/components/icons';

interface SocialButtonProps {
  provider: string;
  icon: React.ReactNode;
  label: string;
  activeProvider: string | null;
  loading: boolean;
  onClick: () => void;
}

function SocialButton({
  provider,
  icon,
  label,
  activeProvider,
  loading,
  onClick,
}: SocialButtonProps) {
  const isActive = activeProvider === provider;
  return (
    <Button
      variant="outline"
      type="button"
      disabled={isActive || loading}
      className="h-12 flex items-center justify-center gap-2 px-3 border-border/60 bg-background/50 hover:bg-accent hover:border-primary/40 transition-all font-medium w-full"
      onClick={onClick}
    >
      {isActive ? (
        <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
      ) : (
        <span className="h-5 w-5 shrink-0 transition-transform hover:scale-110">
          {icon}
        </span>
      )}
      <span className="text-sm">{label}</span>
    </Button>
  );
}

export function LoginForm({ ...props }: React.ComponentProps<'form'>) {
  const t = useTranslations('auth.login');
  const router = useRouter();
  const searchParams = useSearchParams();
  const callback = (searchParams.get('callbackUrl') as string) || '/dashboard';
  const [mode, setMode] = useState<'oauth' | 'email'>('oauth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activeProvider, setActiveProvider] = useState<string | null>(null);

  const handleSocialSignIn = async (
    provider: 'google' | 'apple' | 'github' | 'slack',
  ) => {
    try {
      setActiveProvider(provider);
      setLoading(true);
      await signIn.social({
        provider,
        callbackURL: callback,
      });
    } catch (err: unknown) {
      setActiveProvider(null);
      setLoading(false);
      const message = err instanceof Error ? err.message : 'Login failed';
      toast.error(message);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
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
    <form className="flex flex-col gap-5 p-6 md:p-8" onSubmit={handleSubmit} {...props}>
      {/* Header */}
      <div className="flex flex-col items-center text-center gap-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-primary/20 via-primary/10 to-primary/5 border border-primary/30 text-primary text-xs font-semibold tracking-wide shadow-sm">
          <Zap className="w-3.5 h-3.5 fill-primary text-primary animate-pulse" />
          <span>{t('oneClickStart')}</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground text-xs text-balance">{t('subtitle')}</p>
      </div>

      {/* Segmented Mode Switcher */}
      <div className="grid grid-cols-2 p-1 bg-muted/60 rounded-xl border border-border/50 text-xs font-medium">
        <button
          type="button"
          onClick={() => setMode('oauth')}
          className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg transition-all ${
            mode === 'oauth'
              ? 'bg-background text-foreground shadow-sm font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Zap className="w-3.5 h-3.5 text-primary" />
          <span>{t('oauthTab')}</span>
        </button>
        <button
          type="button"
          onClick={() => setMode('email')}
          className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg transition-all ${
            mode === 'email'
              ? 'bg-background text-foreground shadow-sm font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Mail className="w-3.5 h-3.5 text-muted-foreground" />
          <span>{t('emailTab')}</span>
        </button>
      </div>

      {/* 1-Click OAuth View (Default) */}
      {mode === 'oauth' && (
        <div className="flex flex-col gap-4 py-1">
          {/* 2x2 Grid of Social Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <SocialButton
              provider="google"
              icon={<IconGoogle className="h-5 w-5 shrink-0" />}
              label={t('continueWithGoogle')}
              activeProvider={activeProvider}
              loading={loading}
              onClick={() => handleSocialSignIn('google')}
            />
            <SocialButton
              provider="apple"
              icon={<IconApple className="h-5 w-5 shrink-0" />}
              label={t('continueWithApple')}
              activeProvider={activeProvider}
              loading={loading}
              onClick={() => handleSocialSignIn('apple')}
            />
            <SocialButton
              provider="github"
              icon={<IconGithub className="h-5 w-5 shrink-0" />}
              label={t('continueWithGithub')}
              activeProvider={activeProvider}
              loading={loading}
              onClick={() => handleSocialSignIn('github')}
            />
            <SocialButton
              provider="slack"
              icon={<IconSlack className="h-5 w-5 shrink-0" />}
              label={t('continueWithSlack')}
              activeProvider={activeProvider}
              loading={loading}
              onClick={() => handleSocialSignIn('slack')}
            />
          </div>

          {/* Auto-Registration Value Highlight Box */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-primary/5 border border-primary/15 text-xs text-muted-foreground leading-relaxed mt-1">
            <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-foreground">{t('autoLoginNote')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Email Registration View */}
      {mode === 'email' && (
        <div className="grid gap-3 py-1">
          <div className="grid gap-1.5">
            <Label htmlFor="email">{t('emailLabel')}</Label>
            <Input
              id="email"
              type="email"
              placeholder={t('emailPlaceholder')}
              required
              onChange={(e) => setEmail(e.target.value)}
              value={email}
            />
          </div>
          <div className="grid gap-1.5">
            <div className="flex items-center">
              <Label htmlFor="password">{t('passwordLabel')}</Label>
              <a
                href="/auth/forget-password"
                className="ml-auto text-xs underline-offset-2 hover:underline text-muted-foreground hover:text-foreground"
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
          {error && <p className="text-destructive text-xs font-medium">{error}</p>}
          <Button
            type="submit"
            className="w-full mt-2 h-10"
            disabled={isPending || loading}
          >
            {loading || isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              t('submit')
            )}
          </Button>
        </div>
      )}

      {/* Footer Link */}
      <div className="text-center text-xs text-muted-foreground mt-2">
        {t('noAccount')}{' '}
        <a
          href="/auth/sign-up"
          className="text-primary font-medium underline underline-offset-4 hover:opacity-80"
        >
          {t('signUp')}
        </a>
      </div>
    </form>
  );
}
