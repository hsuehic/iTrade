'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { IconAlertTriangle } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTradingPairs } from '@/hooks/use-trading-pairs';
import {
  canonicalPerpSymbol,
  TRADE_MODE_EXCHANGES,
  type MarginMode,
} from '@/lib/trade-mode';

export interface TradeModeDialogPosition {
  exchange: string;
  symbol: string;
}

interface TradeModeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Positions the page currently shows for the signed-in user. Used to warn
   * *before* the request: the exchange (and the API) refuse to switch a symbol
   * that still has a position, so the operator is told to close it first
   * instead of being handed a raw exchange error.
   */
  positions: TradeModeDialogPosition[];
  /** Called after a successful switch so the page can refresh its data. */
  onSwitched?: () => void;
  /** Exchange to preselect (e.g. the filter active on the page). */
  defaultExchange?: string;
}

interface AccountListItem {
  exchange: string;
  isActive: boolean;
}

/**
 * 🆕 Position-page entry point for switching a perpetual symbol between
 * isolated and cross margin on the exchange: pick exchange → pick perpetual
 * pair → pick mode. A pair that still has a position (or resting orders) is
 * flagged in the dialog and rejected by the API, never force-closed.
 */
export function TradeModeDialog({
  open,
  onOpenChange,
  positions,
  onSwitched,
  defaultExchange,
}: TradeModeDialogProps) {
  const t = useTranslations('positions.tradeMode');

  const [exchanges, setExchanges] = React.useState<string[]>([]);
  const [exchange, setExchange] = React.useState('');
  const [symbol, setSymbol] = React.useState('');
  const [tradeMode, setTradeMode] = React.useState<MarginMode>('isolated');
  const [currentMode, setCurrentMode] = React.useState<MarginMode | null>(null);
  const [isLoadingMode, setIsLoadingMode] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [accountsLoadFailed, setAccountsLoadFailed] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const { pairs, loading: isLoadingPairs } = useTradingPairs(exchange || undefined);

  const perpetualPairs = React.useMemo(
    () => pairs.filter((pair) => pair.type === 'perpetual'),
    [pairs],
  );

  // Only exchanges the user actually connected (and that support the switch).
  // NOTE: `t` is deliberately not a dependency — a translation function is not
  // guaranteed to be referentially stable, and re-running this effect would
  // cancel the in-flight request every render and leave the select empty.
  React.useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    const loadExchanges = async () => {
      try {
        const response = await fetch('/api/accounts');
        if (!response.ok) {
          throw new Error('Failed to load exchanges');
        }
        const accounts: AccountListItem[] = await response.json();
        const available = Array.from(
          new Set(
            accounts
              .filter(
                (account) =>
                  account.isActive &&
                  (TRADE_MODE_EXCHANGES as readonly string[]).includes(
                    account.exchange?.toLowerCase(),
                  ),
              )
              .map((account) => account.exchange.toLowerCase()),
          ),
        ).sort();

        if (cancelled) return;
        setExchanges(available);
        setAccountsLoadFailed(false);

        const preferred =
          defaultExchange &&
          available.includes(defaultExchange.toLowerCase()) &&
          defaultExchange.toLowerCase();
        setExchange((current) => current || preferred || available[0] || '');
      } catch {
        if (!cancelled) {
          setAccountsLoadFailed(true);
        }
      }
    };

    void loadExchanges();
    return () => {
      cancelled = true;
    };
  }, [open, defaultExchange]);

  // Reset the pair/mode selection whenever the exchange changes.
  React.useEffect(() => {
    setSymbol('');
    setCurrentMode(null);
  }, [exchange]);

  // Show what the pair is on right now (best effort — the exchange cannot
  // always report it for a flat symbol).
  React.useEffect(() => {
    if (!open || !exchange || !symbol) {
      setCurrentMode(null);
      return;
    }

    let cancelled = false;
    const loadCurrentMode = async () => {
      setIsLoadingMode(true);
      try {
        const response = await fetch(
          `/api/exchange/trade-mode?exchange=${encodeURIComponent(exchange)}&symbol=${encodeURIComponent(symbol)}`,
        );
        if (!response.ok) {
          if (!cancelled) setCurrentMode(null);
          return;
        }
        const data: { marginMode: MarginMode | null } = await response.json();
        if (!cancelled) setCurrentMode(data.marginMode ?? null);
      } catch {
        if (!cancelled) setCurrentMode(null);
      } finally {
        if (!cancelled) setIsLoadingMode(false);
      }
    };

    void loadCurrentMode();
    return () => {
      cancelled = true;
    };
  }, [open, exchange, symbol]);

  const openPosition = React.useMemo(
    () =>
      positions.find(
        (position) =>
          canonicalPerpSymbol(position.symbol) === canonicalPerpSymbol(symbol) &&
          position.exchange?.toLowerCase() === exchange,
      ),
    [positions, symbol, exchange],
  );

  const resetAndClose = React.useCallback(() => {
    setSymbol('');
    setCurrentMode(null);
    setError(null);
    onOpenChange(false);
  }, [onOpenChange]);

  const handleSubmit = React.useCallback(async () => {
    if (!exchange || !symbol || openPosition) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/exchange/trade-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exchange, symbol, tradeMode }),
      });
      const data: {
        changed?: boolean;
        error?: string;
        code?: string;
      } = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(
          data.code === 'position-open'
            ? t('errors.positionOpen')
            : data.code === 'open-orders'
              ? t('errors.openOrders')
              : data.code === 'multi-assets-mode'
                ? t('errors.multiAssetsMode')
                : data.error || t('errors.switchFailed'),
        );
        return;
      }

      toast.success(
        data.changed === false
          ? t('messages.alreadySet', { mode: t(`modes.${tradeMode}`) })
          : t('messages.changed', { mode: t(`modes.${tradeMode}`) }),
      );
      onSwitched?.();
      resetAndClose();
    } catch {
      setError(t('errors.switchFailed'));
    } finally {
      setIsSubmitting(false);
    }
  }, [exchange, symbol, tradeMode, openPosition, onSwitched, resetAndClose, t]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : resetAndClose())}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="trade-mode-exchange">{t('fields.exchange')}</Label>
            <Select value={exchange} onValueChange={setExchange}>
              <SelectTrigger id="trade-mode-exchange">
                <SelectValue placeholder={t('placeholders.exchange')} />
              </SelectTrigger>
              <SelectContent>
                {exchanges.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {exchanges.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {accountsLoadFailed ? t('errors.loadExchanges') : t('errors.noExchanges')}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="trade-mode-symbol">{t('fields.pair')}</Label>
            <Select value={symbol} onValueChange={setSymbol} disabled={!exchange}>
              <SelectTrigger id="trade-mode-symbol">
                <SelectValue placeholder={t('placeholders.pair')} />
              </SelectTrigger>
              <SelectContent>
                {perpetualPairs.map((pair) => (
                  <SelectItem key={pair.symbol} value={pair.symbol}>
                    {pair.symbol}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {exchange && !isLoadingPairs && perpetualPairs.length === 0 && (
              <p className="text-xs text-muted-foreground">{t('errors.noPairs')}</p>
            )}
            {symbol && (
              <p className="text-xs text-muted-foreground">
                {isLoadingMode
                  ? t('currentModeLoading')
                  : currentMode
                    ? t('currentMode', { mode: t(`modes.${currentMode}`) })
                    : t('currentModeUnknown')}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="trade-mode-mode">{t('fields.mode')}</Label>
            <Select
              value={tradeMode}
              onValueChange={(value) => setTradeMode(value as MarginMode)}
            >
              <SelectTrigger id="trade-mode-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="isolated">{t('modes.isolated')}</SelectItem>
                <SelectItem value="cross">{t('modes.cross')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {openPosition && (
            <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
              <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t('errors.positionOpen')}</span>
            </div>
          )}

          {error && <p className="text-sm text-rose-500">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose} disabled={isSubmitting}>
            {t('actions.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !exchange || !symbol || Boolean(openPosition)}
          >
            {isSubmitting ? t('actions.submitting') : t('actions.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
