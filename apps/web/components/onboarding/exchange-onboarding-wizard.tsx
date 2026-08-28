'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  ExternalLink,
  Monitor,
  Smartphone,
  CheckCircle2,
  CircleAlert,
  ShieldAlert,
  ArrowRight,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import {
  getExchangeDisplayName,
  SupportedExchange,
  SUPPORTED_EXCHANGES,
} from '@itrade/data-manager/constants';
import { getExchangeApiKeyGuides } from '@/lib/exchange-api-key-guides';
import {
  getExchangeRegistrationLink,
  EXCHANGE_API_PERMISSIONS,
  EXCHANGE_KYC_GUIDE_LINKS,
} from '@/lib/exchange-registration-links';
import { ITRADE_SERVER_IP } from '@/lib/itrade-server-ip';
import { ApiKeyIpWhitelistNotice } from '@/components/accounts/api-key-ip-whitelist-notice';
import { saveAccount } from '@/app/actions/accounts';
import { toast } from 'sonner';

type WizardStep = 0 | 1 | 2 | 3; // 0=intro, 1=register, 2=create-apikey, 3=add-to-itrade

interface ExchangeOnboardingWizardProps {
  /** Called when the wizard is dismissed (user closes the dialog). */
  onDismiss: () => void;
}

interface InlineFormValues {
  accountId: string;
  apiKey: string;
  secretKey: string;
  passphrase?: string;
}

const STEP_KEYS: Record<WizardStep, string> = {
  0: 'intro',
  1: 'register',
  2: 'createApikey',
  3: 'addToItrade',
} as const;

// Verify delay: give the server time to persist + sync the new account
// before probing the analytics endpoint (avoids stale-cache false negative).
const VERIFY_DELAY_MS = 1500;

