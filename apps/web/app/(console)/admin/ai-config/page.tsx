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

// ── Types ─────────────────────────────────────────────────────────────────────

type AiConfigForm = {
  gemini_api_key: string;
  gemini_model: string;
  chat_title: string;
};

type AiConfigResponse = {
  gemini_api_key: string; // masked value shown for display
  gemini_api_key_set: boolean; // whether a key is stored in DB
  gemini_model: string;
  chat_title: string;
};

// ── Known Gemini models (user can still type a custom value) ──────────────────

const KNOWN_GEMINI_MODELS = [
  { value: 'gemini-3.1-flash-lite', label: 'gemini-3.1-flash-lite (default)' },
  { value: 'gemini-3.1-flash', label: 'gemini-3.1-flash' },
  { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
  { value: 'gemini-2.5-pro', label: 'gemini-2.5-pro' },
  { value: 'gemini-2.0-flash', label: 'gemini-2.0-flash' },
  { value: '__custom__', label: 'Custom model name…' },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminAiConfigPage() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeySet, setApiKeySet] = useState(false);
  const [maskedApiKey, setMaskedApiKey] = useState('');
  const [modelSelectValue, setModelSelectValue] = useState('gemini-3.1-flash-lite');
  const [form, setForm] = useState<AiConfigForm>({
    gemini_api_key: '',
    gemini_model: '',
    chat_title: '',
  });

  // ── Auth guard ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (sessionPending) return;
    if (!session || (session.user as { role?: string }).role !== 'admin') {
      router.push('/dashboard');
    }
  }, [session, sessionPending, router]);

  // ── Load current settings ───────────────────────────────────────────────────

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/ai-config');
      if (!res.ok) throw new Error('Failed to load settings');
      const data = (await res.json()) as AiConfigResponse;

      setApiKeySet(data.gemini_api_key_set);
      setMaskedApiKey(data.gemini_api_key);

      // Determine whether the stored model matches a known preset
      const knownValues = KNOWN_GEMINI_MODELS.map((m) => m.value).filter(
        (v) => v !== '__custom__',
      );
      const storedModel = data.gemini_model;
      const isKnown = storedModel === '' || knownValues.includes(storedModel);

      setModelSelectValue(
        storedModel === ''
          ? 'gemini-3.1-flash-lite'
          : isKnown
            ? storedModel
            : '__custom__',
      );

      setForm({
        gemini_api_key: '', // never pre-fill — user must re-enter to change
        gemini_model: storedModel,
        chat_title: data.chat_title,
      });
    } catch {
      toast.error('Failed to load AI configuration.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (
      !sessionPending &&
      session &&
      (session.user as { role?: string }).role === 'admin'
    ) {
      loadSettings();
    }
  }, [session, sessionPending, loadSettings]);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const set = (field: keyof AiConfigForm, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleModelSelectChange = (value: string) => {
    setModelSelectValue(value);
    if (value !== '__custom__') {
      set('gemini_model', value === 'gemini-3.1-flash-lite' ? '' : value);
    }
    // For __custom__ we leave gemini_model as-is so the text input is editable
  };

  // ── Save ────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const body: Partial<AiConfigForm> = {};

      // Only include API key if the user typed something new
      if (form.gemini_api_key.trim()) {
        body.gemini_api_key = form.gemini_api_key.trim();
      }

      // Model: empty string clears DB value → falls back to default
      body.gemini_model = form.gemini_model.trim();

      // Chat title
      body.chat_title = form.chat_title.trim();

      const res = await fetch('/api/admin/ai-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Save failed');

      toast.success('AI configuration saved. Changes take effect within 30 seconds.');
      // Refresh the displayed masked key / status
      await loadSettings();
    } catch {
      toast.error('Failed to save AI configuration.');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Clear a single field ────────────────────────────────────────────────────

  const handleClearApiKey = async () => {
    if (
      !window.confirm(
        'Remove the stored Gemini API key? The server will fall back to the GEMINI_API_KEY environment variable.',
      )
    )
      return;
    setIsSaving(true);
    try {
      await fetch('/api/admin/ai-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gemini_api_key: '' }),
      });
      toast.success('Gemini API key cleared.');
      await loadSettings();
    } catch {
      toast.error('Failed to clear API key.');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Loading / auth states ───────────────────────────────────────────────────

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

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <SidebarInset>
      <SiteHeader title="Admin - AI Config" />
      <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">AI Configuration</h2>
            <p className="text-muted-foreground text-sm">
              Update Gemini credentials and chatbot display settings at runtime — no
              restart required. Changes take effect within 30 seconds.
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
            {/* ── Gemini API Key ──────────────────────────────────────────── */}
            <Card>
              <CardHeader>
                <CardTitle>Gemini API Key</CardTitle>
                <CardDescription>
                  The key used to authenticate with Google Gemini. DB value takes priority
                  over the <code className="text-xs">GEMINI_API_KEY</code> environment
                  variable.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Current key status */}
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

                {/* New key input */}
                <div className="space-y-1.5">
                  <Label htmlFor="gemini_api_key">
                    {apiKeySet ? 'Replace with a new key' : 'Set API key'}
                  </Label>
                  <div className="relative">
                    <Input
                      id="gemini_api_key"
                      type={showApiKey ? 'text' : 'password'}
                      placeholder={apiKeySet ? 'Enter new key to replace…' : 'AIzaSy…'}
                      value={form.gemini_api_key}
                      onChange={(e) => set('gemini_api_key', e.target.value)}
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
              </CardContent>
            </Card>

            {/* ── Gemini Model ────────────────────────────────────────────── */}
            <Card>
              <CardHeader>
                <CardTitle>Gemini Model</CardTitle>
                <CardDescription>
                  The model used for all chatbot responses. DB value takes priority over
                  the <code className="text-xs">GEMINI_MODEL</code> env var. Defaults to{' '}
                  <code className="text-xs">gemini-3.1-flash-lite</code>.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Model preset</Label>
                  <Select
                    value={modelSelectValue}
                    onValueChange={handleModelSelectChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {KNOWN_GEMINI_MODELS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Custom model text input — shown when preset is __custom__ */}
                {modelSelectValue === '__custom__' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="gemini_model_custom">Custom model name</Label>
                    <Input
                      id="gemini_model_custom"
                      placeholder="e.g. gemini-3.1-pro-exp"
                      value={form.gemini_model}
                      onChange={(e) => set('gemini_model', e.target.value)}
                      className="font-mono"
                    />
                  </div>
                )}

                {/* Active model display */}
                <p className="text-xs text-muted-foreground">
                  Active:{' '}
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">
                    {form.gemini_model || 'gemini-3.1-flash-lite'}
                  </code>{' '}
                  {!form.gemini_model && (
                    <span className="text-muted-foreground">(default)</span>
                  )}
                </p>

                <p className="text-xs text-muted-foreground">
                  Leave blank to revert to the default model.
                </p>
              </CardContent>
            </Card>

            {/* ── Chat Widget Title ───────────────────────────────────────── */}
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
                    placeholder="Powered by Gemini 3.1 Flash Lite"
                    value={form.chat_title}
                    onChange={(e) => set('chat_title', e.target.value)}
                    maxLength={80}
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Shown below &ldquo;iTrade AI&rdquo; in the chat widget header. Leave
                      blank to use the default.
                    </span>
                    <span>{form.chat_title.length}/80</span>
                  </div>
                </div>

                {/* Live preview */}
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
                        {form.chat_title || 'Powered by Gemini 3.1 Flash Lite'}
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
