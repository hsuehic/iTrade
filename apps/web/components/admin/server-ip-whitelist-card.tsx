'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, Shield, Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { isValidIp } from '@/lib/itrade-server-ip';

/**
 * Admin Settings → Server IP Whitelist card.
 *
 * Manages the `server_ip_whitelist` app setting — the egress IPs users must
 * add to their exchange API key IP restrictions. Supports adding, editing,
 * and removing individual IPs; the full list is persisted via
 * PUT /api/admin/settings/ip-whitelist (admin-only).
 */
export function ServerIpWhitelistCard() {
  const [ips, setIps] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Add-row state
  const [newIp, setNewIp] = useState('');

  // Inline edit state — the IP currently being edited (null = none)
  const [editingIp, setEditingIp] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const fetchIps = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/settings/ip-whitelist');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { ips?: string[] };
      setIps(Array.isArray(data.ips) ? data.ips : []);
    } catch {
      toast.error('Failed to load server IP whitelist.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIps();
  }, [fetchIps]);

  const persist = useCallback(async (nextIps: string[], successMessage: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings/ip-whitelist', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ips: nextIps }),
      });
      const data = (await res.json()) as { ips?: string[]; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to save IP whitelist.');
        return;
      }
      setIps(data.ips ?? nextIps);
      toast.success(successMessage);
    } catch {
      toast.error('Failed to save IP whitelist.');
    } finally {
      setSaving(false);
    }
  }, []);

  const handleAdd = () => {
    const ip = newIp.trim();
    if (!ip) return;
    if (!isValidIp(ip)) {
      toast.error('Enter a valid IPv4 address (e.g. 34.143.244.107).');
      return;
    }
    if (ips.includes(ip)) {
      toast.error('This IP is already in the whitelist.');
      return;
    }
    setNewIp('');
    void persist([...ips, ip], 'IP added.');
  };

  const handleDelete = (ip: string) => {
    void persist(
      ips.filter((v) => v !== ip),
      'IP removed.',
    );
  };

  const handleEditStart = (ip: string) => {
    setEditingIp(ip);
    setEditValue(ip);
  };

  const handleEditCancel = () => {
    setEditingIp(null);
    setEditValue('');
  };

  const handleEditSave = () => {
    if (editingIp === null) return;
    const ip = editValue.trim();
    if (!isValidIp(ip)) {
      toast.error('Enter a valid IPv4 address (e.g. 34.143.244.107).');
      return;
    }
    if (ip !== editingIp && ips.includes(ip)) {
      toast.error('This IP is already in the whitelist.');
      return;
    }
    setEditingIp(null);
    setEditValue('');
    if (ip === editingIp) return; // unchanged
    void persist(
      ips.map((v) => (v === editingIp ? ip : v)),
      'IP updated.',
    );
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="size-5" />
          Server IP Whitelist
        </CardTitle>
        <CardDescription>
          The egress IPs users must add to their exchange API key IP restrictions. Shown
          on the Accounts page and the exchange onboarding wizard.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            {/* Current list */}
            <div className="rounded-md border divide-y">
              {ips.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No IPs configured.
                </div>
              ) : (
                ips.map((ip) => (
                  <div key={ip} className="flex items-center gap-2 px-3 py-2">
                    {editingIp === ip ? (
                      <>
                        <Input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleEditSave();
                            if (e.key === 'Escape') handleEditCancel();
                          }}
                          className="font-mono text-sm"
                          aria-label={`Edit ${ip}`}
                          autoFocus
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 shrink-0"
                          onClick={handleEditSave}
                          disabled={saving}
                          aria-label="Save IP"
                        >
                          <Check className="size-4 text-green-600" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 shrink-0"
                          onClick={handleEditCancel}
                          aria-label="Cancel edit"
                        >
                          <X className="size-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 font-mono text-sm">{ip}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 shrink-0"
                          onClick={() => handleEditStart(ip)}
                          disabled={saving}
                          aria-label={`Edit ${ip}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 shrink-0 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(ip)}
                          disabled={saving || ips.length <= 1}
                          aria-label={`Remove ${ip}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Add form */}
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="new-server-ip">Add IP address</Label>
                <Input
                  id="new-server-ip"
                  placeholder="e.g. 203.0.113.10"
                  value={newIp}
                  onChange={(e) => setNewIp(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAdd();
                  }}
                  className="font-mono text-sm"
                  disabled={saving}
                />
              </div>
              <Button
                onClick={handleAdd}
                disabled={saving || !newIp.trim()}
                className="gap-2"
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Add
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