export function ExchangeOnboardingWizard({ onDismiss }: ExchangeOnboardingWizardProps) {
  const t = useTranslations('dashboard.onboarding');
  const tForm = useTranslations('accounts.form');
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(0);
  const [selectedExchange, setSelectedExchange] = useState<SupportedExchange | ''>('');
  const [saving, setSaving] = useState(false);
  const [verifyState, setVerifyState] = useState<
    'idle' | 'loading' | 'success' | 'failed'
  >('idle');

  const exchange = selectedExchange || undefined;
  const guides = exchange ? getExchangeApiKeyGuides(exchange) : null;
  const regLink = exchange ? getExchangeRegistrationLink(exchange) : null;
  const permissions = exchange
    ? EXCHANGE_API_PERMISSIONS[exchange as SupportedExchange]
    : null;
  const kycLink = exchange
    ? EXCHANGE_KYC_GUIDE_LINKS[exchange as SupportedExchange]
    : null;
  const isOkx = exchange === SupportedExchange.OKX;

  // Inline form for Step 3
  const form = useForm<InlineFormValues>({
    defaultValues: { accountId: '', apiKey: '', secretKey: '', passphrase: '' },
  });

  const handleSelectExchange = useCallback((ex: SupportedExchange) => {
    setSelectedExchange(ex);
  }, []);

  const handleGoToRegister = useCallback(() => {
    setStep(1);
  }, []);

  const handleHaveAccount = useCallback(() => {
    setStep(2); // Skip registration, go straight to API key creation
  }, []);

  const handleGoToCreateApikey = useCallback(() => {
    setStep(2);
  }, []);

  const handleGoToAddToItrade = useCallback(() => {
    setStep(3);
  }, []);

  const handleBack = useCallback(() => {
    setStep((prev) => {
      // When on Step 2 (create API key), going back returns to Step 0
      // (exchange selection) rather than Step 1 (register).
      if (prev === 2) return 0;
      if (prev === 3) return 2; // Step 3 back → Step 2
      return Math.max(prev - 1, 0) as WizardStep;
    });
    setVerifyState('idle');
  }, []);

  const handleSaveSuccess = useCallback(async () => {
    await new Promise((r) => setTimeout(r, VERIFY_DELAY_MS));

    setVerifyState('loading');
    try {
      const response = await fetch('/api/analytics/account?period=7d', {
        cache: 'no-store',
      });
      if (response.ok) {
        const data = await response.json();
        const exchanges = data?.exchanges ?? [];
        const found =
          exchange &&
          exchanges.some((e: { exchange: string }) => e.exchange === exchange);
        if (found) {
          setVerifyState('success');
          toast.success(t('verify.success'));
        } else {
          setVerifyState('success');
          toast.success(t('verify.successNoBalance'));
        }
      } else {
        setVerifyState('failed');
        toast.error(t('verify.failed'));
      }
    } catch {
      setVerifyState('failed');
      toast.error(t('verify.timeout'));
    }
  }, [exchange, t]);

  const handleFinish = useCallback(() => {
    onDismiss();
    router.refresh();
  }, [onDismiss, router]);

  // Inline form submit — save account then auto-verify
  const onInlineSubmit = useCallback(
    async (data: InlineFormValues) => {
      if (!exchange) return;
      setSaving(true);
      try {
        await saveAccount({
          exchange,
          accountId: data.accountId,
          apiKey: data.apiKey,
          secretKey: data.secretKey,
          passphrase: isOkx ? data.passphrase : undefined,
          isActive: true,
        });
        toast.success(tForm('messages.saved'));
        void handleSaveSuccess();
      } catch (error) {
        toast.error(tForm('errors.saveFailed'));
        console.error(error);
      } finally {
        setSaving(false);
      }
    },
    [exchange, isOkx, handleSaveSuccess, tForm],
  );

  const handleRetry = useCallback(() => {
    setVerifyState('idle');
    form.reset();
  }, [form]);

  const steps = [
    t('steps.intro'),
    t('steps.register'),
    t('steps.createApikey'),
    t('steps.addToItrade'),
  ];

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
    >
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        {/* Stepper */}
        <div className="flex items-center gap-2 mb-2">
          {steps.map((label, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <div
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  idx === step
                    ? 'bg-primary text-primary-foreground'
                    : idx < step
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {idx < step ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <span className="h-3 w-3 flex items-center justify-center text-[10px]">
                    {idx + 1}
                  </span>
                )}
                <span className="hidden sm:inline">{label}</span>
              </div>
              {idx < steps.length - 1 ? <div className="h-px w-4 bg-border" /> : null}
            </div>
          ))}
        </div>

        <DialogHeader>
          <DialogTitle className="text-xl">{t(`${STEP_KEYS[step]}.title`)}</DialogTitle>
          <DialogDescription>{t(`${STEP_KEYS[step]}.description`)}</DialogDescription>
        </DialogHeader>

        {/* Step 0: Intro + Exchange Selection */}
        {step === 0 ? (
          <div className="space-y-4">
            <div className="grid gap-3">
              {SUPPORTED_EXCHANGES.map((ex) => {
                const isSelected = selectedExchange === ex;
                return (
                  <button
                    key={ex}
                    type="button"
                    className={`flex w-full items-center justify-between rounded-lg border p-3 transition-colors cursor-pointer text-left ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'hover:border-primary/50'
                    }`}
                    onClick={() => handleSelectExchange(ex as SupportedExchange)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-bold">
                        {getExchangeDisplayName(ex as SupportedExchange).charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium">
                          {getExchangeDisplayName(ex as SupportedExchange)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t(`intro.exchanges.${ex}`)}
                        </p>
                      </div>
                    </div>
                    {isSelected ? (
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-between items-center pt-2">
              <Button variant="ghost" size="sm" onClick={onDismiss}>
                {t('common.later')}
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (exchange && regLink) {
                      window.open(regLink.web, '_blank', 'noopener');
                    }
                    handleGoToRegister();
                  }}
                  disabled={!exchange}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {t('common.goRegister')}
                </Button>
                <Button onClick={handleHaveAccount} disabled={!exchange}>
                  {t('common.haveAccount')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Step 1: Register Exchange Account */}
        {step === 1 ? (
          <div className="space-y-4">
            <div className="rounded-lg border p-4">
              <h4 className="font-medium mb-2">
                {t('register.guideTitle', {
                  exchange: exchange
                    ? getExchangeDisplayName(exchange as SupportedExchange)
                    : '',
                })}
              </h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-primary">1.</span>
                  <span>{t('register.step1')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-primary">2.</span>
                  <span>{t('register.step2')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 text-primary">3.</span>
                  <span>{t('register.step3')}</span>
                </li>
              </ul>
            </div>

            {kycLink ? (
              <a
                href={kycLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-primary hover:underline underline-offset-4"
              >
                <ExternalLink className="h-4 w-4" />
                {t('register.kycGuide')}
              </a>
            ) : null}

            {regLink ? (
              <a
                href={regLink.web}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-primary hover:underline underline-offset-4"
              >
                <Monitor className="h-4 w-4" />
                {t('register.registerLink')}
                <ExternalLink className="h-3 w-3 opacity-70" />
              </a>
            ) : null}

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={handleBack}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('common.back')}
              </Button>
              <Button onClick={handleGoToCreateApikey}>
                {t('common.completed')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}

        {/* Step 2: Create API Key */}
        {step === 2 ? (
          <div className="space-y-4">
            {guides ? (
              <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
                <p className="text-sm font-medium">
                  {t('createApikey.guideTitle', {
                    exchange: exchange
                      ? getExchangeDisplayName(exchange as SupportedExchange)
                      : '',
                  })}
                </p>
                <div className="flex flex-col gap-2">
                  <a
                    href={guides.web}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-primary hover:underline underline-offset-4"
                  >
                    <Monitor className="h-4 w-4 shrink-0" />
                    <span>{t('createApikey.webLink')}</span>
                    <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
                  </a>
                  <a
                    href={guides.mobile}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-primary hover:underline underline-offset-4"
                  >
                    <Smartphone className="h-4 w-4 shrink-0" />
                    <span>
                      {exchange === SupportedExchange.COINBASE
                        ? t('createApikey.mobileLinkCoinbase')
                        : t('createApikey.mobileLink')}
                    </span>
                    <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
                  </a>
                </div>
              </div>
            ) : null}

            {/* Required permissions */}
            {permissions ? (
              <div className="rounded-lg border p-4">
                <h4 className="text-sm font-medium mb-3">
                  {t('createApikey.permissionsTitle')}
                </h4>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      {t('createApikey.actions.required')}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {permissions.required.map((perm) => (
                        <Badge
                          key={perm}
                          variant="default"
                          className="bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300"
                        >
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          {perm}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Separator className="my-2" />
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      {t('createApikey.actions.forbidden')}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {permissions.forbidden.map((perm) => (
                        <Badge
                          key={perm}
                          variant="destructive"
                          className="bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300"
                        >
                          <ShieldAlert className="mr-1 h-3 w-3" />
                          {perm}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* IP whitelist notice */}
            <ApiKeyIpWhitelistNotice variant="modal" />

            <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30">
              <CircleAlert className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-900 dark:text-amber-100">
                {t('createApikey.securityTip.title')}
              </AlertTitle>
              <AlertDescription className="text-amber-900 dark:text-amber-100">
                {t('createApikey.securityTip.description', {
                  serverIp: ITRADE_SERVER_IP,
                })}
              </AlertDescription>
            </Alert>

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={handleBack}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('common.back')}
              </Button>
              <Button onClick={handleGoToAddToItrade}>
                {t('common.completed')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}

        {/* Step 3: Add API Key to iTrade — inline form */}
        {step === 3 ? (
          <div className="space-y-4">
            {/* Verify states */}
            {verifyState === 'loading' ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">{t('verify.loading')}</p>
              </div>
            ) : verifyState === 'success' ? (
              <div className="space-y-4">
                <div className="flex flex-col items-center gap-3 py-6">
                  <CheckCircle2 className="h-12 w-12 text-green-500" />
                  <p className="text-lg font-medium text-center">
                    {t('verify.successTitle')}
                  </p>
                  <p className="text-sm text-muted-foreground text-center max-w-md">
                    {t('verify.successDesc')}
                  </p>
                </div>
                <Button onClick={handleFinish} className="w-full">
                  {t('verify.viewDashboard')}
                </Button>
              </div>
            ) : verifyState === 'failed' ? (
              <div className="space-y-4">
                <div className="flex flex-col items-center gap-3 py-6">
                  <CircleAlert className="h-12 w-12 text-red-500" />
                  <p className="text-lg font-medium text-center">
                    {t('verify.failedTitle')}
                  </p>
                  <p className="text-sm text-muted-foreground text-center max-w-md">
                    {t('verify.failedDesc')}
                  </p>
                </div>
                <div className="rounded-lg border p-3 text-sm space-y-1">
                  <p className="font-medium">{t('verify.troubleshoot')}</p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1">
                    <li>{t('verify.troubleshoot1')}</li>
                    <li>{t('verify.troubleshoot2')}</li>
                    <li>{t('verify.troubleshoot3')}</li>
                  </ul>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleBack}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    {t('common.back')}
                  </Button>
                  <Button onClick={handleRetry}>{t('addToItrade.retry')}</Button>
                </div>
              </div>
            ) : (
              /* Idle state — inline form */
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onInlineSubmit)} className="space-y-4">
                  {/* Exchange badge (read-only) */}
                  {exchange ? (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">
                        {t('addToItrade.fields.exchange')}:
                      </span>
                      <Badge variant="secondary">
                        {getExchangeDisplayName(exchange as SupportedExchange)}
                      </Badge>
                    </div>
                  ) : null}

                  {/* Account ID / nickname */}
                  <FormField
                    control={form.control}
                    name="accountId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{tForm('fields.accountId')}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={tForm('fields.accountIdPlaceholder')}
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          {tForm('fields.accountIdDescription')}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* API Key */}
                  <FormField
                    control={form.control}
                    name="apiKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{tForm('fields.apiKey')}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={tForm('fields.apiKeyPlaceholder')}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Secret Key */}
                  <FormField
                    control={form.control}
                    name="secretKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{tForm('fields.secretKey')}</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder={tForm('fields.secretKeyPlaceholder')}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Passphrase — OKX only */}
                  {isOkx ? (
                    <FormField
                      control={form.control}
                      name="passphrase"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{tForm('fields.passphrase')}</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder={tForm('fields.passphrasePlaceholder')}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : null}

                  <Alert>
                    <ShieldAlert className="h-4 w-4" />
                    <AlertTitle>{t('addToItrade.security.title')}</AlertTitle>
                    <AlertDescription>
                      {t('addToItrade.security.description')}
                    </AlertDescription>
                  </Alert>

                  <div className="flex justify-between pt-2">
                    <Button type="button" variant="ghost" onClick={handleBack}>
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      {t('common.back')}
                    </Button>
                    <Button type="submit" disabled={saving}>
                      {saving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {tForm('saving')}
                        </>
                      ) : (
                        t('addToItrade.saveAndVerify')
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
