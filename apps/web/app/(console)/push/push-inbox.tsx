'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { IconCheck, IconSearch, IconTrash } from '@tabler/icons-react';

import { Badge } from '@/components/ui/badge';
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
import { cn } from '@/lib/utils';
import {
  addPushInboxMessage,
  clearPushInbox,
  getPushInboxMessages,
  markPushInboxRead,
  normalizePushPayload,
  subscribePushInbox,
  type PushInboxMessage,
} from '@/lib/push-inbox';

type SortValue = 'newest' | 'oldest' | 'symbol' | 'strategy';

const DETAIL_FIELDS: Array<{ key: string; labelKey: string }> = [
  { key: 'event', labelKey: 'fields.event' },
  { key: 'orderId', labelKey: 'fields.orderId' },
  { key: 'symbol', labelKey: 'fields.symbol' },
  { key: 'exchange', labelKey: 'fields.exchange' },
  { key: 'side', labelKey: 'fields.side' },
  { key: 'status', labelKey: 'fields.status' },
  { key: 'type', labelKey: 'fields.type' },
  { key: 'timeInForce', labelKey: 'fields.timeInForce' },
  { key: 'quantity', labelKey: 'fields.quantity' },
  { key: 'executedQuantity', labelKey: 'fields.executedQuantity' },
  { key: 'price', labelKey: 'fields.price' },
  { key: 'averagePrice', labelKey: 'fields.averagePrice' },
  { key: 'stopPrice', labelKey: 'fields.stopPrice' },
  { key: 'cummulativeQuoteQuantity', labelKey: 'fields.cummulativeQuoteQuantity' },
  { key: 'commission', labelKey: 'fields.commission' },
  { key: 'commissionAsset', labelKey: 'fields.commissionAsset' },
  { key: 'realizedPnl', labelKey: 'fields.realizedPnl' },
  { key: 'unrealizedPnl', labelKey: 'fields.unrealizedPnl' },
  { key: 'strategyId', labelKey: 'fields.strategyId' },
  { key: 'strategyName', labelKey: 'fields.strategyName' },
  { key: 'updateTime', labelKey: 'fields.updateTime' },
];

function usePushInbox() {
  const [messages, setMessages] = React.useState<PushInboxMessage[]>([]);

  React.useEffect(() => {
    setMessages(getPushInboxMessages());
    return subscribePushInbox(() => {
      setMessages(getPushInboxMessages());
    });
  }, []);

  return messages;
}

function matchesQuery(message: PushInboxMessage, query: string) {
  if (!query) return true;
  const haystack = [
    message.title ?? '',
    message.body ?? '',
    message.data.symbol ?? '',
    message.data.strategyName ?? '',
    message.data.orderId ?? '',
    message.data.exchange ?? '',
    message.data.side ?? '',
    message.data.status ?? '',
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function sortMessages(messages: PushInboxMessage[], sort: SortValue) {
  const list = [...messages];
  switch (sort) {
    case 'oldest':
      return list.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
    case 'symbol':
      return list.sort((a, b) =>
        (a.data.symbol ?? '').localeCompare(b.data.symbol ?? ''),
      );
    case 'strategy':
      return list.sort((a, b) =>
        (a.data.strategyName ?? '').localeCompare(b.data.strategyName ?? ''),
      );
    case 'newest':
    default:
      return list.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  }
}

export function PushInbox() {
  const t = useTranslations('push.inbox');
  const locale = useLocale();
  const messages = usePushInbox();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [searchInput, setSearchInput] = React.useState('');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [sort, setSort] = React.useState<SortValue>('newest');

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 500);
    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  React.useEffect(() => {
    const handlePayload = (payload: unknown) => {
      const normalized = normalizePushPayload(payload);
      if (normalized) {
        addPushInboxMessage(normalized);
      }
    };

    const handleCustomEvent = (event: Event) => {
      handlePayload((event as CustomEvent).detail);
    };

    const handleServiceWorker = (event: MessageEvent) => {
      const data = event.data?.payload ?? event.data;
      handlePayload(data);
    };

    window.addEventListener('itrade:push', handleCustomEvent);
    navigator.serviceWorker?.addEventListener('message', handleServiceWorker);
    return () => {
      window.removeEventListener('itrade:push', handleCustomEvent);
      navigator.serviceWorker?.removeEventListener('message', handleServiceWorker);
    };
  }, []);

  const filtered = React.useMemo(
    () => messages.filter((message) => matchesQuery(message, searchQuery)),
    [messages, searchQuery],
  );

  const sorted = React.useMemo(() => sortMessages(filtered, sort), [filtered, sort]);
  const selected =
    (selectedId ? sorted.find((msg) => msg.id === selectedId) : null) ??
    sorted[0] ??
    null;

  React.useEffect(() => {
    if (selected?.id && selected.read === false) {
      markPushInboxRead(selected.id, true);
    }
  }, [selected?.id, selected?.read]);

  const unreadCount = messages.filter((message) => !message.read).length;

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{t('listTitle')}</CardTitle>
            <Badge variant="outline">{t('unreadCount', { count: unreadCount })}</Badge>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="push-search">{t('searchLabel')}</Label>
            <div className="relative">
              <IconSearch className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="push-search"
                placeholder={t('searchPlaceholder')}
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>{t('sortLabel')}</Label>
            <Select value={sort} onValueChange={(value) => setSort(value as SortValue)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">{t('sort.newest')}</SelectItem>
                <SelectItem value="oldest">{t('sort.oldest')}</SelectItem>
                <SelectItem value="symbol">{t('sort.symbol')}</SelectItem>
                <SelectItem value="strategy">{t('sort.strategy')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('empty')}</p>
          ) : (
            <div className="grid gap-2">
              {sorted.map((message) => {
                const isSelected = message.id === selected?.id;
                const title =
                  message.title || t(`event.${message.data.event ?? 'unknown'}`);
                return (
                  <button
                    key={message.id}
                    type="button"
                    onClick={() => setSelectedId(message.id)}
                    className={cn(
                      'w-full rounded-lg border px-3 py-2 text-left transition',
                      isSelected
                        ? 'border-primary/60 bg-primary/5'
                        : 'border-border hover:bg-accent',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {message.body || t('noBody')}
                        </p>
                      </div>
                      {!message.read && (
                        <Badge variant="secondary" className="shrink-0">
                          {t('unread')}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {new Date(message.receivedAt).toLocaleString(locale)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => selected?.id && markPushInboxRead(selected.id, true)}
              disabled={!selected}
            >
              <IconCheck className="mr-2 h-4 w-4" />
              {t('markRead')}
            </Button>
            <Button
              variant="outline"
              onClick={clearPushInbox}
              disabled={!messages.length}
            >
              <IconTrash className="mr-2 h-4 w-4" />
              {t('clear')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('detailTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selected ? (
            <p className="text-sm text-muted-foreground">{t('detailEmpty')}</p>
          ) : (
            <>
              <div className="space-y-2">
                <p className="text-lg font-semibold">
                  {selected.title || t(`event.${selected.data.event ?? 'unknown'}`)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {selected.body || t('noBody')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('receivedAt', {
                    time: new Date(selected.receivedAt).toLocaleString(locale),
                  })}
                </p>
              </div>
              <div className="grid gap-2">
                {DETAIL_FIELDS.map((field) => {
                  const value = selected.data[field.key];
                  if (!value) return null;
                  return (
                    <div key={field.key} className="flex justify-between gap-4 text-sm">
                      <span className="text-muted-foreground">{t(field.labelKey)}</span>
                      <span className="text-right font-medium">{value}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
