'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  Eye,
  EyeOff,
  Loader2,
  ChevronDown,
  ChevronRight,
  BookOpen,
  Shield,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

import { authClient } from '@/lib/auth-client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(value: Date | string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
    new Date(value),
  );
}

// ---------------------------------------------------------------------------
// Permission groups — mirrors `defaultPermissions` in auth.ts
// ---------------------------------------------------------------------------

type PermissionGroup = {
  key: string;
  resources: string[];
  badgeColor: string;
};

const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: 'read',
    resources: ['portfolio', 'orders', 'strategies', 'backtests', 'tickers', 'analytics'],
    badgeColor:
      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  {
    key: 'write',
    resources: ['orders', 'strategies', 'backtests'],
    badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  {
    key: 'settings',
    resources: ['profile', 'preferences'],
    badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
];

function makeDefaultPermissions(): Record<string, string[]> {
  return Object.fromEntries(PERMISSION_GROUPS.map((g) => [g.key, [...g.resources]]));
}

// ---------------------------------------------------------------------------
// API catalogue — grouped by access category
// ---------------------------------------------------------------------------

type ApiEntry = { method: string; path: string; description: string };
type ApiGroup = {
  label: string;
  color: 'default' | 'secondary' | 'outline';
  entries: ApiEntry[];
};

const API_CATALOGUE: ApiGroup[] = [
  {
    label: 'Read',
    color: 'secondary',
    entries: [
      {
        method: 'GET',
        path: '/api/portfolio/assets',
        description: 'List portfolio assets',
      },
      {
        method: 'GET',
        path: '/api/portfolio/positions',
        description: 'List open positions',
      },
      { method: 'GET', path: '/api/orders', description: 'List orders' },
      { method: 'GET', path: '/api/orders/:id', description: 'Get a single order' },
      { method: 'GET', path: '/api/strategies', description: 'List strategies' },
      { method: 'GET', path: '/api/strategies/:id', description: 'Get a strategy' },
      {
        method: 'GET',
        path: '/api/strategies/config',
        description: 'Get strategy configuration',
      },
      { method: 'GET', path: '/api/backtest', description: 'List backtests' },
      { method: 'GET', path: '/api/backtest/:id', description: 'Get a backtest run' },
      {
        method: 'GET',
        path: '/api/backtest/results',
        description: 'Get backtest results',
      },
      { method: 'GET', path: '/api/tickers', description: 'List tickers / market data' },
      {
        method: 'GET',
        path: '/api/trading-pairs',
        description: 'List available trading pairs',
      },
      { method: 'GET', path: '/api/analytics', description: 'Portfolio analytics' },
      {
        method: 'GET',
        path: '/api/accounts',
        description: 'List connected exchange accounts',
      },
    ],
  },
  {
    label: 'Write',
    color: 'default',
    entries: [
      { method: 'POST', path: '/api/orders', description: 'Create an order' },
      { method: 'DELETE', path: '/api/orders/:id', description: 'Cancel an order' },
      { method: 'POST', path: '/api/strategies', description: 'Create a strategy' },
      { method: 'PUT', path: '/api/strategies/:id', description: 'Update a strategy' },
      { method: 'DELETE', path: '/api/strategies/:id', description: 'Delete a strategy' },
      { method: 'POST', path: '/api/backtest', description: 'Start a backtest run' },
      { method: 'DELETE', path: '/api/backtest/:id', description: 'Delete a backtest' },
      { method: 'POST', path: '/api/dry-run', description: 'Execute a dry-run trade' },
    ],
  },
  {
    label: 'Settings',
    color: 'outline',
    entries: [
      { method: 'GET', path: '/api/settings/profile', description: 'Get user profile' },
      {
        method: 'PUT',
        path: '/api/settings/profile',
        description: 'Update user profile',
      },
      {
        method: 'GET',
        path: '/api/settings/email-preferences',
        description: 'Get email preferences',
      },
      {
        method: 'PUT',
        path: '/api/settings/email-preferences',
        description: 'Update email preferences',
      },
      {
        method: 'POST',
        path: '/api/settings/change-password',
        description: 'Change password',
      },
      { method: 'GET', path: '/api/config', description: 'Get app configuration' },
    ],
  },
];

const METHOD_COLORS: Record<string, string> = {
  GET: 'text-emerald-600 dark:text-emerald-400',
  POST: 'text-blue-600 dark:text-blue-400',
  PUT: 'text-amber-600 dark:text-amber-400',
  DELETE: 'text-red-600 dark:text-red-400',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApiTokenMetadata {
  allowedIps?: string[];
  [key: string]: unknown;
}

interface ApiToken {
  id: string;
  name: string | null;
  start: string | null;
  prefix: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  expiresAt: Date | string | null;
  enabled: boolean;
  lastRequest: Date | string | null;
  metadata: ApiTokenMetadata | null;
  permissions: Record<string, string[]> | null;
}

/** Parse a multiline / comma-separated IP input into a clean string array. */
function parseIpInput(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={handleCopy}>
      {copied ? (
        <Check className="size-3.5 text-green-500" />
      ) : (
        <Copy className="size-3.5" />
      )}
    </Button>
  );
}

function RevokeDialog({
  token,
  onRevoke,
}: {
  token: ApiToken;
  onRevoke: (id: string) => void;
}) {
  const t = useTranslations('settings.apiTokens');
  const [open, setOpen] = useState(false);

  const handleConfirm = () => {
    onRevoke(token.id);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 text-destructive hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('revokeDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('revokeDialog.description', { name: token.name ?? t('unnamedToken') })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t('revokeDialog.cancel')}
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            {t('revokeDialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TokenRow({
  token,
  onRevoke,
}: {
  token: ApiToken;
  onRevoke: (id: string) => void;
}) {
  const t = useTranslations('settings.apiTokens');

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">
            {token.name ?? t('unnamedToken')}
          </span>
          {!token.enabled && (
            <Badge variant="destructive" className="text-xs">
              {t('disabled')}
            </Badge>
          )}
          {token.expiresAt && new Date(token.expiresAt) < new Date() && (
            <Badge variant="destructive" className="text-xs">
              {t('expired')}
            </Badge>
          )}
        </div>

        {/* Permissions badges */}
        {token.permissions && Object.keys(token.permissions).length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {PERMISSION_GROUPS.map((group) => {
              const granted = token.permissions?.[group.key];
              if (!granted || granted.length === 0) return null;
              return (
                <span
                  key={group.key}
                  className={`inline-flex items-center gap-1 text-xs font-medium rounded px-1.5 py-0.5 ${group.badgeColor}`}
                >
                  {t(`permissions.groups.${group.key}`)}
                  <span className="opacity-60">({granted.length})</span>
                </span>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="font-mono">{token.start ?? '—'}...</span>
          <span>{t('createdAt', { date: fmtDate(token.createdAt) })}</span>
          {token.expiresAt && (
            <span>{t('expiresAt', { date: fmtDate(token.expiresAt) })}</span>
          )}
          {token.lastRequest && (
            <span>{t('lastUsed', { date: fmtDate(token.lastRequest) })}</span>
          )}
        </div>

        {token.metadata?.allowedIps && token.metadata.allowedIps.length > 0 && (
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            <Shield className="size-3 text-muted-foreground shrink-0" />
            {token.metadata.allowedIps.map((ip) => (
              <span key={ip} className="font-mono text-xs bg-muted rounded px-1.5 py-0.5">
                {ip}
              </span>
            ))}
          </div>
        )}
      </div>
      <RevokeDialog token={token} onRevoke={onRevoke} />
    </div>
  );
}

function NewTokenSecret({ secret, onDone }: { secret: string; onDone: () => void }) {
  const t = useTranslations('settings.apiTokens');
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-4">
      <Alert>
        <AlertDescription className="text-sm font-medium">
          {t('newToken.warning')}
        </AlertDescription>
      </Alert>
      <div className="space-y-2">
        <Label>{t('newToken.tokenLabel')}</Label>
        <div className="flex items-center gap-2">
          <Input
            readOnly
            value={visible ? secret : '•'.repeat(Math.min(secret.length, 40))}
            className="font-mono text-xs"
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-9 shrink-0"
            onClick={() => setVisible((v) => !v)}
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </Button>
          <CopyButton value={secret} />
        </div>
      </div>
      <Button onClick={onDone} className="w-full">
        {t('newToken.done')}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Permission selector sub-component
// ---------------------------------------------------------------------------

function PermissionSelector({
  value,
  onChange,
}: {
  value: Record<string, string[]>;
  onChange: (v: Record<string, string[]>) => void;
}) {
  const t = useTranslations('settings.apiTokens');

  const toggle = (groupKey: string, resource: string, checked: boolean) => {
    const current = value[groupKey] ?? [];
    const next = checked
      ? [...new Set([...current, resource])]
      : current.filter((r) => r !== resource);
    onChange({ ...value, [groupKey]: next });
  };

  const toggleAll = (group: PermissionGroup, checked: boolean) => {
    onChange({ ...value, [group.key]: checked ? [...group.resources] : [] });
  };

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <Lock className="size-3.5" />
        {t('createDialog.permissionsLabel')}
      </Label>
      <p className="text-xs text-muted-foreground">{t('createDialog.permissionsHint')}</p>
      <div className="rounded-md border divide-y">
        {PERMISSION_GROUPS.map((group) => {
          const selected = value[group.key] ?? [];
          const allSelected = selected.length === group.resources.length;
          const someSelected = selected.length > 0 && !allSelected;

          return (
            <div key={group.key} className="px-3 py-2.5 space-y-2">
              {/* Group header with select-all */}
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`perm-group-${group.key}`}
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  onCheckedChange={(checked) => toggleAll(group, !!checked)}
                />
                <label
                  htmlFor={`perm-group-${group.key}`}
                  className={`text-xs font-semibold rounded px-1.5 py-0.5 cursor-pointer ${group.badgeColor}`}
                >
                  {t(`permissions.groups.${group.key}`)}
                </label>
                <span className="ml-auto text-xs text-muted-foreground">
                  {selected.length}/{group.resources.length}
                </span>
              </div>
              {/* Individual resource checkboxes */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pl-6">
                {group.resources.map((resource) => (
                  <div key={resource} className="flex items-center gap-1.5">
                    <Checkbox
                      id={`perm-${group.key}-${resource}`}
                      checked={selected.includes(resource)}
                      onCheckedChange={(checked) =>
                        toggle(group.key, resource, !!checked)
                      }
                    />
                    <label
                      htmlFor={`perm-${group.key}-${resource}`}
                      className="text-xs text-muted-foreground cursor-pointer select-none"
                    >
                      {resource}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// API catalogue sub-component
// ---------------------------------------------------------------------------

function ApiCatalogue() {
  const t = useTranslations('settings.apiTokens');
  const [open, setOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>('Read');

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <BookOpen className="size-4" />
          {t('catalogue.toggle')}
          {open ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-4 space-y-3">
        {API_CATALOGUE.map((group) => (
          <Collapsible
            key={group.label}
            open={openGroup === group.label}
            onOpenChange={(v) => setOpenGroup(v ? group.label : null)}
          >
            <CollapsibleTrigger asChild>
              <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted transition-colors">
                <Badge variant={group.color} className="text-xs min-w-16 justify-center">
                  {t(`catalogue.groups.${group.label.toLowerCase()}`)}
                </Badge>
                <span className="text-muted-foreground text-xs">
                  {group.entries.length} {t('catalogue.endpoints')}
                </span>
                <span className="ml-auto">
                  {openGroup === group.label ? (
                    <ChevronDown className="size-3.5" />
                  ) : (
                    <ChevronRight className="size-3.5" />
                  )}
                </span>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-1 rounded-md border divide-y">
                {group.entries.map((e) => (
                  <div
                    key={e.method + e.path}
                    className="flex items-center gap-3 px-3 py-2 text-xs"
                  >
                    <span
                      className={`font-mono font-semibold w-14 shrink-0 ${METHOD_COLORS[e.method] ?? ''}`}
                    >
                      {e.method}
                    </span>
                    <span className="font-mono text-muted-foreground truncate flex-1">
                      {e.path}
                    </span>
                    <span className="text-muted-foreground hidden sm:block shrink-0">
                      {e.description}
                    </span>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ApiTokensSettings() {
  const t = useTranslations('settings.apiTokens');

  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Create-dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tokenName, setTokenName] = useState('');
  const [ipInput, setIpInput] = useState('');
  const [selectedPermissions, setSelectedPermissions] =
    useState<Record<string, string[]>>(makeDefaultPermissions);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const fetchTokens = useCallback(async () => {
    try {
      const res = await authClient.apiKey.list();
      if (res.data) {
        setTokens(res.data as ApiToken[]);
      }
    } catch {
      toast.error(t('errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  const handleCreate = async () => {
    if (!tokenName.trim()) return;
    setCreating(true);
    try {
      const allowedIps = parseIpInput(ipInput);
      // Use the custom server route so we can set `permissions` —
      // better-auth blocks that field on the client-side endpoint.
      const res = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tokenName.trim(),
          permissions: selectedPermissions,
          metadata: allowedIps.length > 0 ? { allowedIps } : undefined,
        }),
      });
      const data = (await res.json()) as { key?: string; error?: string };
      if (res.ok && data.key) {
        setNewSecret(data.key);
        await fetchTokens();
      } else {
        toast.error(data.error ?? t('errors.createFailed'));
      }
    } catch {
      toast.error(t('errors.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await authClient.apiKey.delete({ keyId: id });
      setTokens((prev) => prev.filter((tk) => tk.id !== id));
      toast.success(t('messages.revoked'));
    } catch {
      toast.error(t('errors.revokeFailed'));
    }
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setTokenName('');
      setIpInput('');
      setNewSecret(null);
      setSelectedPermissions(makeDefaultPermissions());
    }
    setDialogOpen(open);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Key className="size-5" />
              {t('title')}
            </CardTitle>
            <CardDescription className="mt-1">{t('description')}</CardDescription>
          </div>

          <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2 shrink-0">
                <Plus className="size-4" />
                {t('createButton')}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t('createDialog.title')}</DialogTitle>
                <DialogDescription>{t('createDialog.description')}</DialogDescription>
              </DialogHeader>

              {newSecret ? (
                <NewTokenSecret
                  secret={newSecret}
                  onDone={() => handleDialogClose(false)}
                />
              ) : (
                <>
                  <div className="space-y-5 py-2">
                    {/* Token name */}
                    <div className="space-y-2">
                      <Label htmlFor="token-name">{t('createDialog.nameLabel')}</Label>
                      <Input
                        id="token-name"
                        placeholder={t('createDialog.namePlaceholder')}
                        value={tokenName}
                        onChange={(e) => setTokenName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && tokenName.trim() && !creating) {
                            handleCreate();
                          }
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t('createDialog.nameHint')}
                      </p>
                    </div>

                    {/* Permission selector */}
                    <PermissionSelector
                      value={selectedPermissions}
                      onChange={setSelectedPermissions}
                    />

                    {/* IP whitelist */}
                    <div className="space-y-2">
                      <Label htmlFor="token-ips" className="flex items-center gap-1.5">
                        <Shield className="size-3.5" />
                        {t('createDialog.ipLabel')}
                        <span className="text-muted-foreground font-normal">
                          ({t('createDialog.ipOptional')})
                        </span>
                      </Label>
                      <Textarea
                        id="token-ips"
                        placeholder={t('createDialog.ipPlaceholder')}
                        value={ipInput}
                        onChange={(e) => setIpInput(e.target.value)}
                        rows={3}
                        className="font-mono text-xs resize-none"
                      />
                      <p className="text-xs text-muted-foreground">
                        {t('createDialog.ipHint')}
                      </p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => handleDialogClose(false)}>
                      {t('createDialog.cancel')}
                    </Button>
                    <Button
                      onClick={handleCreate}
                      disabled={!tokenName.trim() || creating}
                    >
                      {creating ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          {t('createDialog.creating')}
                        </>
                      ) : (
                        t('createDialog.confirm')
                      )}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Usage info */}
        <Alert>
          <AlertDescription className="text-sm space-y-1">
            <p>{t('usageHint')}</p>
            <code className="block mt-1 text-xs bg-muted rounded px-2 py-1 font-mono">
              Authorization: Bearer itrade_&lt;your-token&gt;
            </code>
          </AlertDescription>
        </Alert>

        {/* Token list */}
        <div>
          <p className="text-sm font-medium mb-1">{t('listTitle')}</p>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="size-5 animate-spin mr-2" />
              {t('loading')}
            </div>
          ) : tokens.length === 0 ? (
            <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
              {t('empty')}
            </div>
          ) : (
            <div className="rounded-md border divide-y">
              {tokens.map((token) => (
                <div key={token.id} className="px-3">
                  <TokenRow token={token} onRevoke={handleRevoke} />
                </div>
              ))}
            </div>
          )}
        </div>

        <Separator />

        {/* API catalogue */}
        <div className="space-y-2">
          <p className="text-sm font-medium">{t('catalogue.title')}</p>
          <p className="text-xs text-muted-foreground">{t('catalogue.description')}</p>
          <ApiCatalogue />
        </div>
      </CardContent>
    </Card>
  );
}
