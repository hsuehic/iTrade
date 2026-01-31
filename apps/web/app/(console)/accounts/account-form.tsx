'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
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
  initialData?: any;
}

export function AccountForm({
  open,
  onOpenChange,
  onSuccess,
  initialData,
}: AccountFormProps) {
  const t = useTranslations('accounts.form');
  const [loading, setLoading] = useState(false);
  const form = useForm({
    defaultValues: initialData || {
      exchange: '',
      accountId: '',
      apiKey: '',
      secretKey: '',
      passphrase: '',
      isActive: true,
    },
  });

  async function onSubmit(data: any) {
    try {
      setLoading(true);
      await saveAccount({ ...data, id: initialData?.id });
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
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{initialData ? t('titleEdit') : t('titleAdd')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
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
                    <Input placeholder={t('fields.apiKeyPlaceholder')} {...field} />
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
                      placeholder={t('fields.secretKeyPlaceholder')}
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
                        placeholder={t('fields.passphrasePlaceholder')}
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
