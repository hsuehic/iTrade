'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { z } from 'zod';

import { ExchangeSelector } from '@/components/exchange-selector';
import { OrdersTable } from '@/components/orders-table';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  ExchangeId,
  SUPPORTED_EXCHANGES,
  getDefaultTradingPair,
  getSymbolFormatHint,
  parseSymbol,
} from '@/lib/exchanges';

// Configurable refresh interval (milliseconds)
const REFRESH_INTERVAL = parseInt(
  process.env.NEXT_PUBLIC_DASHBOARD_REFRESH_INTERVAL || '30000',
);

const manualOrderSchema = z
  .object({
    exchange: z.string().min(1, 'Exchange is required'),
    symbol: z.string().min(3, 'Symbol is required'),
    side: z.enum(['BUY', 'SELL']),
    type: z.enum(['MARKET', 'LIMIT']),
    quantity: z.string().min(1, 'Quantity is required'),
    price: z.string().optional(),
    positionAction: z
      .enum(['OPEN_LONG', 'OPEN_SHORT', 'CLOSE_LONG', 'CLOSE_SHORT'])
      .optional(),
  })
  .superRefine((data, ctx) => {
    const quantity = Number(data.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Quantity must be a positive number',
        path: ['quantity'],
      });
    }
    if (data.type === 'LIMIT') {
      const price = Number(data.price);
      if (!Number.isFinite(price) || price <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Price must be a positive number for limit orders',
          path: ['price'],
        });
      }
    }

    if (data.positionAction) {
      const isPerpetual = data.symbol.includes(':');
      if (!isPerpetual) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Position action is only supported for perpetual symbols',
          path: ['positionAction'],
        });
      }
      const expectedSide =
        data.positionAction === 'OPEN_LONG' || data.positionAction === 'CLOSE_SHORT'
          ? 'BUY'
          : 'SELL';
      if (data.side !== expectedSide) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Position action does not match side',
          path: ['positionAction'],
        });
      }
    }
  });

type ManualOrderForm = z.infer<typeof manualOrderSchema>;

const toExchangeId = (value: string): ExchangeId | null =>
  SUPPORTED_EXCHANGES.some((exchange) => exchange.id === value)
    ? (value as ExchangeId)
    : null;

const validateManualOrder = (values: ManualOrderForm) => {
  const parsed = manualOrderSchema.safeParse(values);
  if (parsed.success) return {};

  return parsed.error.issues.reduce<Record<string, string>>((acc, issue) => {
    const key = issue.path[0];
    if (typeof key === 'string' && !acc[key]) {
      acc[key] = issue.message;
    }
    return acc;
  }, {});
};

const useDebouncedValue = <T,>(value: T, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timeoutId);
  }, [value, delay]);

  return debouncedValue;
};

