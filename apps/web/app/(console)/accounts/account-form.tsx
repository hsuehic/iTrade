'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { isKnownVerifyErrorReason } from '@/lib/verify-reasons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

import { ApiKeyIpWhitelistNotice } from '@/components/accounts/api-key-ip-whitelist-notice';
import { ExchangeApiKeyGuideLinks } from '@/components/accounts/exchange-api-key-guide-links';
import { saveAccount } from '@/app/actions/accounts';
import {
  SupportedExchange,
  SUPPORTED_EXCHANGES,
  getExchangeDisplayName,
} from '@itrade/data-manager/constants';

interface AccountFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  initialData?: AccountFormInitialData;
}

export interface AccountFormValues {
  exchange: string;
  accountId: string;
  apiKey: string;
  secretKey: string;
  passphrase?: string;
  isActive: boolean;
}

export type AccountFormInitialData = Partial<AccountFormValues> & { id?: number };

export function AccountForm({
  open,
  onOpenChange,
  onSuccess,
  initialData,
}: AccountFormProps) {
  const t = useTranslations('accounts.form');
  const [loading, setLoading] = useState(false);
  const isEditing = !!initialData?.id;
  const defaultValues: AccountFormValues = {
    exchange: '',
    accountId: '',
    apiKey: '',
    secretKey: '',
    passphrase: '',
    isActive: true,
  };
  const form = useForm<AccountFormValues>({
    // On edit, NEVER pre-fill credentials: apiKey comes from the list as a
    // MASKED value (`63f7***fd3`) and secretKey/passphrase are not returned
    // by the API at all. Submitting those would destroy the stored keys
    // (server now also guards, but keep the form honest).
    defaultValues: initialData
      ? {
          ...defaultValues,
          exchange: initialData.exchange ?? '',
          accountId: initialData.accountId ?? '',
          isActive: initialData.isActive ?? true,
        }
      : defaultValues,
  });
  const selectedExchange = form.watch('exchange');

  const [verifyError, setVerifyError] = useState<{
    reason: string;
    venueCode: string;
    venueMessage: string;
  } | null>(null);

  // Clear the stale error banner when the dialog closes so reopening for a
  // DIFFERENT account never shows the previous account's failure.
  useEffect(() => {
    if (!open) setVerifyError(null);
  }, [open]);

  async function onSubmit(data: AccountFormValues) {
    try {
      setLoading(true);
      setVerifyError(null);
      const result = await saveAccount({ ...data, id: initialData?.id });
      if (result && result.success === false) {
        // Credential verification failed at the venue — show it inline so
        // the user sees exactly what the exchange rejected (e.g. OKX 50105
        // passphrase incorrect) instead of a generic "save failed".
        setVerifyError(result.error);
        toast.error(t('errors.verifyFailed'));
        return;
      }
      toast.success(t('messages.saved'));
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error(t('errors.saveFailed'));
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{initialData ? t('titleEdit') : t('titleAdd')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        {!initialData ? <ApiKeyIpWhitelistNotice variant="modal" /> : null}
        {isEditing ? (
          <p className="text-sm text-muted-foreground">{t('editCredentialsHint')}</p>
        ) : null}
        {verifyError ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm"
          >
            <p className="font-medium text-destructive">
              {isKnownVerifyErrorReason(verifyError.reason)
                ? t(`verifyErrors.${verifyError.reason}`)
                : t('errors.verifyFailed')}
            </p>
            {verifyError.venueMessage ? (
              <p className="mt-1 text-muted-foreground">
                {verifyError.venueCode ? `[${verifyError.venueCode}] ` : ''}
                {verifyError.venueMessage}
              </p>
            ) : null}
          </div>
        ) : null}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="exchange"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('fields.exchange')}</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('fields.exchangePlaceholder')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {SUPPORTED_EXCHANGES.map((ex) => (
                        <SelectItem key={ex} value={ex}>
                          {getExchangeDisplayName(ex as SupportedExchange)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {!initialData && selectedExchange ? (
              <ExchangeApiKeyGuideLinks exchange={selectedExchange} />
            ) : null}
            <FormField
              control={form.control}
              name="accountId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('fields.accountId')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('fields.accountIdPlaceholder')} {...field} />
                  </FormControl>
                  <FormDescription>{t('fields.accountIdDescription')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="apiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('fields.apiKey')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={
                        isEditing
                          ? t('fields.apiKeyKeepPlaceholder')
                          : t('fields.apiKeyPlaceholder')
                      }
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="secretKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('fields.secretKey')}</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder={
                        isEditing
                          ? t('fields.secretKeyKeepPlaceholder')
                          : t('fields.secretKeyPlaceholder')
                      }
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {form.watch('exchange') === 'okx' && (
              <FormField
                control={form.control}
                name="passphrase"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('fields.passphrase')}</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder={
                          isEditing
                            ? t('fields.passphraseKeepPlaceholder')
                            : t('fields.passphrasePlaceholder')
                        }
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">
                      {t('fields.activeStatus')}
                    </FormLabel>
                    <FormDescription>{t('fields.activeDescription')}</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={loading}>
                {loading ? t('saving') : t('save')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
