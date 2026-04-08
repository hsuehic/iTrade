'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  IconPlus,
  IconTrash,
  IconRefresh,
  IconChartLine,
  IconCalendar,
  IconTrendingUp,
  IconActivity,
  IconEye,
  IconChartHistogram,
  IconReportAnalytics,
  IconArrowUp,
  IconArrowDown,
  IconTarget,
  IconAlertTriangle,
  IconCheck,
  IconPlayerPlay,
  IconChevronDown,
  IconChevronUp,
  IconExternalLink,
} from '@tabler/icons-react';
import type { StrategyEntity } from '@itrade/data-manager';

import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';

interface BacktestConfig {
  id: number;
  name?: string;
  startDate: string;
  endDate: string;
  initialBalance: string;
  commission: string;
  slippage?: string;
  resultsCount?: number;
  bestResult?: BacktestResult;
  latestResult?: BacktestResult;
  results?: BacktestResult[];
}

interface BacktestResult {
  id: number;
  name?: string;
  totalReturn: string;
  annualizedReturn: string;
  sharpeRatio: string;
  maxDrawdown: string;
  winRate: string;
  profitFactor: string;
  totalTrades: number;
  avgTradeDuration: number;
  strategy?: StrategyEntity;
  createdAt: string;
}

interface BacktestTrade {
  id: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  entryPrice: string;
  exitPrice: string;
  quantity: string;
  entryTime: string;
  exitTime: string;
  pnl: string;
  commission: string;
  duration: number;
  entryCashBalance?: string | null;
  entryPositionSize?: string | null;
  cashBalance?: string | null;
  positionSize?: string | null;
}

interface EquityPoint {
  timestamp: string;
  value: string;
}

