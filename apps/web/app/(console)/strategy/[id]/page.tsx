'use client';

import { useEffect, useState, useCallback, use } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  IconArrowLeft,
  IconPlayerPlay,
  IconPlayerPause,
  IconSettings,
  IconTrash,
  IconEdit,
} from '@tabler/icons-react';
import type { StrategyEntity } from '@itrade/data-manager';

const StrategyStatus = {
  ACTIVE: 'active',
  STOPPED: 'stopped',
  PAUSED: 'paused',
  ERROR: 'error',
} as const;

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';
import { toast } from 'sonner';

import { ExchangeLogo } from '@/components/exchange-logo';
import { SymbolIcon } from '@/components/symbol-icon';
import { OrdersTable } from '@/components/orders-table';

import { StrategyPerformanceMetrics } from '@/components/strategy/strategy-performance-metrics';
import { StrategyConfigView } from '@/components/strategy/strategy-config-view';

type Params = Promise<{ id: string }>;

export default function StrategyDetailPage(props: { params: Params }) {
  const params = use(props.params);
  const id = parseInt(params.id);

  const t = useTranslations('strategy');
  const router = useRouter();

  const [strategy, setStrategy] = useState<StrategyEntity | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const fetchStrategy = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/strategies/${id}`);
      if (!res.ok) throw new Error('Failed to fetch strategy');
      const data = await res.json();
      setStrategy(data.strategy);
    } catch (error) {
      console.error(error);
      toast.error(t('errors.loadStrategies'));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    if (!isNaN(id)) {
      fetchStrategy();
    }
  }, [id, fetchStrategy]);

  const toggleStatus = async () => {
    if (!strategy) return;

    const newStatus =
      strategy.status === StrategyStatus.ACTIVE
        ? StrategyStatus.STOPPED
        : StrategyStatus.ACTIVE;

    try {
      setUpdatingStatus(true);
      const res = await fetch(`/api/strategies/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) throw new Error('Failed to update status');

      toast.success(
        t(newStatus === StrategyStatus.ACTIVE ? 'messages.started' : 'messages.stopped'),
      );
      fetchStrategy(); // Reload to get updated status/state
    } catch (err) {
      toast.error(t('errors.updateStatus'));
    } finally {
      setUpdatingStatus(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20';
      case 'stopped':
        return 'bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20';
      case 'paused':
        return 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20';
      case 'error':
        return 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20';
      default:
        return 'bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20';
    }
  };

  if (loading && !strategy) {
    return (
      <SidebarInset>
        <SiteHeader title={t('title')} />
        <div className="p-6 space-y-6">
          <Skeleton className="h-12 w-1/3" />
          <Skeleton className="h-64 w-full" />
        </div>
      </SidebarInset>
    );
  }

  if (!strategy) {
    return (
      <SidebarInset>
        <SiteHeader title={t('title')} />
        <div className="p-6 text-center">
          <h2 className="text-xl font-bold">{t('errors.notFound')}</h2>
          <Button variant="link" onClick={() => router.push('/strategy')}>
            <IconArrowLeft className="mr-2 h-4 w-4" />
            {t('backToList')}
          </Button>
        </div>
      </SidebarInset>
    );
  }

  return (
    <SidebarInset>
      <SiteHeader title={strategy.name} />
      <div className="flex flex-1 flex-col p-4 md:p-6 space-y-6">
        {/* Header Section */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push('/strategy')}
                className="h-8 w-8 -ml-2"
              >
                <IconArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-2xl font-bold tracking-tight">{strategy.name}</h1>
              <Badge variant="outline" className={getStatusColor(strategy.status)}>
                {strategy.status.toUpperCase()}
              </Badge>
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground ml-8">
              <div className="flex items-center gap-1.5">
                <ExchangeLogo exchange={strategy.exchange || ''} className="h-4 w-4" />
                <span className="capitalize">{strategy.exchange}</span>
              </div>
              <div className="h-4 w-[1px] bg-border" />
              <div className="flex items-center gap-1.5 font-mono">
                <SymbolIcon
                  symbol={strategy.symbol?.split('/')[0] || ''}
                  className="h-4 w-4"
                />
                {strategy.symbol}
              </div>
              <div className="h-4 w-[1px] bg-border" />
              <div className="font-mono text-xs opacity-80">{strategy.type}</div>
            </div>

            {strategy.errorMessage && (
              <div className="ml-8 mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded-md text-sm text-red-600 dark:text-red-400">
                Error: {strategy.errorMessage}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 ml-8 md:ml-0">
            <Button
              size="sm"
              variant={strategy.status === 'active' ? 'destructive' : 'default'}
              onClick={toggleStatus}
              disabled={updatingStatus}
            >
              {strategy.status === 'active' ? (
                <>
                  <IconPlayerPause className="mr-2 h-4 w-4" />
                  {t('actions.stop')}
                </>
              ) : (
                <>
                  <IconPlayerPlay className="mr-2 h-4 w-4" />
                  {t('actions.start')}
                </>
              )}
            </Button>

            {/* Edit button placeholder - implementing full edit requires modal reuse which is complex, 
                 users can edit from list view for now */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push(`/strategy?edit=${strategy.id}`)}
            >
              <IconEdit className="mr-2 h-4 w-4" />
              {t('actions.edit')}
            </Button>
          </div>
        </div>

        {/* Performance Metrics */}
        <StrategyPerformanceMetrics performance={strategy.performance} />

        {/* Tabs for Details */}
        <Tabs defaultValue="orders" className="space-y-4">
          <TabsList>
            <TabsTrigger value="orders">{t('tabs.orders')}</TabsTrigger>
            <TabsTrigger value="config">{t('tabs.configuration')}</TabsTrigger>
          </TabsList>

          <TabsContent value="orders" className="space-y-4">
            <OrdersTable selectedStrategy={id} />
          </TabsContent>

          <TabsContent value="config" className="space-y-4">
            <StrategyConfigView
              parameters={strategy.parameters}
              subscription={strategy.subscription}
              initialDataConfig={strategy.initialDataConfig}
            />
          </TabsContent>
        </Tabs>
      </div>
    </SidebarInset>
  );
}