export default function TransactionPage() {
  const t = useTranslations('portfolio.transaction');
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get('status') || undefined;
  const exchangeFilter = searchParams.get('exchange') || undefined;

  // When URL has exchange filter, use it; otherwise use local state
  const [localExchange, setLocalExchange] = useState('all');
  const [availableExchanges, setAvailableExchanges] = useState<string[]>([]);
  const [refreshToken, setRefreshToken] = useState(0);
  const [manualOrder, setManualOrder] = useState<ManualOrderForm>({
    exchange: '',
    symbol: '',
    side: 'BUY',
    type: 'MARKET',
    quantity: '',
    price: '',
    positionAction: undefined,
  });
  const [manualErrors, setManualErrors] = useState<Record<string, string>>({});
  const [manualTouched, setManualTouched] = useState<Record<string, boolean>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assetBalances, setAssetBalances] = useState<Record<string, number>>({});
  const [balancesStatus, setBalancesStatus] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const isFormValid = Object.keys(validateManualOrder(manualOrder)).length === 0;

  // Derive the effective exchange from URL or local state
  const selectedExchange = exchangeFilter || localExchange;

  // When user changes via selector, only update local state (URL filter takes priority)
  const handleExchangeChange = (value: string) => {
    setLocalExchange(value);
  };

  useEffect(() => {
    // Fetch available exchanges from orders API
    const fetchExchanges = async () => {
      try {
        const accountsResponse = await fetch('/api/accounts');
        if (accountsResponse.ok) {
          const accounts = await accountsResponse.json();
          const rawAccountExchanges = Array.isArray(accounts)
            ? accounts
                .map((acc: { exchange?: string }) => acc.exchange)
                .filter((exchange): exchange is string => Boolean(exchange))
            : [];
          const uniqueAccountExchanges = Array.from(new Set<string>(rawAccountExchanges));
          const accountExchanges = uniqueAccountExchanges.filter(
            (exchange): exchange is string =>
              Boolean(exchange) && Boolean(toExchangeId(exchange)),
          );
          if (accountExchanges.length > 0) {
            setAvailableExchanges(accountExchanges);
            return;
          }
        }

        const ordersResponse = await fetch('/api/orders');
        if (ordersResponse.ok) {
          const data = await ordersResponse.json();
          // Extract unique exchanges from orders
          const orders = Array.isArray(data.orders) ? data.orders : [];
          const rawOrderExchanges = orders
            .map((o: { exchange?: string }) => o.exchange)
            .filter((exchange: string | undefined): exchange is string =>
              Boolean(exchange),
            );
          const uniqueOrderExchanges = Array.from(new Set<string>(rawOrderExchanges));
          const exchanges = uniqueOrderExchanges.filter(
            (exchange): exchange is string =>
              Boolean(exchange) && Boolean(toExchangeId(exchange)),
          );
          setAvailableExchanges(exchanges);
        }
      } catch (error) {
        console.error('Failed to fetch exchanges:', error);
      }
    };

    fetchExchanges();
  }, []);

  useEffect(() => {
    const defaultExchange =
      selectedExchange !== 'all' ? selectedExchange : availableExchanges[0] || '';
    const defaultExchangeId = defaultExchange ? toExchangeId(defaultExchange) : null;

    if (!defaultExchange || !defaultExchangeId) return;

    setManualOrder((prev) => {
      if (prev.exchange === defaultExchange) return prev;
      return {
        ...prev,
        exchange: defaultExchange,
        symbol: prev.symbol || getDefaultTradingPair(defaultExchangeId),
      };
    });
  }, [availableExchanges, selectedExchange]);

  useEffect(() => {
    if (!manualOrder.exchange || manualOrder.exchange === 'all') {
      setAssetBalances({});
      setBalancesStatus('idle');
      return;
    }

    const controller = new AbortController();
    const fetchBalances = async () => {
      try {
        setBalancesStatus('loading');
        const response = await fetch(
          `/api/portfolio/assets?exchange=${encodeURIComponent(manualOrder.exchange)}`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          throw new Error('Failed to load balances');
        }
        const data = await response.json();
        const assets = Array.isArray(data.assets) ? data.assets : [];
        const nextBalances: Record<string, number> = {};
        assets.forEach((asset: { asset?: string; free?: number }) => {
          if (!asset.asset) return;
          nextBalances[asset.asset.toUpperCase()] = Number(asset.free || 0);
        });
        setAssetBalances(nextBalances);
        setBalancesStatus('ready');
      } catch (error) {
        if ((error as { name?: string }).name === 'AbortError') return;
        setBalancesStatus('error');
      }
    };

    fetchBalances();

    return () => controller.abort();
  }, [manualOrder.exchange, refreshToken]);

  const debouncedManualOrder = useDebouncedValue(manualOrder, 500);

  useEffect(() => {
    const shouldValidate = submitAttempted || Object.values(manualTouched).some(Boolean);
    if (!shouldValidate) return;

    setManualErrors(validateManualOrder(debouncedManualOrder));
  }, [debouncedManualOrder, manualTouched, submitAttempted]);

  const handleManualBlur = (field: keyof ManualOrderForm) => {
    setManualTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleManualSubmit = async () => {
    setSubmitAttempted(true);
    const errors = validateManualOrder(manualOrder);
    setManualErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      setIsSubmitting(true);
      const payload = {
        exchange: manualOrder.exchange,
        symbol: manualOrder.symbol.trim().toUpperCase(),
        side: manualOrder.side,
        type: manualOrder.type,
        quantity: manualOrder.quantity.trim(),
        price:
          manualOrder.type === 'LIMIT'
            ? manualOrder.price?.trim() || undefined
            : undefined,
        positionAction: manualOrder.positionAction || undefined,
      };

      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || t('manualOrder.errors.submitFailed'));
      }

      toast.success(t('manualOrder.messages.placed'));
      setManualOrder((prev) => ({
        ...prev,
        quantity: '',
        price: '',
      }));
      setManualErrors({});
      setManualTouched({});
      setSubmitAttempted(false);
      setRefreshToken((prev) => prev + 1);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('manualOrder.errors.submitFailed');
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const baseAsset = parseSymbol(manualOrder.symbol).base.toUpperCase();
  const isSpotSymbol = Boolean(baseAsset) && !manualOrder.symbol.includes(':');
  const availableBaseBalance = baseAsset ? (assetBalances[baseAsset] ?? 0) : 0;
  const canShowSellAll = manualOrder.side === 'SELL' && isSpotSymbol;

  const formatBalance = (value: number) => {
    if (!Number.isFinite(value)) return '0';
    return value.toFixed(8).replace(/\.?0+$/, '');
  };

  // Use a key to reset OrdersTable when URL filters change
  const tableKey = `${statusFilter || 'all'}-${exchangeFilter || 'all'}`;

  return (
    <SidebarInset>
      <SiteHeader
        title={t('title')}
        links={
          <ExchangeSelector
            value={selectedExchange}
            onChange={handleExchangeChange}
            exchanges={availableExchanges}
          />
        }
      />
      <div className="flex flex-1 flex-col main-content">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            {/* Manual Order Form */}
            <div className="px-4 lg:px-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t('manualOrder.title')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-6">
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="manual-exchange">
                        {t('manualOrder.fields.exchange')}
                      </Label>
                      <Select
                        value={manualOrder.exchange}
                        onValueChange={(value) => {
                          const exchangeId = toExchangeId(value);
                          setManualOrder((prev) => ({
                            ...prev,
                            exchange: value,
                            symbol:
                              prev.symbol ||
                              (exchangeId ? getDefaultTradingPair(exchangeId) : ''),
                          }));
                          handleManualBlur('exchange');
                        }}
                      >
                        <SelectTrigger id="manual-exchange">
                          <SelectValue
                            placeholder={t('manualOrder.fields.exchangePlaceholder')}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {availableExchanges.map((exchange) => (
                            <SelectItem key={exchange} value={exchange}>
                              {exchange.toUpperCase()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {manualOrder.exchange.toLowerCase() === 'binance' && (
                        <p className="text-xs text-muted-foreground">
                          {t('manualOrder.fields.binanceOneWayHint')}
                        </p>
                      )}
                      {(submitAttempted || manualTouched.exchange) &&
                        manualErrors.exchange && (
                          <p className="text-sm text-rose-500">{manualErrors.exchange}</p>
                        )}
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="manual-symbol">
                        {t('manualOrder.fields.symbol')}
                      </Label>
                      <Input
                        id="manual-symbol"
                        value={manualOrder.symbol}
                        placeholder={
                          manualOrder.exchange
                            ? getSymbolFormatHint(manualOrder.exchange)
                            : t('manualOrder.fields.symbolPlaceholder')
                        }
                        onChange={(event) =>
                          setManualOrder((prev) => ({
                            ...prev,
                            symbol: event.target.value.toUpperCase(),
                          }))
                        }
                        onBlur={() => handleManualBlur('symbol')}
                      />
                      {(submitAttempted || manualTouched.symbol) &&
                        manualErrors.symbol && (
                          <p className="text-sm text-rose-500">{manualErrors.symbol}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="manual-side">{t('manualOrder.fields.side')}</Label>
                      <Select
                        value={manualOrder.side}
                        onValueChange={(value) =>
                          setManualOrder((prev) => ({
                            ...prev,
                            side: value as ManualOrderForm['side'],
                          }))
                        }
                      >
                        <SelectTrigger id="manual-side">
                          <SelectValue
                            placeholder={t('manualOrder.fields.sidePlaceholder')}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="BUY">
                            {t('manualOrder.fields.buy')}
                          </SelectItem>
                          <SelectItem value="SELL">
                            {t('manualOrder.fields.sell')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="manual-type">{t('manualOrder.fields.type')}</Label>
                      <Select
                        value={manualOrder.type}
                        onValueChange={(value) =>
                          setManualOrder((prev) => ({
                            ...prev,
                            type: value as ManualOrderForm['type'],
                          }))
                        }
                      >
                        <SelectTrigger id="manual-type">
                          <SelectValue
                            placeholder={t('manualOrder.fields.typePlaceholder')}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MARKET">
                            {t('manualOrder.fields.market')}
                          </SelectItem>
                          <SelectItem value="LIMIT">
                            {t('manualOrder.fields.limit')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="manual-quantity">
                        {t('manualOrder.fields.quantity')}
                      </Label>
                      <Input
                        id="manual-quantity"
                        inputMode="decimal"
                        value={manualOrder.quantity}
                        placeholder={t('manualOrder.fields.quantityPlaceholder')}
                        onChange={(event) =>
                          setManualOrder((prev) => ({
                            ...prev,
                            quantity: event.target.value,
                          }))
                        }
                        onBlur={() => handleManualBlur('quantity')}
                      />
                      {canShowSellAll && (
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>
                            {balancesStatus === 'loading'
                              ? t('manualOrder.fields.loadingBalance')
                              : balancesStatus === 'error'
                                ? t('manualOrder.fields.balanceUnavailable')
                                : t('manualOrder.fields.availableBalance', {
                                    amount: formatBalance(availableBaseBalance),
                                    asset: baseAsset,
                                  })}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (availableBaseBalance <= 0) return;
                              setManualOrder((prev) => ({
                                ...prev,
                                quantity: formatBalance(availableBaseBalance),
                              }));
                              setManualTouched((prev) => ({ ...prev, quantity: true }));
                            }}
                            disabled={
                              isSubmitting ||
                              balancesStatus !== 'ready' ||
                              availableBaseBalance <= 0
                            }
                          >
                            {t('manualOrder.fields.sellAll')}
                          </Button>
                        </div>
                      )}
                      {(submitAttempted || manualTouched.quantity) &&
                        manualErrors.quantity && (
                          <p className="text-sm text-rose-500">{manualErrors.quantity}</p>
                        )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="manual-price">
                        {t('manualOrder.fields.price')}
                      </Label>
                      <Input
                        id="manual-price"
                        inputMode="decimal"
                        value={manualOrder.price}
                        placeholder={t('manualOrder.fields.pricePlaceholder')}
                        onChange={(event) =>
                          setManualOrder((prev) => ({
                            ...prev,
                            price: event.target.value,
                          }))
                        }
                        onBlur={() => handleManualBlur('price')}
                        disabled={manualOrder.type !== 'LIMIT'}
                      />
                      {(submitAttempted || manualTouched.price) && manualErrors.price && (
                        <p className="text-sm text-rose-500">{manualErrors.price}</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-4">
                    <p className="text-sm text-muted-foreground">
                      {t('manualOrder.helper')}
                    </p>
                    <Button
                      onClick={handleManualSubmit}
                      disabled={
                        isSubmitting || !isFormValid || availableExchanges.length === 0
                      }
                    >
                      {isSubmitting
                        ? t('manualOrder.actions.submitting')
                        : t('manualOrder.actions.submit')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Orders Table */}
            <div className="px-4 lg:px-6">
              <OrdersTable
                key={tableKey}
                selectedExchange={selectedExchange}
                refreshInterval={REFRESH_INTERVAL}
                initialStatusFilter={statusFilter}
                refreshToken={refreshToken}
              />
            </div>
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}
