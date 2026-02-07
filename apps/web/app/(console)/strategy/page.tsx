'use client';
import Image from 'next/image';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { StrategyEntity } from '@itrade/data-manager';
import {
  IconPlus,
  IconPlayerPlay,
  IconPlayerPause,
  IconTrash,
  IconEdit,
  IconChartLine,
  IconClock,
  IconSettings,
} from '@tabler/icons-react';
import {
  getStrategyDefaultParameters,
  type StrategyTypeKey,
  getImplementedStrategies,
  getAllStrategiesWithImplementationStatus,
  getStrategyConfig,
} from '@itrade/strategies';

import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
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
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { JsonEditor } from '@/components/json-editor';
import { StrategyParameterFormDynamic } from '@/components/strategy-parameter-form-dynamic';
import { ExchangeLogo } from '@/components/exchange-logo';
import { SymbolIcon } from '@/components/symbol-icon';
import {
  InitialDataConfigForm,
  type InitialDataConfig,
} from '@/components/strategy/InitialDataConfigForm';
import { SubscriptionConfigForm } from '@/components/strategy/SubscriptionConfigForm';
import {
  SUPPORTED_EXCHANGES,
  getSymbolFormatHint,
  getCryptoIconUrl,
  getTradingPairsForExchange,
  getDefaultTradingPair,
  ExchangeId,
} from '@/lib/exchanges';
import { SubscriptionConfig } from '@itrade/core';

