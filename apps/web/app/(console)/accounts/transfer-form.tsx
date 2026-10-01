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
  getIsolatedMarginSymbols,
  getTransferRoutes,
  getWalletBalances,
  transferFunds,
} from '@/app/actions/transfers';
import { AccountWalletType, transferRouteNeedsSymbol, TransferRoute } from '@itrade/core';
import {
  getExchangeDisplayName,
  SupportedExchange,
} from '@itrade/data-manager/constants';

export interface TransferFormAccount {
  id: number;
  exchange: string;
  accountId: string;
}

// 🆕 Exchanges whose connector implements wallet-to-wallet transfers. Kept
// here (next to the form) so the Accounts page and the Internal Transfers page
// share one list instead of each hardcoding it.
export const TRANSFER_CAPABLE_EXCHANGES = new Set(['binance', 'okx']);

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
  [AccountWalletType.EARN]: 'wallets.earn',
  [AccountWalletType.COIN_M]: 'wallets.coinM',
  [AccountWalletType.MARGIN]: 'wallets.margin',
  [AccountWalletType.ISOLATED_MARGIN]: 'wallets.isolatedMargin',
  [AccountWalletType.OPTION]: 'wallets.option',
};

// 🆕 Dropdowns are driven by the routes @itrade/core declares for the exchange
// (not a flat wallet list) because not every pair is valid — e.g. Binance
// supports Spot <-> Earn but there is no Funding <-> Earn route.

export function TransferForm({
  open,
  onOpenChange,
  onSuccess,
  account,
}: TransferFormProps) {
  const t = useTranslations('accounts.transfer');

  const [routes, setRoutes] = useState<TransferRoute[]>([]);
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
  // 🆕 Isolated margin keeps one balance per pair, so a route that touches it
  // also has to name the pair (e.g. BTCUSDT). The options are only fetched when
  // some route actually asks for them.
  const [symbol, setSymbol] = useState('');
  const [symbolOptions, setSymbolOptions] = useState<string[]>([]);
  const [symbolsLoading, setSymbolsLoading] = useState(false);
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
    setSymbol('');
    setSymbolOptions([]);

    getTransferRoutes(accountExchange)
      .then(setRoutes)
      .catch(() => {
        setRoutes([]);
        toast.error(t('errors.loadWalletsFailed'));
      });
  }, [open, accountId, accountExchange, t]);

  // Whenever the "from" wallet or asset changes, look up the available balance.
  useEffect(() => {
    setAvailable(null);
    if (!account || !from || !asset.trim()) return;
    // Isolated margin has one balance per pair: until the pair is picked the
    // connector would only report the total across every pair, which is not
    // what the user can actually move out of.
    if (from === AccountWalletType.ISOLATED_MARGIN && !symbol) return;

    let cancelled = false;
    setBalancesLoading(true);
    getWalletBalances(account.id, from, symbol || undefined)
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
  }, [account, from, asset, symbol]);

  // 🆕 Isolated margin balances are per pair, so a transfer that touches it only
  // becomes submittable once the pair is chosen. The rule lives in @itrade/core
  // (transferRouteNeedsSymbol) and is re-checked server-side.
  const isolatedRoute =
    !!from && !!to && transferRouteNeedsSymbol(accountExchange ?? '', from, to);
  // Show the pair picker as soon as isolated margin is on *either* side, so the
  // wallet can be addressed before the other side is picked. Only Binance routes
  // ever contain ISOLATED_MARGIN and `routes` is sourced per exchange, so an
  // OKX/Coinbase account cannot get here with a stale selection.
  const showSymbolField =
    from === AccountWalletType.ISOLATED_MARGIN ||
    to === AccountWalletType.ISOLATED_MARGIN;

  useEffect(() => {
    if (!open || !accountId || !showSymbolField || symbolOptions.length > 0) return;

    let cancelled = false;
    setSymbolsLoading(true);
    getIsolatedMarginSymbols(accountId)
      .then((symbols) => {
        if (!cancelled) setSymbolOptions(symbols);
      })
      .catch(() => {
        if (!cancelled) {
          setSymbolOptions([]);
          toast.error(t('errors.loadSymbolsFailed'));
        }
      })
      .finally(() => {
        if (!cancelled) setSymbolsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, accountId, showSymbolField, symbolOptions.length, t]);

  if (!account) return null;

  const fromOptions = Array.from(new Set(routes.map((route) => route.from)));
  const toOptions = from
    ? routes.filter((route) => route.from === from).map((route) => route.to)
    : [];

  const canSubmit =
    !!from &&
    !!to &&
    from !== to &&
    !!asset.trim() &&
    !!amount &&
    Number(amount) > 0 &&
    // Isolated margin routes are incomplete without the pair.
    (!isolatedRoute || !!symbol);

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
        // Only carry the pair when this route actually uses it, so stale state
        // from an earlier isolated-margin selection can't ride along.
        symbol: isolatedRoute ? symbol : undefined,
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
                onValueChange={(value) => {
                  const nextFrom = value as AccountWalletType;
                  setFrom(nextFrom);
                  // Drop a now-invalid destination instead of leaving a pair
                  // the exchange would reject (e.g. Funding -> Earn).
                  setTo((prevTo) =>
                    prevTo &&
                    routes.some((route) => route.from === nextFrom && route.to === prevTo)
                      ? prevTo
                      : undefined,
                  );
                }}
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

          {showSymbolField && (
            <div className="space-y-2">
              <Label>{t('fields.symbol')}</Label>
              <Select
                value={symbol || undefined}
                onValueChange={setSymbol}
                disabled={symbolsLoading}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={
                      symbolsLoading
                        ? t('fields.loadingSymbols')
                        : t('fields.selectSymbol')
                    }
                  />
                </SelectTrigger>
                <SelectContent container={false}>
                  {symbolOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t('fields.symbolHint')}</p>
            </div>
          )}

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
