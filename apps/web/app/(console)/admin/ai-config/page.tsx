'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset } from '@/components/ui/sidebar';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { IconLoader2, IconEye, IconEyeOff, IconRefresh } from '@tabler/icons-react';
import { authClient } from '@/lib/auth-client';

type AIProvider = 'google' | 'openai';

type AiConfigForm = {
  ai_provider: AIProvider;
  ai_api_key: string;
  ai_base_url: string;
  ai_model: string;
  chat_title: string;
};

type ListedModel = {
  id: string;
  label: string;
};

type AiConfigResponse = {
  ai_provider: AIProvider;
  ai_api_key: string;
  ai_api_key_set: boolean;
  ai_base_url: string;
  ai_model: string;
  chat_title: string;
  provider_label: string;
};

const PROVIDER_OPTIONS: Array<{ value: AIProvider; label: string; hint: string }> = [
  {
    value: 'google',
    label: 'Google Gemini',
    hint: 'Uses the Google Generative Language API.',
  },
  {
    value: 'openai',
    label: 'OpenAI / Compatible',
    hint: 'Works with OpenAI, Azure OpenAI proxies, Ollama OpenAI shim, etc.',
  },
];

const DEFAULT_BASE_URLS: Record<AIProvider, string> = {
  google: 'https://generativelanguage.googleapis.com/v1beta',
  openai: 'https://api.openai.com/v1',
};

const DEFAULT_MODELS: Record<AIProvider, string> = {
  google: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
};

