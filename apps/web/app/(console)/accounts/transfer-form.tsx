'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  getTransferWallets,
  getWalletBalances,
  transferFunds,
} from '@/app/actions/transfers';
import { AccountWalletType } from '@itrade/core';
import {
  getExchangeDisplayName,
  SupportedExchange,
} from '@itrade/data-manager/constants';

export interface TransferFormAccount {
  id: number;
  exchange: string;
  accountId: string;
}

interface TransferFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  account: TransferFormAccount | null;
}

const WALLET_LABEL_KEY: Record<AccountWalletType, string> = {
  [AccountWalletType.FUNDING]: 'wallets.funding',
  [AccountWalletType.SPOT]: 'wallets.spot',
  [AccountWalletType.PERPETUAL]: 'wallets.perpetual',
  [AccountWalletType.TRADING]: 'wallets.trading',
  // EARN is read-only (never in getSupportedTransferWallets), listed only to
  // keep this Record exhaustive over the enum.
  [AccountWalletType.EARN]: 'wallets.earn',
};

export function TransferForm({
  open,
  onOpenChange,
  onSuccess,
  account,
}: TransferFormProps) {
  const t = useTranslations('accounts.transfer');

  const [wallets, setWallets] = useState<AccountWalletType[]>([]);
  // 🆕 Must be `undefined` (not `''`) when unset — Radix's Select treats an
  // empty-string controlled value as its own internal "no selection"
  // sentinel, which breaks selection entirely (clicking an item never
  // updates the trigger or fires onValueChange again for the same root).
  const [from, setFrom] = useState<AccountWalletType | undefined>(undefined);
  const [to, setTo] = useState<AccountWalletType | undefined>(undefined);
  const [asset, setAsset] = useState('');
  const [amount, setAmount] = useState('');
  const [available, setAvailable] = useState<string | null>(null);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const initializedForRef = useRef<string | null>(null);

  const accountId = account?.id;
  const accountExchange = account?.exchange;

  // Reset form state when the dialog opens for a (possibly different) account.
  useEffect(() => {
    if (!open || accountId == null || !accountExchange) {
      if (!open) initializedForRef.current = null;
      return;
    }

    const initKey = `${accountId}:${accountExchange}`;
    if (initializedForRef.current === initKey) return;
    initializedForRef.current = initKey;

    setFrom(undefined);
    setTo(undefined);
    setAsset('');
    setAmount('');
    setAvailable(null);

    getTransferWallets(accountExchange)
      .then(setWallets)
      .catch(() => {
        setWallets([]);
        toast.error(t('errors.loadWalletsFailed'));
      });
  }, [open, accountId, accountExchange, t]);

  // Whenever the "from" wallet or asset changes, look up the available balance.
  useEffect(() => {
    setAvailable(null);
    if (!account || !from || !asset.trim()) return;

    let cancelled = false;
    setBalancesLoading(true);
    getWalletBalances(account.id, from)
      .then((balances) => {
        if (cancelled) return;
        const match = balances.find(
          (b) => b.asset.toUpperCase() === asset.trim().toUpperCase(),
        );
        setAvailable(match ? match.free : '0');
      })
      .catch(() => {
        if (!cancelled) setAvailable(null);
      })
      .finally(() => {
        if (!cancelled) setBalancesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [account, from, asset]);

  if (!account) return null;

  const toOptions = wallets.filter((w) => w !== from);
  const fromOptions = wallets.filter((w) => w !== to);

  const canSubmit =
    !!from && !!to && from !== to && !!asset.trim() && !!amount && Number(amount) > 0;

  async function handleSubmit() {
    if (!account || !from || !to) return;
    try {
      setSubmitting(true);
      await transferFunds({
        accountId: account.id,
        asset: asset.trim(),
        amount,
        from,
        to,
      });
      toast.success(t('messages.success'));
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errors.transferFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t('description', {
              exchange: getExchangeDisplayName(account.exchange as SupportedExchange),
              account: account.accountId,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t('fields.from')}</Label>
              <Select
                value={from}
                onValueChange={(value) => setFrom(value as AccountWalletType)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('fields.selectWallet')} />
                </SelectTrigger>
                <SelectContent container={false}>
                  {fromOptions.map((w) => (
                    <SelectItem key={w} value={w}>
                      {t(WALLET_LABEL_KEY[w])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('fields.to')}</Label>
              <Select
                value={to}
                onValueChange={(value) => setTo(value as AccountWalletType)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('fields.selectWallet')} />
                </SelectTrigger>
                <SelectContent container={false}>
                  {toOptions.map((w) => (
                    <SelectItem key={w} value={w}>
                      {t(WALLET_LABEL_KEY[w])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('fields.asset')}</Label>
            <Input
              id="transfer-asset"
              autoComplete="off"
              placeholder={t('fields.assetPlaceholder')}
              value={asset}
              onChange={(e) => setAsset(e.target.value.toUpperCase())}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t('fields.amount')}</Label>
              {from && asset.trim() && (
                <span className="text-xs text-muted-foreground">
                  {balancesLoading
                    ? t('fields.checkingBalance')
                    : available !== null
                      ? t('fields.available', { amount: available })
                      : null}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                id="transfer-amount"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
              />
              {available !== null && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAmount(available)}
                >
                  {t('fields.max')}
                </Button>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t('cancel')}
          </Button>
          <Button
            type="button"
            disabled={!canSubmit || submitting}
            onClick={handleSubmit}
          >
            {submitting ? t('submitting') : t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