export default function BacktestPage() {
  const t = useTranslations('backtest');
  const locale = useLocale();
  const router = useRouter();
  const [configs, setConfigs] = useState<BacktestConfig[]>([]);
  const [strategies, setStrategies] = useState<StrategyEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isRunDialogOpen, setIsRunDialogOpen] = useState(false);
  const [runConfigId, setRunConfigId] = useState<number | null>(null);
  const [runStrategyId, setRunStrategyId] = useState<string>('');
  const [runName, setRunName] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<BacktestConfig | null>(null);
  const [selectedResult, setSelectedResult] = useState<BacktestResult | null>(null);
  const [resultTrades, setResultTrades] = useState<BacktestTrade[]>([]);
  const [equityPoints, setEquityPoints] = useState<EquityPoint[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<number | null>(null);
  const [isDeletingResultId, setIsDeletingResultId] = useState<number | null>(null);
  // Inline expanded results per config card
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [cardResults, setCardResults] = useState<Record<number, BacktestResult[]>>({});
  const [loadingCards, setLoadingCards] = useState<Set<number>>(new Set());

  const [formData, setFormData] = useState({
    name: '',
    startDate: '',
    endDate: '',
    initialBalance: '10000',
    commission: '0.001',
    commissionInput: '0.1',
    slippage: '0.0005',
    slippageInput: '0.05',
  });

  const fetchConfigs = useCallback(async () => {
    try {
      const response = await fetch('/api/backtest', { cache: 'no-store' });
      if (!response.ok) throw new Error(t('errors.fetchConfigs'));
      const data = await response.json();
      const loadedConfigs: BacktestConfig[] = data.configs;
      setConfigs(loadedConfigs);

      // Auto-expand all config cards and load their results in parallel
      if (loadedConfigs.length > 0) {
        setExpandedCards(new Set(loadedConfigs.map((c) => c.id)));
        const resultsEntries = await Promise.all(
          loadedConfigs.map(async (c) => {
            try {
              const res = await fetch(`/api/backtest/${c.id}?results=true`, {
                cache: 'no-store',
              });
              if (!res.ok) return [c.id, []] as [number, BacktestResult[]];
              const d = await res.json();
              return [c.id, d.config?.results || []] as [number, BacktestResult[]];
            } catch {
              return [c.id, []] as [number, BacktestResult[]];
            }
          }),
        );
        setCardResults(Object.fromEntries(resultsEntries));
      }
    } catch {
      toast.error(t('errors.loadConfigs'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchStrategies = useCallback(async () => {
    try {
      const response = await fetch('/api/strategies', { cache: 'no-store' });
      if (!response.ok) throw new Error(t('errors.fetchStrategies'));
      const data = await response.json();
      setStrategies(data.strategies);
    } catch {
      console.error(t('errors.fetchStrategies'));
    }
  }, [t]);

  useEffect(() => {
    fetchConfigs();
    fetchStrategies();
    // Set default dates
    const today = new Date();
    const oneMonthAgo = new Date(today);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    setFormData((prev) => ({
      ...prev,
      startDate: oneMonthAgo.toISOString().split('T')[0],
      endDate: today.toISOString().split('T')[0],
    }));
  }, [fetchConfigs, fetchStrategies]);

  const createConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreating) return;

    const commissionPercent = parseFloat(formData.commissionInput);
    if (Number.isNaN(commissionPercent)) {
      toast.error(t('errors.invalidCommission'));
      return;
    }
    const commissionRate = (commissionPercent / 100).toString();

    const slippageInput = formData.slippageInput.trim();
    let slippageRate: string | undefined;
    if (slippageInput.length > 0) {
      const slippagePercent = parseFloat(slippageInput);
      if (Number.isNaN(slippagePercent)) {
        toast.error(t('errors.invalidSlippage'));
        return;
      }
      slippageRate = (slippagePercent / 100).toString();
    }

    setIsCreating(true);
    try {
      const response = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim() || undefined,
          startDate: formData.startDate,
          endDate: formData.endDate,
          initialBalance: formData.initialBalance,
          commission: commissionRate,
          slippage: slippageRate,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t('errors.createConfig'));
      }

      toast.success(t('messages.created'));
      setIsCreateDialogOpen(false);
      resetForm();
      fetchConfigs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errors.generic'));
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    const today = new Date();
    const oneMonthAgo = new Date(today);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    setFormData({
      name: '',
      startDate: oneMonthAgo.toISOString().split('T')[0],
      endDate: today.toISOString().split('T')[0],
      initialBalance: '10000',
      commission: '0.001',
      commissionInput: '0.1',
      slippage: '0.0005',
      slippageInput: '0.05',
    });
  };

  const deleteConfig = async (id: number) => {
    if (isDeletingId === id) return;

    setIsDeletingId(id);
    try {
      const response = await fetch(`/api/backtest/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t('errors.deleteConfig'));
      }

      toast.success(t('messages.deleted'));
      fetchConfigs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errors.deleteConfig'));
    } finally {
      setIsDeletingId(null);
    }
  };

  const deleteResult = async (resultId: number, configId?: number) => {
    if (isDeletingResultId === resultId) return;

    setIsDeletingResultId(resultId);
    try {
      const response = await fetch(`/api/backtest/results/${resultId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t('errors.deleteResult'));
      }

      toast.success(t('messages.deleted'));

      if (configId) {
        // Refresh this config's results in the card list
        fetchConfigResults(configId);
      }

      // If we are in the view dialog, refresh it too
      if (selectedConfig) {
        viewConfigDetails(selectedConfig);
      }

      fetchConfigs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errors.deleteResult'));
    } finally {
      setIsDeletingResultId(null);
    }
  };

  const fetchConfigResults = async (id: number) => {
    try {
      const res = await fetch(`/api/backtest/${id}?results=true`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        setCardResults((prev) => ({ ...prev, [id]: data.config?.results || [] }));
      }
    } catch {
      // ignore
    }
  };

  const openRunDialog = (config: BacktestConfig) => {
    setRunConfigId(config.id);
    setRunStrategyId('');
    setRunName('');
    setIsRunDialogOpen(true);
  };

  const runBacktest = async () => {
    if (!runConfigId || !runStrategyId || isRunning) return;
    setIsRunning(true);
    try {
      const response = await fetch(`/api/backtest/${runConfigId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategyId: parseInt(runStrategyId, 10),
          name: runName.trim() || undefined,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t('errors.runFailed'));
      }
      toast.success(t('messages.runCompleted'));
      setIsRunDialogOpen(false);
      // Clear stale cached results for this config so fetchConfigs reloads fresh
      if (runConfigId) {
        setCardResults((prev) => {
          const next = { ...prev };
          delete next[runConfigId];
          return next;
        });
      }
      fetchConfigs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errors.generic'));
    } finally {
      setIsRunning(false);
    }
  };

  const viewConfigDetails = async (config: BacktestConfig) => {
    setSelectedConfig(config);
    const bestOrLatest = config.bestResult || config.latestResult || null;
    setSelectedResult(bestOrLatest);
    setIsViewDialogOpen(true);

    // Auto-load trades and equity for the selected result so the chart shows immediately
    if (bestOrLatest) {
      viewResultDetails(bestOrLatest);
    }

    // Fetch detailed results list
    try {
      const response = await fetch(`/api/backtest/${config.id}?results=true`);
      if (response.ok) {
        const data = await response.json();
        setSelectedConfig(data.config);
      }
    } catch {
      console.error(t('errors.fetchDetails'));
    }
  };

  const viewResultDetails = async (result: BacktestResult) => {
    setSelectedResult(result);
    setResultTrades([]);
    setEquityPoints([]);

    try {
      const response = await fetch(
        `/api/backtest/results/${result.id}?trades=true&equity=true`,
      );
      if (response.ok) {
        const data = await response.json();
        setResultTrades(data.result.trades || []);
        setEquityPoints(data.result.equity || []);
      } else {
        const err = await response.json().catch(() => ({}));
        toast.error(err.error || t('errors.fetchResultDetails'));
      }
    } catch {
      toast.error(t('errors.fetchResultDetails'));
    }
  };

  const toggleCardResults = async (config: BacktestConfig) => {
    const id = config.id;
    const next = new Set(expandedCards);
    if (next.has(id)) {
      next.delete(id);
      setExpandedCards(next);
      return;
    }
    next.add(id);
    setExpandedCards(next);
    // Already loaded? Skip fetch.
    if (cardResults[id]) return;
    // Load results for this config
    setLoadingCards((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/backtest/${id}?results=true`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setCardResults((prev) => ({ ...prev, [id]: data.config?.results || [] }));
      }
    } catch {
      // silently ignore — results list will just be empty
    } finally {
      setLoadingCards((prev) => {
        const s = new Set(prev);
        s.delete(id);
        return s;
      });
    }
  };

  const formatNumber = (value: string | number | undefined, decimals = 2) => {
    if (value === undefined || value === null) return '-';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '-';
    return num.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatPercent = (value: string | number | undefined) => {
    if (value === undefined || value === null) return '-';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '-';
    return `${(num * 100).toFixed(2)}%`;
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  };

  const getMetricColor = (
    value: number,
    type: 'return' | 'sharpe' | 'drawdown' | 'winrate',
  ) => {
    switch (type) {
      case 'return':
        return value >= 0 ? 'text-green-600' : 'text-red-600';
      case 'sharpe':
        if (value >= 2) return 'text-green-600';
        if (value >= 1) return 'text-blue-600';
        if (value >= 0) return 'text-yellow-600';
        return 'text-red-600';
      case 'drawdown':
        if (value <= 0.05) return 'text-green-600';
        if (value <= 0.15) return 'text-yellow-600';
        return 'text-red-600';
      case 'winrate':
        if (value >= 0.6) return 'text-green-600';
        if (value >= 0.5) return 'text-blue-600';
        if (value >= 0.4) return 'text-yellow-600';
        return 'text-red-600';
      default:
        return '';
    }
  };

  const getMetricBadge = (value: number, type: string) => {
    let label = '';
    let variant: 'default' | 'secondary' | 'destructive' | 'outline' = 'outline';

    switch (type) {
      case 'sharpe':
        if (value >= 2) {
          label = t('badges.excellent');
          variant = 'default';
        } else if (value >= 1) {
          label = t('badges.good');
          variant = 'secondary';
        } else if (value >= 0) {
          label = t('badges.fair');
          variant = 'outline';
        } else {
          label = t('badges.poor');
          variant = 'destructive';
        }
        break;
      case 'drawdown':
        if (value <= 0.05) {
          label = t('badges.lowRisk');
          variant = 'default';
        } else if (value <= 0.15) {
          label = t('badges.moderate');
          variant = 'secondary';
        } else {
          label = t('badges.highRisk');
          variant = 'destructive';
        }
        break;
    }

    return label ? (
      <Badge variant={variant} className="ml-2 text-xs">
        {label}
      </Badge>
    ) : null;
  };

  // Calculate summary stats
  const totalConfigs = configs.length;
  const totalResults = configs.reduce((sum, c) => sum + (c.resultsCount || 0), 0);
  const profitableConfigs = configs.filter(
    (c) => c.bestResult && parseFloat(c.bestResult.totalReturn) > 0,
  ).length;

  return (
    <SidebarInset>
      <SiteHeader title={t('title')} />
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            {/* Header */}
            <div className="flex justify-between items-start px-4 lg:px-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">{t('heading')}</h2>
                <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => fetchConfigs()}>
                  <IconRefresh className="h-4 w-4 mr-2" />
                  {t('actions.refresh')}
                </Button>
                <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="lg">
                      <IconPlus className="mr-2 h-4 w-4" />
                      {t('actions.new')}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>{t('dialog.title')}</DialogTitle>
                      <DialogDescription>{t('dialog.description')}</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={createConfig} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="configName">{t('fields.name')}</Label>
                        <Input
                          id="configName"
                          type="text"
                          placeholder={t('fields.namePlaceholder')}
                          value={formData.name}
                          onChange={(e) =>
                            setFormData({ ...formData, name: e.target.value })
                          }
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="startDate">{t('fields.startDate')}</Label>
                          <Input
                            id="startDate"
                            type="date"
                            value={formData.startDate}
                            onChange={(e) =>
                              setFormData({ ...formData, startDate: e.target.value })
                            }
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="endDate">{t('fields.endDate')}</Label>
                          <Input
                            id="endDate"
                            type="date"
                            value={formData.endDate}
                            onChange={(e) =>
                              setFormData({ ...formData, endDate: e.target.value })
                            }
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="initialBalance">
                          {t('fields.initialBalance')}
                        </Label>
                        <Input
                          id="initialBalance"
                          type="number"
                          step="100"
                          min="100"
                          value={formData.initialBalance}
                          onChange={(e) =>
                            setFormData({ ...formData, initialBalance: e.target.value })
                          }
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="commission">{t('fields.commission')}</Label>
                          <Input
                            id="commission"
                            type="text"
                            inputMode="decimal"
                            step="0.0001"
                            min="0"
                            value={formData.commissionInput}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                commissionInput: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="slippage">{t('fields.slippage')}</Label>
                          <Input
                            id="slippage"
                            type="text"
                            inputMode="decimal"
                            step="0.001"
                            min="0"
                            value={formData.slippageInput}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                slippageInput: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>

                      <Separator />
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setIsCreateDialogOpen(false);
                            resetForm();
                          }}
                        >
                          {t('actions.cancel')}
                        </Button>
                        <Button type="submit" disabled={isCreating}>
                          {isCreating ? (
                            <>
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                              {t('actions.creating')}
                            </>
                          ) : (
                            <>
                              <IconCheck className="h-4 w-4 mr-2" />
                              {t('actions.createConfig')}
                            </>
                          )}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 px-4 lg:px-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>{t('stats.configurations')}</CardDescription>
                  <CardTitle className="text-3xl">{totalConfigs}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <IconChartHistogram className="h-3 w-3" />
                    {t('stats.configurationsHelp')}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>{t('stats.totalRuns')}</CardDescription>
                  <CardTitle className="text-3xl">{totalResults}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <IconReportAnalytics className="h-3 w-3" />
                    {t('stats.totalRunsHelp')}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>{t('stats.profitable')}</CardDescription>
                  <CardTitle className="text-3xl text-green-600">
                    {profitableConfigs}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <IconTrendingUp className="h-3 w-3" />
                    {t('stats.profitableHelp')}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>{t('stats.successRate')}</CardDescription>
                  <CardTitle className="text-3xl">
                    {totalConfigs > 0
                      ? `${Math.round((profitableConfigs / totalConfigs) * 100)}%`
                      : '-'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <IconTarget className="h-3 w-3" />
                    {t('stats.successRateHelp')}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Configurations List */}
            <div className="px-4 lg:px-6">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="text-center space-y-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
                    <p className="text-sm text-muted-foreground">{t('states.loading')}</p>
                  </div>
                </div>
              ) : configs.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <div className="rounded-full bg-muted p-4 mb-4">
                      <IconChartHistogram className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t('empty.title')}</h3>
                    <p className="text-sm text-muted-foreground mb-4 text-center max-w-sm">
                      {t('empty.description')}
                    </p>
                    <Button onClick={() => setIsCreateDialogOpen(true)}>
                      <IconPlus className="mr-2 h-4 w-4" />
                      {t('empty.action')}
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {configs.map((config) => (
                    <Card key={config.id} className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-lg flex items-center gap-2">
                              <IconCalendar className="h-4 w-4 text-muted-foreground" />
                              {config.name ? (
                                <span>{config.name}</span>
                              ) : (
                                <>
                                  {new Date(config.startDate).toLocaleDateString(locale)}
                                  {' - '}
                                  {new Date(config.endDate).toLocaleDateString(locale)}
                                </>
                              )}
                            </CardTitle>
                            <CardDescription className="mt-1">
                              {config.name && (
                                <>
                                  {new Date(config.startDate).toLocaleDateString(locale)}
                                  {' – '}
                                  {new Date(config.endDate).toLocaleDateString(locale)}
                                  {' • '}
                                </>
                              )}
                              {t('config.initial', {
                                amount: formatNumber(config.initialBalance),
                              })}{' '}
                              •{' '}
                              {t('config.runs', {
                                count: config.resultsCount || 0,
                              })}
                            </CardDescription>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => openRunDialog(config)}
                            >
                              <IconPlayerPlay className="h-4 w-4 mr-1" />
                              {t('actions.run')}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => toggleCardResults(config)}
                            >
                              {expandedCards.has(config.id) ? (
                                <IconChevronUp className="h-4 w-4 mr-1" />
                              ) : (
                                <IconChevronDown className="h-4 w-4 mr-1" />
                              )}
                              {t('runs.title')}
                              {config.resultsCount ? (
                                <span className="ml-1 text-xs opacity-70">
                                  ({config.resultsCount})
                                </span>
                              ) : null}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => viewConfigDetails(config)}
                            >
                              <IconEye className="h-4 w-4 mr-1" />
                              {t('actions.view')}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deleteConfig(config.id)}
                              disabled={isDeletingId === config.id}
                              className="hover:bg-destructive hover:text-destructive-foreground"
                            >
                              {isDeletingId === config.id ? (
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                              ) : (
                                <IconTrash className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      {config.bestResult && (
                        <CardContent className="pb-0">
                          <div className="bg-muted/50 rounded-lg p-4">
                            <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                              <IconTrendingUp className="h-3 w-3" />
                              {t('results.best')}{' '}
                              {config.bestResult.strategy &&
                                t('results.bestStrategy', {
                                  name: config.bestResult.strategy.name,
                                })}
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                              <div>
                                <div className="text-xs text-muted-foreground">
                                  {t('metrics.totalReturn')}
                                </div>
                                <div
                                  className={`font-bold text-lg ${getMetricColor(
                                    parseFloat(config.bestResult.totalReturn),
                                    'return',
                                  )}`}
                                >
                                  {parseFloat(config.bestResult.totalReturn) >= 0
                                    ? '+'
                                    : ''}
                                  {formatPercent(config.bestResult.totalReturn)}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground">
                                  {t('metrics.sharpeRatio')}
                                </div>
                                <div
                                  className={`font-bold text-lg ${getMetricColor(
                                    parseFloat(config.bestResult.sharpeRatio),
                                    'sharpe',
                                  )}`}
                                >
                                  {formatNumber(config.bestResult.sharpeRatio)}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground">
                                  {t('metrics.maxDrawdown')}
                                </div>
                                <div
                                  className={`font-bold text-lg ${getMetricColor(
                                    parseFloat(config.bestResult.maxDrawdown),
                                    'drawdown',
                                  )}`}
                                >
                                  {formatPercent(config.bestResult.maxDrawdown)}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground">
                                  {t('metrics.winRate')}
                                </div>
                                <div
                                  className={`font-bold text-lg ${getMetricColor(
                                    parseFloat(config.bestResult.winRate),
                                    'winrate',
                                  )}`}
                                >
                                  {formatPercent(config.bestResult.winRate)}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground">
                                  {t('metrics.totalTrades')}
                                </div>
                                <div className="font-bold text-lg">
                                  {config.bestResult.totalTrades}
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      )}

                      {/* Expandable results list */}
                      {expandedCards.has(config.id) && (
                        <CardContent className="pt-3">
                          {loadingCards.has(config.id) ? (
                            <div className="flex items-center justify-center py-6">
                              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                            </div>
                          ) : (cardResults[config.id] || []).length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              {t('runs.empty')}
                            </p>
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>{t('runs.table.name')}</TableHead>
                                  <TableHead>{t('runs.table.strategy')}</TableHead>
                                  <TableHead className="text-right">
                                    {t('metrics.totalReturn')}
                                  </TableHead>
                                  <TableHead className="text-right">
                                    {t('metrics.sharpeRatio')}
                                  </TableHead>
                                  <TableHead className="text-right">
                                    {t('metrics.maxDrawdown')}
                                  </TableHead>
                                  <TableHead className="text-right">
                                    {t('metrics.winRate')}
                                  </TableHead>
                                  <TableHead className="text-right">
                                    {t('metrics.totalTrades')}
                                  </TableHead>
                                  <TableHead />
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {(cardResults[config.id] || []).map((r) => (
                                  <TableRow
                                    key={r.id}
                                    className="cursor-pointer hover:bg-muted/60"
                                    onClick={() =>
                                      router.push(`/backtest/results/${r.id}`)
                                    }
                                  >
                                    <TableCell className="font-medium text-sm">
                                      {r.name || (
                                        <span className="text-muted-foreground text-xs">
                                          {new Date(r.createdAt).toLocaleDateString(
                                            locale,
                                          )}
                                        </span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                      {r.strategy?.name ?? '-'}
                                    </TableCell>
                                    <TableCell
                                      className={`text-right font-medium ${getMetricColor(parseFloat(r.totalReturn), 'return')}`}
                                    >
                                      {parseFloat(r.totalReturn) >= 0 ? '+' : ''}
                                      {formatPercent(r.totalReturn)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {formatNumber(r.sharpeRatio)}
                                    </TableCell>
                                    <TableCell
                                      className={`text-right ${getMetricColor(parseFloat(r.maxDrawdown), 'drawdown')}`}
                                    >
                                      {formatPercent(r.maxDrawdown)}
                                    </TableCell>
                                    <TableCell
                                      className={`text-right ${getMetricColor(parseFloat(r.winRate), 'winrate')}`}
                                    >
                                      {formatPercent(r.winRate)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {r.totalTrades}
                                    </TableCell>
                                    <TableCell
                                      className="text-right"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <div className="flex items-center justify-end gap-1">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            router.push(`/backtest/results/${r.id}`)
                                          }
                                          title={t('result.openDetail')}
                                        >
                                          <IconExternalLink className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => deleteResult(r.id, config.id)}
                                          disabled={isDeletingResultId === r.id}
                                          className="text-muted-foreground hover:text-destructive"
                                          title={t('actions.delete')}
                                        >
                                          {isDeletingResultId === r.id ? (
                                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                          ) : (
                                            <IconTrash className="h-4 w-4" />
                                          )}
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                        </CardContent>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Run Backtest Dialog */}
      <Dialog open={isRunDialogOpen} onOpenChange={setIsRunDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconPlayerPlay className="h-5 w-5" />
              {t('run.title')}
            </DialogTitle>
            <DialogDescription>{t('run.description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t('run.strategy')}</Label>
              {strategies.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('run.noStrategies')}</p>
              ) : (
                <Select value={runStrategyId} onValueChange={setRunStrategyId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('run.strategyPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {strategies.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        <span className="font-medium">{s.name}</span>
                        <span className="text-muted-foreground ml-2 text-xs">
                          ({s.type})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="run-name">{t('run.name')}</Label>
              <Input
                id="run-name"
                placeholder={t('run.namePlaceholder')}
                value={runName}
                onChange={(e) => setRunName(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setIsRunDialogOpen(false)}
              disabled={isRunning}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              onClick={runBacktest}
              disabled={!runStrategyId || isRunning || strategies.length === 0}
            >
              {isRunning ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
              ) : (
                <IconPlayerPlay className="h-4 w-4 mr-2" />
              )}
              {isRunning ? t('run.running') : t('actions.run')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Config Details Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconChartHistogram className="h-5 w-5" />
              {t('details.title')}
            </DialogTitle>
            <DialogDescription>
              {selectedConfig && (
                <>
                  {new Date(selectedConfig.startDate).toLocaleDateString(locale)} -{' '}
                  {new Date(selectedConfig.endDate).toLocaleDateString(locale)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedConfig && (
            <Tabs defaultValue="results" className="mt-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="results">{t('tabs.results')}</TabsTrigger>
                <TabsTrigger value="config">{t('tabs.configuration')}</TabsTrigger>
                <TabsTrigger value="analysis">{t('tabs.analysis')}</TabsTrigger>
              </TabsList>

              <TabsContent value="results" className="space-y-4">
                {/* Results Summary Cards */}
                {selectedResult && (
                  <div className="space-y-3">
                    {/* Run label row */}
                    <div className="flex items-center gap-3 text-sm">
                      {selectedResult.name && (
                        <span className="font-semibold">{selectedResult.name}</span>
                      )}
                      {selectedResult.strategy?.name && (
                        <span className="text-muted-foreground">
                          {t('runs.strategy')}:{' '}
                          <span className="font-medium text-foreground">
                            {selectedResult.strategy.name}
                          </span>
                        </span>
                      )}
                      <span className="text-muted-foreground ml-auto text-xs">
                        {new Date(selectedResult.createdAt).toLocaleString(locale)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardDescription>{t('metrics.totalReturn')}</CardDescription>
                          <CardTitle
                            className={`text-2xl flex items-center ${getMetricColor(
                              parseFloat(selectedResult.totalReturn),
                              'return',
                            )}`}
                          >
                            {parseFloat(selectedResult.totalReturn) >= 0 ? (
                              <IconArrowUp className="h-5 w-5 mr-1" />
                            ) : (
                              <IconArrowDown className="h-5 w-5 mr-1" />
                            )}
                            {formatPercent(selectedResult.totalReturn)}
                          </CardTitle>
                        </CardHeader>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardDescription>{t('metrics.sharpeRatio')}</CardDescription>
                          <CardTitle className="text-2xl flex items-center">
                            {formatNumber(selectedResult.sharpeRatio)}
                            {getMetricBadge(
                              parseFloat(selectedResult.sharpeRatio),
                              'sharpe',
                            )}
                          </CardTitle>
                        </CardHeader>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardDescription>{t('metrics.maxDrawdown')}</CardDescription>
                          <CardTitle className="text-2xl flex items-center">
                            <IconAlertTriangle
                              className={`h-5 w-5 mr-1 ${getMetricColor(
                                parseFloat(selectedResult.maxDrawdown),
                                'drawdown',
                              )}`}
                            />
                            {formatPercent(selectedResult.maxDrawdown)}
                            {getMetricBadge(
                              parseFloat(selectedResult.maxDrawdown),
                              'drawdown',
                            )}
                          </CardTitle>
                        </CardHeader>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardDescription>{t('metrics.winRate')}</CardDescription>
                          <CardTitle
                            className={`text-2xl ${getMetricColor(
                              parseFloat(selectedResult.winRate),
                              'winrate',
                            )}`}
                          >
                            {formatPercent(selectedResult.winRate)}
                          </CardTitle>
                        </CardHeader>
                      </Card>
                    </div>
                  </div>
                )}

                {/* Equity Curve Chart */}
                {equityPoints.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <IconChartLine className="h-4 w-4" />
                        {t('chart.equityCurve')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={220}>
                        <AreaChart
                          data={equityPoints.map((pt) => ({
                            time: new Date(pt.timestamp).getTime(),
                            value: parseFloat(pt.value),
                          }))}
                          margin={{ top: 4, right: 8, left: 8, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient
                              id="equityGradientDlg"
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop offset="0%" stopColor="#22c55e" stopOpacity={0.15} />
                              <stop
                                offset="100%"
                                stopColor="#22c55e"
                                stopOpacity={0.02}
                              />
                            </linearGradient>
                          </defs>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="hsl(var(--border))"
                            strokeOpacity={0.4}
                          />
                          <XAxis
                            dataKey="time"
                            type="number"
                            scale="time"
                            domain={['dataMin', 'dataMax']}
                            tickFormatter={(v) =>
                              new Date(v).toLocaleDateString(locale, {
                                month: 'short',
                                day: 'numeric',
                              })
                            }
                            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            tickFormatter={(v) =>
                              `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}`
                            }
                            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                            tickLine={false}
                            axisLine={false}
                            width={60}
                          />
                          <Tooltip
                            contentStyle={{
                              background: 'hsl(var(--card))',
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px',
                              fontSize: 12,
                            }}
                            formatter={(v: number) => [
                              `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                              t('chart.equity'),
                            ]}
                            labelFormatter={(label) =>
                              new Date(label).toLocaleString(locale)
                            }
                          />
                          <Area
                            type="monotone"
                            dataKey="value"
                            stroke="#22c55e"
                            strokeWidth={1.5}
                            fill="url(#equityGradientDlg)"
                            dot={false}
                            activeDot={{ r: 3, fill: '#22c55e', strokeWidth: 0 }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* Trades Table */}
                {resultTrades.length > 0 ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">{t('trades.title')}</CardTitle>
                      <CardDescription>
                        {t('trades.count', { count: resultTrades.length })}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('trades.table.symbol')}</TableHead>
                            <TableHead>{t('trades.table.side')}</TableHead>
                            <TableHead className="text-right">
                              {t('trades.table.entry')}
                            </TableHead>
                            <TableHead className="text-right">
                              {t('trades.table.exit')}
                            </TableHead>
                            <TableHead className="text-right">
                              {t('trades.table.quantity')}
                            </TableHead>
                            <TableHead className="text-right">
                              {t('trades.table.pnl')}
                            </TableHead>
                            <TableHead className="text-right">
                              {t('trades.table.duration')}
                            </TableHead>
                            <TableHead className="text-right">
                              {t('trades.table.cashBalance')}
                            </TableHead>
                            <TableHead className="text-right">
                              {t('trades.table.positionSize')}
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {resultTrades.slice(0, 20).map((trade) => (
                            <TableRow key={trade.id}>
                              <TableCell className="font-medium">
                                {trade.symbol}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={trade.side === 'BUY' ? 'default' : 'secondary'}
                                  className={
                                    trade.side === 'BUY'
                                      ? 'bg-green-500/10 text-green-600'
                                      : 'bg-red-500/10 text-red-600'
                                  }
                                >
                                  {trade.side === 'BUY'
                                    ? t('trades.side.buy')
                                    : t('trades.side.sell')}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                ${formatNumber(trade.entryPrice)}
                              </TableCell>
                              <TableCell className="text-right">
                                ${formatNumber(trade.exitPrice)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatNumber(trade.quantity, 4)}
                              </TableCell>
                              <TableCell
                                className={`text-right ${
                                  parseFloat(trade.pnl) >= 0
                                    ? 'text-green-600'
                                    : 'text-red-600'
                                }`}
                              >
                                {parseFloat(trade.pnl) >= 0 ? '+' : ''}$
                                {formatNumber(trade.pnl)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatDuration(trade.duration)}
                              </TableCell>
                              <TableCell className="text-right">
                                {trade.cashBalance != null
                                  ? `$${formatNumber(trade.cashBalance)}`
                                  : '—'}
                              </TableCell>
                              <TableCell className="text-right">
                                {trade.positionSize != null
                                  ? formatNumber(trade.positionSize, 4)
                                  : '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {resultTrades.length > 20 && (
                        <div className="text-center py-2 text-sm text-muted-foreground">
                          {t('trades.showing', { count: resultTrades.length })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <IconChartLine className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">{t('trades.empty')}</p>
                    </CardContent>
                  </Card>
                )}

                {/* All past runs for this config */}
                {selectedConfig.results && selectedConfig.results.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">{t('runs.title')}</CardTitle>
                      <CardDescription>
                        {t('runs.count', { count: selectedConfig.results.length })}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('runs.table.name')}</TableHead>
                            <TableHead>{t('runs.table.strategy')}</TableHead>
                            <TableHead className="text-right">
                              {t('metrics.totalReturn')}
                            </TableHead>
                            <TableHead className="text-right">
                              {t('metrics.sharpeRatio')}
                            </TableHead>
                            <TableHead className="text-right">
                              {t('metrics.winRate')}
                            </TableHead>
                            <TableHead className="text-right">
                              {t('metrics.totalTrades')}
                            </TableHead>
                            <TableHead />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedConfig.results.map((r) => (
                            <TableRow
                              key={r.id}
                              className={selectedResult?.id === r.id ? 'bg-muted/50' : ''}
                            >
                              <TableCell className="font-medium text-sm">
                                {r.name || (
                                  <span className="text-muted-foreground text-xs">
                                    {new Date(r.createdAt).toLocaleDateString(locale)}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {r.strategy?.name ?? '-'}
                              </TableCell>
                              <TableCell
                                className={`text-right font-medium ${getMetricColor(parseFloat(r.totalReturn), 'return')}`}
                              >
                                {parseFloat(r.totalReturn) >= 0 ? '+' : ''}
                                {formatPercent(r.totalReturn)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatNumber(r.sharpeRatio)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatPercent(r.winRate)}
                              </TableCell>
                              <TableCell className="text-right">
                                {r.totalTrades}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => viewResultDetails(r)}
                                  >
                                    <IconEye className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setIsViewDialogOpen(false);
                                      router.push(`/backtest/results/${r.id}`);
                                    }}
                                    title={t('result.openDetail')}
                                  >
                                    <IconExternalLink className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => deleteResult(r.id, selectedConfig.id)}
                                    disabled={isDeletingResultId === r.id}
                                    className="text-muted-foreground hover:text-destructive"
                                    title={t('actions.delete')}
                                  >
                                    {isDeletingResultId === r.id ? (
                                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                    ) : (
                                      <IconTrash className="h-4 w-4" />
                                    )}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="config" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {t('configDetails.title')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <div className="text-sm text-muted-foreground">
                        {t('configDetails.dateRange')}
                      </div>
                      <div className="font-medium">
                        {new Date(selectedConfig.startDate).toLocaleDateString(locale)} -{' '}
                        {new Date(selectedConfig.endDate).toLocaleDateString(locale)}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">
                        {t('configDetails.initialBalance')}
                      </div>
                      <div className="font-medium">
                        ${formatNumber(selectedConfig.initialBalance)}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">
                        {t('configDetails.commission')}
                      </div>
                      <div className="font-medium">
                        {(parseFloat(selectedConfig.commission) * 100).toFixed(2)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">
                        {t('configDetails.slippage')}
                      </div>
                      <div className="font-medium">
                        {selectedConfig.slippage
                          ? `${(parseFloat(selectedConfig.slippage) * 100).toFixed(2)}%`
                          : t('configDetails.notSet')}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="analysis" className="space-y-4">
                {selectedResult ? (
                  <div className="grid grid-cols-2 gap-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">
                          {t('analysis.returnMetrics')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">
                            {t('metrics.totalReturn')}
                          </span>
                          <span
                            className={`font-bold ${getMetricColor(
                              parseFloat(selectedResult.totalReturn),
                              'return',
                            )}`}
                          >
                            {formatPercent(selectedResult.totalReturn)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">
                            {t('metrics.annualizedReturn')}
                          </span>
                          <span
                            className={`font-bold ${getMetricColor(
                              parseFloat(selectedResult.annualizedReturn),
                              'return',
                            )}`}
                          >
                            {formatPercent(selectedResult.annualizedReturn)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">
                            {t('metrics.profitFactor')}
                          </span>
                          <span className="font-bold">
                            {formatNumber(selectedResult.profitFactor)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">
                          {t('analysis.riskMetrics')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">
                            {t('metrics.sharpeRatio')}
                          </span>
                          <span
                            className={`font-bold ${getMetricColor(
                              parseFloat(selectedResult.sharpeRatio),
                              'sharpe',
                            )}`}
                          >
                            {formatNumber(selectedResult.sharpeRatio)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">
                            {t('metrics.maxDrawdown')}
                          </span>
                          <span
                            className={`font-bold ${getMetricColor(
                              parseFloat(selectedResult.maxDrawdown),
                              'drawdown',
                            )}`}
                          >
                            {formatPercent(selectedResult.maxDrawdown)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">
                            {t('metrics.winRate')}
                          </span>
                          <span
                            className={`font-bold ${getMetricColor(
                              parseFloat(selectedResult.winRate),
                              'winrate',
                            )}`}
                          >
                            {formatPercent(selectedResult.winRate)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="col-span-2">
                      <CardHeader>
                        <CardTitle className="text-base">
                          {t('analysis.tradingStats')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {t('metrics.totalTrades')}
                          </span>
                          <span className="font-bold">{selectedResult.totalTrades}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {t('analysis.avgTradeDuration')}
                          </span>
                          <span className="font-bold">
                            {formatDuration(selectedResult.avgTradeDuration)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {t('analysis.winningTrades')}
                          </span>
                          <span className="font-bold text-green-600">
                            {Math.round(
                              selectedResult.totalTrades *
                                parseFloat(selectedResult.winRate),
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {t('analysis.losingTrades')}
                          </span>
                          <span className="font-bold text-red-600">
                            {Math.round(
                              selectedResult.totalTrades *
                                (1 - parseFloat(selectedResult.winRate)),
                            )}
                          </span>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Performance Rating */}
                    <Card className="col-span-2">
                      <CardHeader>
                        <CardTitle className="text-base">
                          {t('analysis.performanceRating')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div>
                            <div className="flex justify-between mb-1">
                              <span className="text-sm">
                                {t('analysis.riskAdjustedReturn')}
                              </span>
                              <span className="text-sm font-medium">
                                {parseFloat(selectedResult.sharpeRatio) >= 2
                                  ? t('badges.excellent')
                                  : parseFloat(selectedResult.sharpeRatio) >= 1
                                    ? t('badges.good')
                                    : parseFloat(selectedResult.sharpeRatio) >= 0
                                      ? t('badges.fair')
                                      : t('badges.poor')}
                              </span>
                            </div>
                            <Progress
                              value={Math.min(
                                100,
                                (parseFloat(selectedResult.sharpeRatio) / 3) * 100,
                              )}
                              className="h-2"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between mb-1">
                              <span className="text-sm">
                                {t('analysis.winConsistency')}
                              </span>
                              <span className="text-sm font-medium">
                                {parseFloat(selectedResult.winRate) >= 0.6
                                  ? t('analysis.high')
                                  : parseFloat(selectedResult.winRate) >= 0.5
                                    ? t('analysis.moderate')
                                    : t('analysis.low')}
                              </span>
                            </div>
                            <Progress
                              value={parseFloat(selectedResult.winRate) * 100}
                              className="h-2"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between mb-1">
                              <span className="text-sm">{t('analysis.riskControl')}</span>
                              <span className="text-sm font-medium">
                                {parseFloat(selectedResult.maxDrawdown) <= 0.1
                                  ? t('badges.excellent')
                                  : parseFloat(selectedResult.maxDrawdown) <= 0.2
                                    ? t('badges.good')
                                    : t('analysis.needsImprovement')}
                              </span>
                            </div>
                            <Progress
                              value={Math.max(
                                0,
                                (1 - parseFloat(selectedResult.maxDrawdown)) * 100,
                              )}
                              className="h-2"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <IconActivity className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">{t('analysis.empty')}</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </SidebarInset>
  );
}
