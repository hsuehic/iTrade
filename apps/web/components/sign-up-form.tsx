'use client';

import { useState } from 'react';
import { Loader2, Zap, Mail, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { signIn, signUp } from '@/lib/auth-client';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
      className="h-12 flex items-center justify-center gap-2 px-3 border-border/60 bg-background/50 hover:bg-accent hover:border-primary/40 transition-all font-medium"
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

export function SignUpForm() {
  const t = useTranslations('auth.signUp');
  const [mode, setMode] = useState<'oauth' | 'email'>('oauth');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [activeProvider, setActiveProvider] = useState<string | null>(null);

  const handleSocialSignUp = async (
    provider: 'google' | 'apple' | 'github' | 'slack',
  ) => {
    try {
      setActiveProvider(provider);
      setLoading(true);
      await signIn.social({
        provider,
        callbackURL: '/dashboard',
      });
    } catch (err: unknown) {
      setActiveProvider(null);
      setLoading(false);
      const message = err instanceof Error ? err.message : 'Sign up failed';
      toast.error(message);
    }
  };

  return (
    <div className="flex flex-col gap-5 p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col items-center text-center gap-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-primary/20 via-primary/10 to-primary/5 border border-primary/30 text-primary text-xs font-semibold tracking-wide shadow-sm">
          <Zap className="w-3.5 h-3.5 fill-primary text-primary animate-pulse" />
          <span>{t('oneClickStart')}</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground text-xs text-balance">
          {t('subtitle')}{' '}
          <a
            href="/auth/sign-in"
            className="text-primary font-medium underline underline-offset-4 hover:opacity-80"
          >
            {t('signInLink')}
          </a>
          {t('subtitleEnd')}
        </p>
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
              onClick={() => handleSocialSignUp('google')}
            />
            <SocialButton
              provider="apple"
              icon={<IconApple className="h-5 w-5 shrink-0" />}
              label={t('continueWithApple')}
              activeProvider={activeProvider}
              loading={loading}
              onClick={() => handleSocialSignUp('apple')}
            />
            <SocialButton
              provider="github"
              icon={<IconGithub className="h-5 w-5 shrink-0" />}
              label={t('continueWithGithub')}
              activeProvider={activeProvider}
              loading={loading}
              onClick={() => handleSocialSignUp('github')}
            />
            <SocialButton
              provider="slack"
              icon={<IconSlack className="h-5 w-5 shrink-0" />}
              label={t('continueWithSlack')}
              activeProvider={activeProvider}
              loading={loading}
              onClick={() => handleSocialSignUp('slack')}
            />
          </div>

          {/* Auto-Registration Value Highlight Box */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-primary/5 border border-primary/15 text-xs text-muted-foreground leading-relaxed mt-1">
            <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-foreground">{t('autoRegisterNote')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Email Registration View */}
      {mode === 'email' && (
        <div className="grid gap-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="first-name">{t('firstNameLabel')}</Label>
              <Input
                id="first-name"
                placeholder={t('firstNamePlaceholder')}
                required
                onChange={(e) => setFirstName(e.target.value)}
                value={firstName}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="last-name">{t('lastNameLabel')}</Label>
              <Input
                id="last-name"
                placeholder={t('lastNamePlaceholder')}
                required
                onChange={(e) => setLastName(e.target.value)}
                value={lastName}
              />
            </div>
          </div>
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
            <Label htmlFor="password">{t('passwordLabel')}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder={t('passwordPlaceholder')}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="confirm-password">{t('confirmPasswordLabel')}</Label>
            <Input
              id="confirm-password"
              type="password"
              value={passwordConfirmation}
              onChange={(e) => setPasswordConfirmation(e.target.value)}
              autoComplete="new-password"
              placeholder={t('confirmPasswordPlaceholder')}
            />
          </div>
          <Button
            type="submit"
            className="w-full mt-2 h-10"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              try {
                await signUp.email({
                  email,
                  password,
                  name: `${firstName} ${lastName}`,
                  fetchOptions: {
                    onResponse: () => setLoading(false),
                    onRequest: () => setLoading(true),
                    onError: (ctx) => {
                      toast.error(ctx.error.message);
                    },
                    onSuccess: async () => {
                      toast.success(t('messages.created'), {
                        description: t('messages.verifyEmail'),
                      });
                      router.push('/auth/sign-in');
                    },
                  },
                });
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : t('submit')}
          </Button>
        </div>
      )}
    </div>
  );
}