export default function StrategyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('strategy');
  const [strategies, setStrategies] = useState<StrategyEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [strategyToDelete, setStrategyToDelete] = useState<StrategyEntity | null>(null);

  // Loading states for API operations
  const [isCreating, setIsCreating] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<number | null>(null);
  const [isUpdatingStatusId, setIsUpdatingStatusId] = useState<number | null>(null);
  // 使用策略配置系统获取默认值
  const getDefaultStrategyType = (): StrategyTypeKey => {
    const implementedStrategies = getImplementedStrategies();
    return implementedStrategies.length > 0
      ? (implementedStrategies[0].type as StrategyTypeKey)
      : 'MovingAverageStrategy';
  };

  const getDefaultParametersForType = (type: StrategyTypeKey) => {
    return getStrategyDefaultParameters(type);
  };

  // 处理参数表单变化
  const handleParametersChange = useCallback((parameters: Record<string, unknown>) => {
    setFormData((prev) => ({
      ...prev,
      parameters: JSON.stringify(parameters, null, 2),
    }));
  }, []);

  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    type: StrategyTypeKey;
    exchange: string | string[];
    symbol: string;
    parameters: string;
    initialDataConfig: InitialDataConfig;
    subscription: SubscriptionConfig;
  }>({
    name: '',
    description: '',
    type: getDefaultStrategyType(),
    exchange: 'coinbase',
    symbol: 'BTC/USDC:USDC',
    parameters: JSON.stringify(
      getDefaultParametersForType(getDefaultStrategyType()),
      null,
      2,
    ),
    initialDataConfig: {},
    subscription: {},
  });

  const [useMultipleExchanges, setUseMultipleExchanges] = useState(false);

  // 使用useMemo稳定initialParameters引用，避免无限循环
  const memoizedInitialParameters = useMemo(() => {
    try {
      return JSON.parse(formData.parameters);
    } catch {
      return getDefaultParametersForType(formData.type as StrategyTypeKey);
    }
  }, [formData.parameters, formData.type]);

  // 🆕 Get current strategy configuration (including requirements)
  const currentStrategyConfig = useMemo(() => {
    return getStrategyConfig(formData.type as StrategyTypeKey);
  }, [formData.type]);

  // 🆕 Extract subscription and initial data requirements from strategy config
  const subscriptionRequirements = currentStrategyConfig?.subscriptionRequirements;
  const initialDataRequirements = currentStrategyConfig?.initialDataRequirements;

  // 🔄 Convert initialDataConfig from strategy config format to form format
  const convertInitialDataToFormFormat = useCallback(
    (initialDataConfig: unknown): InitialDataConfig => {
      if (!initialDataConfig || typeof initialDataConfig !== 'object') {
        return {};
      }

      const data = initialDataConfig as Record<string, unknown>;
      const formData: InitialDataConfig = { ...data };

      // Convert klines from object format { '15m': 20 } to array format
      if (data.klines && typeof data.klines === 'object' && !Array.isArray(data.klines)) {
        const klinesObj = data.klines as Record<string, number>;
        formData.klines = Object.entries(klinesObj).map(([interval, limit]) => ({
          interval,
          limit,
        }));
      }

      return formData;
    },
    [],
  );

  // 🔄 Convert initialDataConfig from form format back to strategy config format
  const convertInitialDataToConfigFormat = useCallback((formData: InitialDataConfig) => {
    const configDataConfig: Record<string, unknown> = { ...formData };

    // Convert klines array back to object format for storage
    if (formData.klines && Array.isArray(formData.klines) && formData.klines.length > 0) {
      const klinesObj: Record<string, number> = {};
      formData.klines.forEach((kline) => {
        klinesObj[kline.interval] = kline.limit;
      });
      configDataConfig.klines = klinesObj;
    } else {
      delete configDataConfig.klines;
    }

    return configDataConfig;
  }, []);

  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAdvancedMode, setShowAdvancedMode] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [canSubmit, setCanSubmit] = useState(false);
  const [nameAvailable, setNameAvailable] = useState(true);
  const [checkingName, setCheckingName] = useState(false);
  const [nameError, setNameError] = useState('');

  const steps = [
    {
      id: 'basic',
      label: t('steps.basic.label'),
      description: t('steps.basic.description'),
    },
    {
      id: 'parameters',
      label: t('steps.parameters.label'),
      description: t('steps.parameters.description'),
    },
    {
      id: 'initial-data',
      label: t('steps.initialData.label'),
      description: t('steps.initialData.description'),
    },
    {
      id: 'subscriptions',
      label: t('steps.subscriptions.label'),
      description: t('steps.subscriptions.description'),
    },
  ];

  // Check if strategy name is available
  const checkNameAvailability = useCallback(
    async (name: string) => {
      if (!name || name.trim() === '') {
        setNameAvailable(true);
        setNameError('');
        return;
      }

      setCheckingName(true);
      setNameError('');

      try {
        const url = new URL('/api/strategies/check-name', window.location.origin);
        url.searchParams.set('name', name.trim());
        if (editingId) {
          url.searchParams.set('excludeId', editingId.toString());
        }

        const response = await fetch(url.toString());
        const data = await response.json();

        if (response.ok) {
          setNameAvailable(data.available);
          if (!data.available) {
            setNameError(t('errors.nameExists'));
          }
        } else {
          setNameError(t('errors.checkNameFailed'));
          setNameAvailable(false);
        }
      } catch (error) {
        console.error(t('errors.checkNameConsole'), error);
        setNameError(t('errors.checkNameFailed'));
        setNameAvailable(false);
      } finally {
        setCheckingName(false);
      }
    },
    [editingId, t],
  );

  // Validate current step
  const validateStep = (step: number): boolean => {
    switch (step) {
      case 0: // Basic Info
        return !!(
          formData.name &&
          formData.type &&
          formData.exchange &&
          formData.symbol &&
          nameAvailable &&
          !checkingName
        );
      case 1: // Parameters
        try {
          JSON.parse(formData.parameters);
          return true;
        } catch {
          return false;
        }
      case 2: // Initial Data (optional)
        return true;
      case 3: // Subscriptions (optional)
        return true;
      default:
        return false;
    }
  };

  const canProceedToNextStep = validateStep(currentStep);

  const handleNext = () => {
    if (canProceedToNextStep && currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Handle submit button enabling with delay on step 4
  useEffect(() => {
    if (currentStep === 3) {
      // Step 4 (index 3) - disable submit initially, enable after 5 seconds
      setCanSubmit(false);
      const timer = setTimeout(() => {
        setCanSubmit(true);
      }, 5000); // 5 seconds delay

      return () => clearTimeout(timer);
    } else {
      // Other steps - disable submit button
      setCanSubmit(false);
    }
  }, [currentStep]);

  const fetchStrategies = useCallback(async () => {
    try {
      const response = await fetch('/api/strategies', { cache: 'no-store' });
      if (!response.ok) throw new Error(t('errors.fetchStrategies'));
      const data = await response.json();
      setStrategies(data.strategies);
    } catch {
      toast.error(t('errors.loadStrategies'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchStrategies();
  }, [fetchStrategies]);

  const createStrategy = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent multiple submissions
    if (isCreating) return;

    setIsCreating(true);
    try {
      let parameters;
      try {
        parameters = JSON.parse(formData.parameters);
      } catch {
        toast.error(t('errors.invalidParametersJson'));
        return;
      }

      const url = isEditing ? `/api/strategies/${editingId}` : '/api/strategies';
      const method = isEditing ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, parameters }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error || t(isEditing ? 'errors.updateStrategy' : 'errors.createStrategy'),
        );
      }

      toast.success(t(isEditing ? 'messages.updated' : 'messages.created'));
      setIsCreateDialogOpen(false);
      resetForm();
      fetchStrategies();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errors.generic'));
    } finally {
      setIsCreating(false);
    }
  };

  const editStrategy = (strategy: StrategyEntity) => {
    setFormData({
      name: strategy.name,
      description: strategy.description || '',
      type: strategy.type as StrategyTypeKey,
      exchange: strategy.exchange || 'binance',
      symbol: strategy.symbol || '',
      parameters: JSON.stringify(strategy.parameters || {}, null, 2),
      initialDataConfig: strategy.initialDataConfig || {},
      subscription: strategy.subscription || {},
    });
    setIsEditing(true);
    setEditingId(strategy.id);
    setIsCreateDialogOpen(true);
  };

  const resetForm = () => {
    const defaultType = getDefaultStrategyType();
    setFormData({
      name: '',
      description: '',
      type: defaultType,
      exchange: 'coinbase',
      symbol: 'BTC/USDC:USDC',
      parameters: JSON.stringify(getDefaultParametersForType(defaultType), null, 2),
      initialDataConfig: {},
      subscription: {},
    });
    setIsEditing(false);
    setEditingId(null);
    setShowAdvancedMode(false);
    setCurrentStep(0); // Reset to first step
    setNameAvailable(true); // Reset name validation
    setCheckingName(false);
    setNameError('');
    setIsCreating(false); // Reset creating state
  };

  useEffect(() => {
    const editId = searchParams.get('edit');
    if (editId && strategies.length > 0) {
      const strategyToEdit = strategies.find((s) => s.id === parseInt(editId));
      if (strategyToEdit) {
        editStrategy(strategyToEdit);
        router.replace('/strategy');
      }
    }
  }, [searchParams, strategies, router]);

  const updateStrategyStatus = async (id: number, newStatus: string) => {
    // Prevent multiple status updates for the same strategy
    if (isUpdatingStatusId === id) return;

    setIsUpdatingStatusId(id);
    try {
      const response = await fetch(`/api/strategies/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) throw new Error(t('errors.updateStatus'));

      toast.success(t(newStatus === 'active' ? 'messages.started' : 'messages.stopped'));
      fetchStrategies();
    } catch {
      toast.error(t('errors.updateStatus'));
    } finally {
      setIsUpdatingStatusId(null);
    }
  };

  const openDeleteDialog = (strategy: StrategyEntity) => {
    setStrategyToDelete(strategy);
    setIsDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    setIsDeleteDialogOpen(false);
    setStrategyToDelete(null);
  };

  const confirmDeleteStrategy = async () => {
    if (!strategyToDelete || isDeletingId === strategyToDelete.id) return;

    setIsDeletingId(strategyToDelete.id);
    try {
      const response = await fetch(`/api/strategies/${strategyToDelete.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t('errors.deleteStrategy'));
      }

      toast.success(t('messages.deleted'));
      fetchStrategies();
      closeDeleteDialog();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errors.deleteStrategy'));
    } finally {
      setIsDeletingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> =
      {
        active: 'default',
        stopped: 'secondary',
        paused: 'outline',
        error: 'destructive',
      };
    const label =
      status === 'active'
        ? t('status.active')
        : status === 'stopped'
          ? t('status.stopped')
          : status === 'paused'
            ? t('status.paused')
            : status === 'error'
              ? t('status.error')
              : status.toUpperCase();
    return <Badge variant={variants[status] || 'default'}>{label}</Badge>;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500';
      case 'stopped':
        return 'bg-gray-500';
      case 'paused':
        return 'bg-yellow-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <>
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
                <Dialog
                  open={isCreateDialogOpen}
                  onOpenChange={(open) => {
                    setIsCreateDialogOpen(open);
                    if (!open) resetForm();
                  }}
                >
                  <DialogTrigger asChild>
                    <Button size="lg">
                      <IconPlus className="mr-2 h-4 w-4" />
                      {t('actions.new')}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>
                        {isEditing ? t('dialog.editTitle') : t('dialog.createTitle')}
                      </DialogTitle>
                      <DialogDescription>
                        {isEditing
                          ? t('dialog.editDescription')
                          : t('dialog.createDescription')}
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={createStrategy} className="space-y-6">
                      {/* Step Indicator */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          {steps.map((step, index) => (
                            <div key={step.id} className="flex-1 flex items-center">
                              <div className="flex flex-col items-center flex-1">
                                <div
                                  className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors ${
                                    index < currentStep
                                      ? 'bg-green-500 border-green-500 text-white'
                                      : index === currentStep
                                        ? 'bg-blue-500 border-blue-500 text-white'
                                        : 'bg-muted border-muted-foreground/20 text-muted-foreground'
                                  }`}
                                >
                                  {index < currentStep ? (
                                    <svg
                                      className="w-5 h-5"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M5 13l4 4L19 7"
                                      />
                                    </svg>
                                  ) : (
                                    <span className="text-sm font-semibold">
                                      {index + 1}
                                    </span>
                                  )}
                                </div>
                                <div className="mt-2 text-center">
                                  <div
                                    className={`text-sm font-medium ${
                                      index === currentStep
                                        ? 'text-foreground'
                                        : 'text-muted-foreground'
                                    }`}
                                  >
                                    {step.label}
                                  </div>
                                  <div className="text-xs text-muted-foreground mt-0.5">
                                    {step.description}
                                  </div>
                                </div>
                              </div>
                              {index < steps.length - 1 && (
                                <div
                                  className={`h-0.5 flex-1 mx-2 transition-colors ${
                                    index < currentStep
                                      ? 'bg-green-500'
                                      : 'bg-muted-foreground/20'
                                  }`}
                                  style={{ marginTop: '-40px' }}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Step Content */}
                      <div className="min-h-[400px]">
                        {currentStep === 0 && (
                          <div className="space-y-4 mt-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor="name">
                                  {t('fields.name')}{' '}
                                  <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                  id="name"
                                  placeholder={t('fields.namePlaceholder')}
                                  value={formData.name}
                                  onChange={(e) => {
                                    setFormData({
                                      ...formData,
                                      name: e.target.value,
                                    });
                                    // Reset error when typing
                                    if (nameError) {
                                      setNameError('');
                                      setNameAvailable(true);
                                    }
                                  }}
                                  onBlur={(e) => {
                                    // Check name availability when input loses focus
                                    checkNameAvailability(e.target.value);
                                  }}
                                  required
                                  className={nameError ? 'border-red-500' : ''}
                                />
                                {checkingName && (
                                  <p className="text-xs text-muted-foreground">
                                    {t('states.checkingName')}
                                  </p>
                                )}
                                {nameError && (
                                  <p className="text-xs text-red-500">{nameError}</p>
                                )}
                                {!checkingName &&
                                  !nameError &&
                                  formData.name &&
                                  nameAvailable && (
                                    <p className="text-xs text-green-600">
                                      {t('states.nameAvailable')}
                                    </p>
                                  )}
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="type">
                                  {t('fields.type')}{' '}
                                  <span className="text-red-500">*</span>
                                </Label>
                                <Select
                                  value={formData.type}
                                  onValueChange={(value: StrategyTypeKey) => {
                                    // 当策略类型改变时，自动更新默认参数
                                    const newParameters =
                                      getDefaultParametersForType(value);
                                    setFormData({
                                      ...formData,
                                      type: value,
                                      parameters: JSON.stringify(newParameters, null, 2),
                                    });
                                    // 重置为表单模式以便用户看到新策略的参数
                                    setShowAdvancedMode(false);
                                  }}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent container={false}>
                                    {getAllStrategiesWithImplementationStatus().map(
                                      (strategy) => (
                                        <SelectItem
                                          key={strategy.type as string}
                                          value={strategy.type as string}
                                          disabled={!strategy.implemented}
                                        >
                                          <div className="flex items-center gap-2">
                                            <span>
                                              {strategy.icon as React.ReactNode}
                                            </span>
                                            <div className="flex flex-col">
                                              <span className="font-medium">
                                                {strategy.name as React.ReactNode}
                                              </span>
                                              {!strategy.implemented && (
                                                <span className="text-xs text-muted-foreground">
                                                  {t('states.comingSoon')}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </SelectItem>
                                      ),
                                    )}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <Label htmlFor="exchange">
                                    {t('fields.exchanges')}{' '}
                                    <span className="text-red-500">*</span>
                                  </Label>
                                  <div className="flex items-center space-x-2">
                                    <Checkbox
                                      id="multiple-exchanges"
                                      checked={useMultipleExchanges}
                                      onCheckedChange={(checked) => {
                                        setUseMultipleExchanges(checked as boolean);
                                        if (checked) {
                                          // Convert to array
                                          setFormData({
                                            ...formData,
                                            exchange: Array.isArray(formData.exchange)
                                              ? formData.exchange
                                              : [formData.exchange as string],
                                          });
                                        } else {
                                          // Convert to string (use first exchange)
                                          setFormData({
                                            ...formData,
                                            exchange: Array.isArray(formData.exchange)
                                              ? formData.exchange[0] || 'coinbase'
                                              : formData.exchange,
                                          });
                                        }
                                      }}
                                    />
                                    <label
                                      htmlFor="multiple-exchanges"
                                      className="text-sm text-muted-foreground cursor-pointer"
                                    >
                                      {t('fields.multiple')}
                                    </label>
                                  </div>
                                </div>

                                {!useMultipleExchanges ? (
                                  <Select
                                    value={
                                      Array.isArray(formData.exchange)
                                        ? formData.exchange[0]
                                        : formData.exchange
                                    }
                                    onValueChange={(value) => {
                                      const defaultTradingPair = getDefaultTradingPair(
                                        value as ExchangeId,
                                      );
                                      setFormData({
                                        ...formData,
                                        exchange: value,
                                        symbol: isEditing
                                          ? formData.symbol
                                          : defaultTradingPair,
                                      });
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue
                                        placeholder={t('fields.exchangePlaceholder')}
                                      />
                                    </SelectTrigger>
                                    <SelectContent container={false}>
                                      {SUPPORTED_EXCHANGES.map((exchange) => {
                                        const logoUrl =
                                          'logoUrl' in exchange
                                            ? exchange.logoUrl
                                            : undefined;
                                        const iconEmoji =
                                          'iconEmoji' in exchange
                                            ? exchange.iconEmoji
                                            : '💱';
                                        return (
                                          <SelectItem
                                            key={exchange.id}
                                            value={exchange.id}
                                          >
                                            <div className="flex items-center gap-3">
                                              {logoUrl ? (
                                                <Image
                                                  src={logoUrl}
                                                  alt={exchange.name}
                                                  width={20}
                                                  height={20}
                                                  className="w-5 h-5 rounded-full pointer-events-none"
                                                  onError={(e) => {
                                                    (
                                                      e.target as HTMLImageElement
                                                    ).style.display = 'none';
                                                  }}
                                                />
                                              ) : (
                                                <span className="text-base pointer-events-none">
                                                  {iconEmoji}
                                                </span>
                                              )}
                                              <div className="flex items-center gap-2 pointer-events-none">
                                                <span className="font-medium">
                                                  {exchange.name}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                  ({exchange.description})
                                                </span>
                                              </div>
                                            </div>
                                          </SelectItem>
                                        );
                                      })}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <div className="space-y-2 border rounded-md p-3">
                                    {SUPPORTED_EXCHANGES.map((exchange) => {
                                      const selectedExchanges = Array.isArray(
                                        formData.exchange,
                                      )
                                        ? formData.exchange
                                        : [formData.exchange];
                                      const isSelected = selectedExchanges.includes(
                                        exchange.id,
                                      );
                                      const logoUrl =
                                        'logoUrl' in exchange
                                          ? exchange.logoUrl
                                          : undefined;
                                      const iconEmoji =
                                        'iconEmoji' in exchange
                                          ? exchange.iconEmoji
                                          : '💱';

                                      return (
                                        <div
                                          key={exchange.id}
                                          className="flex items-center space-x-2"
                                        >
                                          <Checkbox
                                            id={`exchange-${exchange.id}`}
                                            checked={isSelected}
                                            onCheckedChange={(checked) => {
                                              const currentExchanges = Array.isArray(
                                                formData.exchange,
                                              )
                                                ? formData.exchange
                                                : [formData.exchange as string];

                                              let newExchanges: string[];
                                              if (checked) {
                                                newExchanges = [
                                                  ...currentExchanges,
                                                  exchange.id,
                                                ];
                                              } else {
                                                newExchanges = currentExchanges.filter(
                                                  (e) => e !== exchange.id,
                                                );
                                              }

                                              setFormData({
                                                ...formData,
                                                exchange:
                                                  newExchanges.length > 0
                                                    ? newExchanges
                                                    : ['coinbase'],
                                              });
                                            }}
                                          />
                                          <label
                                            htmlFor={`exchange-${exchange.id}`}
                                            className="flex items-center gap-2 cursor-pointer flex-1"
                                          >
                                            {logoUrl ? (
                                              <Image
                                                src={logoUrl}
                                                alt={exchange.name}
                                                width={16}
                                                height={16}
                                                className="w-4 h-4 rounded-full"
                                                onError={(e) => {
                                                  (
                                                    e.target as HTMLImageElement
                                                  ).style.display = 'none';
                                                }}
                                              />
                                            ) : (
                                              <span className="text-sm">{iconEmoji}</span>
                                            )}
                                            <span className="text-sm font-medium">
                                              {exchange.name}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                              ({exchange.description})
                                            </span>
                                          </label>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                <p className="text-xs text-muted-foreground">
                                  {useMultipleExchanges
                                    ? t('fields.exchangeMultipleHint')
                                    : t('fields.exchangeSingleHint')}
                                </p>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="symbol">
                                  {t('fields.tradingPair')}{' '}
                                  <span className="text-red-500">*</span>
                                </Label>
                                <Select
                                  value={formData.symbol}
                                  onValueChange={(value) =>
                                    setFormData({ ...formData, symbol: value })
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue
                                      placeholder={t('fields.tradingPairPlaceholder')}
                                    />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {getTradingPairsForExchange(
                                      (Array.isArray(formData.exchange)
                                        ? formData.exchange[0]
                                        : formData.exchange) as ExchangeId,
                                    ).map((pair) => (
                                      <SelectItem key={pair.symbol} value={pair.symbol}>
                                        <div className="flex items-center gap-2">
                                          <Image
                                            src={getCryptoIconUrl(pair.base)}
                                            alt={pair.base}
                                            width={16}
                                            height={16}
                                            className="w-4 h-4 rounded-full"
                                            onError={(e) => {
                                              (
                                                e.target as HTMLImageElement
                                              ).style.display = 'none';
                                            }}
                                          />
                                          <span className="font-medium">{pair.name}</span>
                                          <span className="text-xs text-muted-foreground">
                                            (
                                            {pair.type === 'perpetual'
                                              ? t('fields.perpLabel')
                                              : t('fields.spotLabel')}
                                            )
                                          </span>
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                  {t('fields.symbolFormat')}{' '}
                                  {getSymbolFormatHint(
                                    Array.isArray(formData.exchange)
                                      ? formData.exchange[0]
                                      : formData.exchange,
                                  )}{' '}
                                  • {t('fields.symbolNormalized')}
                                  {useMultipleExchanges && (
                                    <span className="block text-yellow-600 mt-1">
                                      {t('fields.symbolMultipleWarning')}
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="description">
                                {t('fields.description')}
                              </Label>
                              <Textarea
                                id="description"
                                placeholder={t('fields.descriptionPlaceholder')}
                                value={formData.description}
                                onChange={(e) =>
                                  setFormData({
                                    ...formData,
                                    description: e.target.value,
                                  })
                                }
                                rows={3}
                              />
                            </div>
                          </div>
                        )}

                        {currentStep === 1 && (
                          <div className="space-y-4 mt-4">
                            <div className="flex items-center justify-between mb-4">
                              <div>
                                <Label className="text-base font-medium">
                                  {t('fields.parameters')}{' '}
                                  <span className="text-red-500">*</span>
                                </Label>
                                <p className="text-sm text-muted-foreground">
                                  {showAdvancedMode
                                    ? t('fields.parametersJsonHint')
                                    : t('fields.parametersFormHint')}
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setShowAdvancedMode(!showAdvancedMode)}
                              >
                                {showAdvancedMode ? (
                                  <>
                                    <IconSettings className="h-4 w-4 mr-2" />
                                    {t('fields.formMode')}
                                  </>
                                ) : (
                                  <>
                                    <IconClock className="h-4 w-4 mr-2" />
                                    {t('fields.jsonMode')}
                                  </>
                                )}
                              </Button>
                            </div>

                            {showAdvancedMode ? (
                              <div className="space-y-2">
                                <JsonEditor
                                  value={formData.parameters}
                                  onChange={(value) =>
                                    setFormData({
                                      ...formData,
                                      parameters: value,
                                    })
                                  }
                                  placeholder={JSON.stringify(
                                    getDefaultParametersForType(
                                      formData.type as StrategyTypeKey,
                                    ),
                                    null,
                                    2,
                                  )}
                                />
                                <p className="text-xs text-muted-foreground">
                                  {t('fields.parametersAdvancedHint')}
                                </p>
                              </div>
                            ) : (
                              <StrategyParameterFormDynamic
                                strategyType={formData.type as StrategyTypeKey}
                                initialParameters={memoizedInitialParameters}
                                onParametersChange={handleParametersChange}
                              />
                            )}
                          </div>
                        )}

                        {currentStep === 2 && (
                          <div className="space-y-4 mt-4">
                            <InitialDataConfigForm
                              value={convertInitialDataToFormFormat(
                                formData.initialDataConfig,
                              )}
                              onChange={(initialDataConfig) => {
                                setFormData({
                                  ...formData,
                                  initialDataConfig:
                                    convertInitialDataToConfigFormat(initialDataConfig),
                                });
                              }}
                              requirements={initialDataRequirements}
                            />
                          </div>
                        )}

                        {currentStep === 3 && (
                          <div className="space-y-4 mt-4">
                            <SubscriptionConfigForm
                              value={formData.subscription}
                              onChange={(subscription) => {
                                setFormData({
                                  ...formData,
                                  subscription,
                                });
                              }}
                              requirements={subscriptionRequirements}
                            />
                          </div>
                        )}
                      </div>

                      {/* Navigation Buttons */}
                      <Separator />
                      <div className="flex justify-between gap-2 pt-2">
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
                        <div className="flex gap-2">
                          {currentStep > 0 && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handlePrevious}
                            >
                              {t('actions.previous')}
                            </Button>
                          )}
                          {currentStep < steps.length - 1 ? (
                            <Button
                              type="button"
                              onClick={handleNext}
                              disabled={!canProceedToNextStep}
                            >
                              {t('actions.next')}
                            </Button>
                          ) : (
                            <Button
                              type="submit"
                              disabled={!canProceedToNextStep || !canSubmit || isCreating}
                            >
                              {isCreating ? (
                                <>
                                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                                  {isEditing
                                    ? t('actions.updating')
                                    : t('actions.creating')}
                                </>
                              ) : (
                                <>
                                  {isEditing
                                    ? t('actions.updateStrategy')
                                    : t('actions.createStrategy')}
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Strategies List */}
              <div className="px-4 lg:px-6">
                {loading ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="text-center space-y-3">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
                      <p className="text-sm text-muted-foreground">
                        {t('states.loading')}
                      </p>
                    </div>
                  </div>
                ) : strategies.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-16">
                      <div className="rounded-full bg-muted p-4 mb-4">
                        <IconChartLine className="h-8 w-8 text-muted-foreground" />
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
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {strategies.map((strategy) => (
                      <Card
                        key={strategy.id}
                        className="hover:shadow-lg transition-shadow duration-200"
                      >
                        <CardHeader>
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <CardTitle
                                className="text-lg flex items-center gap-2 cursor-pointer hover:underline"
                                onClick={() => router.push(`/strategy/${strategy.id}`)}
                              >
                                <div
                                  className={`h-2 w-2 rounded-full ${getStatusColor(strategy.status)}`}
                                />
                                {strategy.name}
                              </CardTitle>
                              <CardDescription className="mt-1">
                                {strategy.type.replace(/_/g, ' ')}
                              </CardDescription>
                            </div>
                            {getStatusBadge(strategy.status)}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {strategy.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {strategy.description}
                            </p>
                          )}

                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">
                                {t('card.exchange')}
                              </span>
                              <Badge
                                variant="outline"
                                className="font-medium gap-1.5 flex items-center"
                              >
                                <ExchangeLogo
                                  exchange={strategy.exchange || ''}
                                  size="sm"
                                />
                                {strategy.exchange
                                  ? strategy.exchange.charAt(0).toUpperCase() +
                                    strategy.exchange.slice(1)
                                  : t('card.notSet')}
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">
                                {t('card.tradingPair')}
                              </span>
                              <div className="flex items-center gap-2">
                                {strategy.symbol && (
                                  <SymbolIcon symbol={strategy.symbol} size="sm" />
                                )}
                                <span className="font-mono font-medium">
                                  {strategy.normalizedSymbol ||
                                    strategy.symbol ||
                                    t('card.notAvailable')}
                                </span>
                                {strategy.marketType &&
                                  strategy.marketType !== 'spot' && (
                                    <span
                                      className="text-xs"
                                      title={
                                        strategy.marketType === 'perpetual'
                                          ? t('card.perpetual')
                                          : t('card.futures')
                                      }
                                    >
                                      {strategy.marketType === 'perpetual' ? '⚡' : '📈'}
                                    </span>
                                  )}
                              </div>
                            </div>
                            {strategy.lastExecutionTime && (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
                                <IconClock className="h-3 w-3" />
                                <span>
                                  {t('card.lastRun', {
                                    time: new Date(
                                      strategy.lastExecutionTime,
                                    ).toLocaleString(),
                                  })}
                                </span>
                              </div>
                            )}
                          </div>
                        </CardContent>
                        <CardFooter className="flex gap-2">
                          {strategy.status === 'active' ? (
                            <Button
                              variant="outline"
                              className="flex-1"
                              onClick={() => updateStrategyStatus(strategy.id, 'stopped')}
                              disabled={isUpdatingStatusId === strategy.id}
                            >
                              {isUpdatingStatusId === strategy.id ? (
                                <>
                                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                                  {t('actions.stopping')}
                                </>
                              ) : (
                                <>
                                  <IconPlayerPause className="h-4 w-4 mr-2" />
                                  {t('actions.stop')}
                                </>
                              )}
                            </Button>
                          ) : (
                            <Button
                              className="flex-1"
                              onClick={() => updateStrategyStatus(strategy.id, 'active')}
                              disabled={isUpdatingStatusId === strategy.id}
                            >
                              {isUpdatingStatusId === strategy.id ? (
                                <>
                                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                                  {t('actions.starting')}
                                </>
                              ) : (
                                <>
                                  <IconPlayerPlay className="h-4 w-4 mr-2" />
                                  {t('actions.start')}
                                </>
                              )}
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => editStrategy(strategy)}
                            disabled={
                              strategy.status === 'active' ||
                              isUpdatingStatusId === strategy.id
                            }
                          >
                            <IconEdit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => openDeleteDialog(strategy)}
                            disabled={
                              strategy.status === 'active' ||
                              isUpdatingStatusId === strategy.id
                            }
                            className="hover:bg-destructive hover:text-destructive-foreground"
                          >
                            <IconTrash className="h-4 w-4" />
                          </Button>
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <IconTrash className="h-5 w-5" />
              {t('delete.title')}
            </DialogTitle>
            <DialogDescription className="pt-2">
              {t('delete.description')}
            </DialogDescription>
          </DialogHeader>
          {strategyToDelete && (
            <div className="py-4">
              <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t('delete.name')}</span>
                  <span className="text-sm font-semibold">{strategyToDelete.name}</span>
                </div>
                {strategyToDelete.symbol && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{t('delete.symbol')}</span>
                    <div className="flex items-center gap-2">
                      <SymbolIcon symbol={strategyToDelete.symbol} size="sm" />
                      <span className="text-sm font-mono">{strategyToDelete.symbol}</span>
                    </div>
                  </div>
                )}
                {strategyToDelete.exchange && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{t('delete.exchange')}</span>
                    <div className="flex items-center gap-2">
                      <ExchangeLogo exchange={strategyToDelete.exchange} size="sm" />
                      <span className="text-sm capitalize">
                        {strategyToDelete.exchange}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-4">{t('delete.warning')}</p>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={closeDeleteDialog}
              className="min-w-[100px]"
              disabled={isDeletingId !== null}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteStrategy}
              className="min-w-[100px]"
              disabled={isDeletingId !== null}
            >
              {isDeletingId !== null ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                  {t('actions.deleting')}
                </>
              ) : (
                <>
                  <IconTrash className="h-4 w-4 mr-2" />
                  {t('actions.delete')}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
