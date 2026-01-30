'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
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
      toast.success('Account saved successfully');
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to save account');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Edit Account' : 'Add Account'}</DialogTitle>
          <DialogDescription>
            Enter your exchange API credentials. They will be encrypted securely.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="exchange"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Exchange</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select exchange" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="binance">Binance</SelectItem>
                      <SelectItem value="okx">OKX</SelectItem>
                      <SelectItem value="coinbase">Coinbase</SelectItem>
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
                  <FormLabel>Account Name / ID</FormLabel>
                  <FormControl>
                    <Input placeholder="Main Account" {...field} />
                  </FormControl>
                  <FormDescription>
                    A nickname to identify this account.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="apiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>API Key</FormLabel>
                  <FormControl>
                    <Input placeholder="API Key" {...field} />
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
                  <FormLabel>Secret Key</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="Secret Key" {...field} />
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
                    <FormLabel>Passphrase</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Passphrase" {...field} />
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
                    <FormLabel className="text-base">Active Status</FormLabel>
                    <FormDescription>
                      Enable or disable trading for this account.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={loading}>
                {loading ? 'Saving...' : 'Save changes'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