export default function AdminAiConfigPage() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeySet, setApiKeySet] = useState(false);
  const [maskedApiKey, setMaskedApiKey] = useState('');
  const [availableModels, setAvailableModels] = useState<ListedModel[]>([]);
  const [form, setForm] = useState<AiConfigForm>({
    ai_provider: 'google',
    ai_api_key: '',
    ai_base_url: DEFAULT_BASE_URLS.google,
    ai_model: DEFAULT_MODELS.google,
    chat_title: '',
  });

  useEffect(() => {
    if (sessionPending) return;
    if (!session || (session.user as { role?: string }).role !== 'admin') {
      router.push('/dashboard');
    }
  }, [session, sessionPending, router]);

  const fetchModelsForConfig = useCallback(
    async (input: {
      provider: AIProvider;
      baseUrl: string;
      model: string;
      apiKey?: string;
      silent?: boolean;
    }) => {
      setIsFetchingModels(true);
      try {
        const res = await fetch('/api/admin/ai-config/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: input.provider,
            api_key: input.apiKey?.trim() || undefined,
            base_url: input.baseUrl.trim() || undefined,
          }),
        });
        const data = (await res.json()) as { models?: ListedModel[]; error?: string };
        if (!res.ok) {
          throw new Error(data.error || 'Failed to fetch models');
        }

        const models = data.models ?? [];
        setAvailableModels(models);

        if (models.length === 0) {
          if (!input.silent)
            toast.warning('No chat models were returned by the provider.');
        } else if (!input.silent) {
          toast.success(`Loaded ${models.length} available models.`);
        }

        if (models.length > 0 && !models.some((m) => m.id === input.model)) {
          setForm((prev) => ({ ...prev, ai_model: models[0].id }));
        }
      } catch (error) {
        if (!input.silent) {
          toast.error(
            error instanceof Error
              ? error.message
              : 'Failed to fetch models from provider.',
          );
        }
      } finally {
        setIsFetchingModels(false);
      }
    },
    [],
  );

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/ai-config');
      if (!res.ok) throw new Error('Failed to load settings');
      const data = (await res.json()) as AiConfigResponse;

      setApiKeySet(data.ai_api_key_set);
      setMaskedApiKey(data.ai_api_key);
      setForm({
        ai_provider: data.ai_provider,
        ai_api_key: '',
        ai_base_url: data.ai_base_url || DEFAULT_BASE_URLS[data.ai_provider],
        ai_model: data.ai_model || DEFAULT_MODELS[data.ai_provider],
        chat_title: data.chat_title,
      });
      setAvailableModels([]);

      if (data.ai_api_key_set) {
        void fetchModelsForConfig({
          provider: data.ai_provider,
          baseUrl: data.ai_base_url || DEFAULT_BASE_URLS[data.ai_provider],
          model: data.ai_model || DEFAULT_MODELS[data.ai_provider],
          silent: true,
        });
      }
    } catch {
      toast.error('Failed to load AI configuration.');
    } finally {
      setIsLoading(false);
    }
  }, [fetchModelsForConfig]);

  useEffect(() => {
    if (
      !sessionPending &&
      session &&
      (session.user as { role?: string }).role === 'admin'
    ) {
      loadSettings();
    }
  }, [session, sessionPending, loadSettings]);

  const set = <K extends keyof AiConfigForm>(field: K, value: AiConfigForm[K]) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleProviderChange = (provider: AIProvider) => {
    setForm((prev) => ({
      ...prev,
      ai_provider: provider,
      ai_base_url: DEFAULT_BASE_URLS[provider],
      ai_model: DEFAULT_MODELS[provider],
    }));
    setAvailableModels([]);
  };

  const fetchModels = useCallback(
    async (options?: { silent?: boolean }) => {
      await fetchModelsForConfig({
        provider: form.ai_provider,
        baseUrl: form.ai_base_url,
        model: form.ai_model,
        apiKey: form.ai_api_key,
        silent: options?.silent,
      });
    },
    [
      fetchModelsForConfig,
      form.ai_api_key,
      form.ai_base_url,
      form.ai_model,
      form.ai_provider,
    ],
  );

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const body: Partial<AiConfigForm> = {
        ai_provider: form.ai_provider,
        ai_base_url: form.ai_base_url.trim(),
        ai_model: form.ai_model.trim(),
        chat_title: form.chat_title.trim(),
      };

      if (form.ai_api_key.trim()) {
        body.ai_api_key = form.ai_api_key.trim();
      }

      const res = await fetch('/api/admin/ai-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Save failed');

      toast.success('AI configuration saved. Changes take effect within 30 seconds.');
      await loadSettings();
    } catch {
      toast.error('Failed to save AI configuration.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearApiKey = async () => {
    if (
      !window.confirm(
        'Remove the stored API key? The server will fall back to environment variables.',
      )
    ) {
      return;
    }

    setIsSaving(true);
    try {
      await fetch('/api/admin/ai-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai_api_key: '' }),
      });
      toast.success('API key cleared.');
      await loadSettings();
    } catch {
      toast.error('Failed to clear API key.');
    } finally {
      setIsSaving(false);
    }
  };

  if (
    sessionPending ||
    (session && (session.user as { role?: string }).role !== 'admin')
  ) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <IconLoader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeProvider = PROVIDER_OPTIONS.find((p) => p.value === form.ai_provider);
  const previewTitle =
    form.chat_title ||
    `Powered by ${activeProvider?.label ?? 'AI'} · ${form.ai_model || DEFAULT_MODELS[form.ai_provider]}`;

  return (
    <SidebarInset>
      <SiteHeader title="Admin - AI Config" />
      <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">AI Configuration</h2>
            <p className="text-muted-foreground text-sm">
              Configure the chatbot provider, credentials, and model at runtime — no
              restart required. Supports Google Gemini and OpenAI-compatible APIs.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadSettings}
              disabled={isLoading || isSaving}
            >
              <IconRefresh
                className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`}
              />
              Refresh
            </Button>
            <Button onClick={handleSave} disabled={isSaving || isLoading}>
              {isSaving && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <IconLoader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>AI Provider</CardTitle>
                <CardDescription>
                  Choose which API the chatbot uses for completions. Help KB embeddings
                  still use Gemini separately when seeding the knowledge base.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Provider</Label>
                  <Select
                    value={form.ai_provider}
                    onValueChange={(value) => handleProviderChange(value as AIProvider)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROVIDER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {activeProvider && (
                    <p className="text-xs text-muted-foreground">{activeProvider.hint}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>API Credentials</CardTitle>
                <CardDescription>
                  DB values take priority over <code className="text-xs">AI_API_KEY</code>
                  , <code className="text-xs">GEMINI_API_KEY</code>, and{' '}
                  <code className="text-xs">OPENAI_API_KEY</code>.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Current key:</span>
                  {apiKeySet ? (
                    <Badge variant="secondary" className="font-mono text-xs">
                      {maskedApiKey || '••••••••'}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      Not set in DB — using env var
                    </Badge>
                  )}
                  {apiKeySet && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={handleClearApiKey}
                      disabled={isSaving}
                    >
                      Clear
                    </Button>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ai_api_key">
                    {apiKeySet ? 'Replace with a new key' : 'Set API key'}
                  </Label>
                  <div className="relative">
                    <Input
                      id="ai_api_key"
                      type={showApiKey ? 'text' : 'password'}
                      placeholder={form.ai_provider === 'google' ? 'AIzaSy…' : 'sk-…'}
                      value={form.ai_api_key}
                      onChange={(e) => set('ai_api_key', e.target.value)}
                      autoComplete="off"
                      className="pr-10 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((v) => !v)}
                      className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
                      aria-label={showApiKey ? 'Hide key' : 'Show key'}
                    >
                      {showApiKey ? (
                        <IconEyeOff className="h-4 w-4" />
                      ) : (
                        <IconEye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Leave blank to keep the current key unchanged.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ai_base_url">Base URL</Label>
                  <Input
                    id="ai_base_url"
                    placeholder={DEFAULT_BASE_URLS[form.ai_provider]}
                    value={form.ai_base_url}
                    onChange={(e) => set('ai_base_url', e.target.value)}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    {form.ai_provider === 'openai'
                      ? 'Use your OpenAI-compatible endpoint, e.g. https://api.openai.com/v1 or a local proxy.'
                      : 'Usually leave the default Google Generative Language API URL.'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Chat Model</CardTitle>
                <CardDescription>
                  Fetch available models from the provider after entering credentials,
                  then choose the model used for chat responses.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label>Available models</Label>
                    <Select
                      value={form.ai_model}
                      onValueChange={(value) => set('ai_model', value)}
                      disabled={availableModels.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            availableModels.length > 0
                              ? 'Select a model'
                              : 'Fetch models first'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {availableModels.map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            {model.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fetchModels()}
                    disabled={isFetchingModels || (!apiKeySet && !form.ai_api_key.trim())}
                  >
                    {isFetchingModels ? (
                      <IconLoader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Fetch models'
                    )}
                  </Button>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ai_model_custom">Or enter model ID manually</Label>
                  <Input
                    id="ai_model_custom"
                    placeholder={DEFAULT_MODELS[form.ai_provider]}
                    value={form.ai_model}
                    onChange={(e) => set('ai_model', e.target.value)}
                    className="font-mono"
                  />
                </div>

                <p className="text-xs text-muted-foreground">
                  Active:{' '}
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">
                    {form.ai_model || DEFAULT_MODELS[form.ai_provider]}
                  </code>
                </p>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Chatbot Display</CardTitle>
                <CardDescription>
                  Customise what users see in the chat widget header.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="chat_title">Chatbot subtitle / powered-by label</Label>
                  <Input
                    id="chat_title"
                    placeholder={previewTitle}
                    value={form.chat_title}
                    onChange={(e) => set('chat_title', e.target.value)}
                    maxLength={80}
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Shown below &ldquo;iTrade AI&rdquo; in the chat widget header. Leave
                      blank to auto-generate from provider and model.
                    </span>
                    <span>{form.chat_title.length}/80</span>
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/30 p-4">
                  <p className="text-xs text-muted-foreground mb-2">Preview</p>
                  <div className="flex items-center gap-3 rounded-lg bg-primary px-3 py-2 w-fit">
                    <div className="w-7 h-7 rounded-full bg-primary-foreground/20 flex items-center justify-center">
                      <svg
                        className="w-4 h-4 text-primary-foreground"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 3l14 9-14 9V3z"
                        />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-primary-foreground leading-none">
                        iTrade AI
                      </p>
                      <p className="text-[11px] text-primary-foreground/70 mt-0.5">
                        {previewTitle}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </SidebarInset>
  );
}
