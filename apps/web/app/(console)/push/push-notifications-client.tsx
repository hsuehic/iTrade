'use client';

import * as React from 'react';
import { toast } from 'sonner';

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

type PushDevice = {
  id: string;
  userId: string | null;
  deviceId: string;
  platform: string;
  provider: string;
  appId: string;
  appVersion: string | null;
  environment: string | null;
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type PushLog = {
  id: string;
  createdAt: string | null;
  senderUserId: string | null;
  platform: string;
  provider: string;
  environment: string | null;
  category?: string;
  targetType: string;
  successCount: number;
  failureCount: number;
};

export function PushNotificationsClient() {
  const [sendPlatform, setSendPlatform] = React.useState('web');
  const [sendProvider, setSendProvider] = React.useState('fcm');
  const [listPlatform, setListPlatform] = React.useState('all');
  const [listProvider, setListProvider] = React.useState('all');

  const [devices, setDevices] = React.useState<PushDevice[]>([]);
  const [logs, setLogs] = React.useState<PushLog[]>([]);
  const [loading, setLoading] = React.useState(false);

  const [targetType, setTargetType] = React.useState<
    'user' | 'topic' | 'tokens' | 'all' | 'filter'
  >('user');
  const [targetUserId, setTargetUserId] = React.useState('');
  const [userSearchQuery, setUserSearchQuery] = React.useState('');
  const [userSuggestions, setUserSuggestions] = React.useState<
    Array<{ id: string; email: string; name: string }>
  >([]);
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const [targetTopic, setTargetTopic] = React.useState('');
  const [targetTokens, setTargetTokens] = React.useState('');
  const [targetAllLimit, setTargetAllLimit] = React.useState('200');
  const [filterUserId, setFilterUserId] = React.useState('');
  const [filterDeviceId, setFilterDeviceId] = React.useState('');
  const [filterAppId, setFilterAppId] = React.useState('');
  const [filterAppVersion, setFilterAppVersion] = React.useState('');
  const [filterEnvironment, setFilterEnvironment] = React.useState('');
  const [filterIsActive, setFilterIsActive] = React.useState('true');
  const [filterLimit, setFilterLimit] = React.useState('200');

  const [category, setCategory] = React.useState('general');
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [dataJson, setDataJson] = React.useState('{\n  \n}');
  const categoryTopic = React.useMemo(() => `push_${category}`, [category]);

  React.useEffect(() => {
    // Helpful default: when targeting topic, auto-fill the category topic if empty or already a category topic.
    if (targetType !== 'topic') return;
    if (!targetTopic || targetTopic.startsWith('push_')) {
      setTargetTopic(categoryTopic);
    }
  }, [categoryTopic, targetType, targetTopic]);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const devicesParams = new URLSearchParams({ limit: '50' });
      if (listPlatform !== 'all') devicesParams.set('platform', listPlatform);
      if (listProvider !== 'all') devicesParams.set('provider', listProvider);

      const logsParams = new URLSearchParams({ limit: '50' });
      if (listPlatform !== 'all') logsParams.set('platform', listPlatform);
      if (listProvider !== 'all') logsParams.set('provider', listProvider);

      const [devicesRes, logsRes] = await Promise.all([
        fetch(`/api/push/devices?${devicesParams.toString()}`, {
          cache: 'no-store',
        }),
        fetch(`/api/push/logs?${logsParams.toString()}`, {
          cache: 'no-store',
        }),
      ]);

      if (!devicesRes.ok) {
        let errorMessage = `Failed to load devices (${devicesRes.status})`;
        try {
          const errorJson = await devicesRes.json();
          errorMessage = errorJson.error || errorMessage;
        } catch {
          // Response might not be JSON
        }
        throw new Error(errorMessage);
      }
      if (!logsRes.ok) {
        let errorMessage = `Failed to load logs (${logsRes.status})`;
        try {
          const errorJson = await logsRes.json();
          errorMessage = errorJson.error || errorMessage;
        } catch {
          // Response might not be JSON
        }
        throw new Error(errorMessage);
      }

      const devicesJson = await devicesRes.json();
      const logsJson = await logsRes.json();

      // Safely set state with fallbacks
      setDevices(Array.isArray(devicesJson.devices) ? devicesJson.devices : []);
      setLogs(Array.isArray(logsJson.logs) ? logsJson.logs : []);
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : 'An unexpected error occurred';
      toast.error(errorMessage);
      console.error('Error refreshing push notifications:', e);
      // Set empty arrays on error to prevent UI issues
      setDevices([]);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [listPlatform, listProvider]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  // User search with debouncing
  React.useEffect(() => {
    const searchUsers = async () => {
      const query = userSearchQuery.trim();
      if (query.length < 2) {
        setUserSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
          cache: 'no-store',
        });
        if (res.ok) {
          const data = await res.json();
          setUserSuggestions(data.users ?? []);
          setShowSuggestions(true);
        }
      } catch (error) {
        console.error('Error searching users:', error);
      }
    };

    const timeoutId = setTimeout(searchUsers, 300); // Debounce 300ms
    return () => clearTimeout(timeoutId);
  }, [userSearchQuery]);

  const handleUserSelect = (user: { id: string; email: string; name: string }) => {
    setTargetUserId(user.id);
    setUserSearchQuery(user.email);
    setShowSuggestions(false);
  };

  async function onSend() {
    let data: Record<string, unknown> | undefined;
    try {
      const parsed = JSON.parse(dataJson || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        data =
          Object.keys(parsed).length > 0
            ? (parsed as Record<string, unknown>)
            : undefined;
      } else {
        throw new Error('Payload must be a JSON object');
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Invalid JSON in data payload',
      );
      return;
    }

    const target =
      targetType === 'user'
        ? {
            type: 'user' as const,
            userId: targetUserId.trim() || userSearchQuery.trim(),
          }
        : targetType === 'topic'
          ? { type: 'topic' as const, topic: targetTopic.trim() }
          : targetType === 'tokens'
            ? {
                type: 'tokens' as const,
                tokens: targetTokens
                  .split(/[\n,]/g)
                  .map((t) => t.trim())
                  .filter(Boolean),
              }
            : targetType === 'all'
              ? {
                  type: 'all' as const,
                  platform: sendPlatform,
                  provider: sendProvider,
                  limit: Number.parseInt(targetAllLimit, 10) || 200,
                }
              : {
                  type: 'filter' as const,
                  filters: {
                    platform: sendPlatform,
                    provider: sendProvider,
                    userId: filterUserId.trim() || undefined,
                    deviceId: filterDeviceId.trim() || undefined,
                    appId: filterAppId.trim() || undefined,
                    appVersion: filterAppVersion.trim() || undefined,
                    environment: filterEnvironment.trim()
                      ? filterEnvironment.trim()
                      : undefined,
                    isActive: filterIsActive === 'true',
                    limit: Number.parseInt(filterLimit, 10) || 200,
                  },
                };

    if (target.type === 'user' && !target.userId) {
      toast.error('User ID or Email is required');
      return;
    }
    if (target.type === 'topic' && !target.topic) {
      toast.error('Topic is required');
      return;
    }
    if (target.type === 'tokens' && target.tokens.length === 0) {
      toast.error('At least one token is required');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: sendPlatform,
          provider: sendProvider,
          category,
          notification: {
            title: title.trim() || undefined,
            body: body.trim() || undefined,
          },
          data,
          target,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to send');
      }

      toast.success(`Sent. success=${json.successCount}, failed=${json.failureCount}`);
      setTitle('');
      setBody('');
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Tabs defaultValue="send" className="w-full">
      <TabsList>
        <TabsTrigger value="send">Send</TabsTrigger>
        <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        <TabsTrigger value="export">Export</TabsTrigger>
      </TabsList>

      <TabsContent value="send" className="mt-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Target</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label>Platform</Label>
                <Select value={sendPlatform} onValueChange={setSendPlatform}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="web">web</SelectItem>
                    <SelectItem value="ios">ios</SelectItem>
                    <SelectItem value="android">android</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Provider</Label>
                <Select value={sendProvider} onValueChange={setSendProvider}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fcm">fcm</SelectItem>
                    <SelectItem value="apns">apns</SelectItem>
                    <SelectItem value="webpush">webpush</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Target type</Label>
                <Select
                  value={targetType}
                  onValueChange={(v) =>
                    setTargetType(v as 'user' | 'topic' | 'tokens' | 'all' | 'filter')
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">user</SelectItem>
                    <SelectItem value="topic">topic</SelectItem>
                    <SelectItem value="tokens">tokens</SelectItem>
                    <SelectItem value="all">all (active)</SelectItem>
                    <SelectItem value="filter">filter (dimensions)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {targetType === 'user' && (
                <div className="grid gap-2">
                  <Label>User ID or Email</Label>
                  <div className="relative">
                    <Input
                      value={userSearchQuery}
                      onChange={(e) => {
                        setUserSearchQuery(e.target.value);
                        // If user types directly, also update targetUserId
                        // This allows both email and ID input
                        const value = e.target.value.trim();
                        if (value.includes('@')) {
                          // Looks like an email, keep search query
                          setTargetUserId('');
                        } else {
                          // Might be an ID, set it directly
                          setTargetUserId(value);
                        }
                      }}
                      onFocus={() => {
                        if (userSuggestions.length > 0) {
                          setShowSuggestions(true);
                        }
                      }}
                      onBlur={() => {
                        // Delay to allow click on suggestion
                        setTimeout(() => setShowSuggestions(false), 200);
                      }}
                      placeholder="Enter user ID or email..."
                    />
                    {showSuggestions && userSuggestions.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto">
                        {userSuggestions.map((user) => (
                          <button
                            key={user.id}
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-accent focus:bg-accent focus:outline-none"
                            onMouseDown={(e) => {
                              e.preventDefault(); // Prevent onBlur
                              handleUserSelect(user);
                            }}
                          >
                            <div className="font-medium">{user.email}</div>
                            {user.name && (
                              <div className="text-sm text-muted-foreground">
                                {user.name}
                              </div>
                            )}
                            <div className="text-xs text-muted-foreground">
                              ID: {user.id}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {targetUserId && (
                    <p className="text-xs text-muted-foreground">
                      Selected User ID: {targetUserId}
                    </p>
                  )}
                </div>
              )}

              {targetType === 'topic' && (
                <div className="grid gap-2">
                  <Label>Topic</Label>
                  <Input
                    value={targetTopic}
                    onChange={(e) => setTargetTopic(e.target.value)}
                  />
                </div>
              )}

              {targetType === 'tokens' && (
                <div className="grid gap-2">
                  <Label>Tokens (comma or newline separated)</Label>
                  <Textarea
                    rows={6}
                    value={targetTokens}
                    onChange={(e) => setTargetTokens(e.target.value)}
                  />
                </div>
              )}

              {targetType === 'all' && (
                <div className="grid gap-2">
                  <Label>Limit (max 500)</Label>
                  <Input
                    value={targetAllLimit}
                    onChange={(e) => setTargetAllLimit(e.target.value)}
                  />
                </div>
              )}

              {targetType === 'filter' && (
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label>User ID (optional)</Label>
                    <Input
                      value={filterUserId}
                      onChange={(e) => setFilterUserId(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Device ID (optional)</Label>
                    <Input
                      value={filterDeviceId}
                      onChange={(e) => setFilterDeviceId(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>App ID (optional)</Label>
                    <Input
                      value={filterAppId}
                      onChange={(e) => setFilterAppId(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>App Version (optional)</Label>
                    <Input
                      placeholder="1.0.9+18"
                      value={filterAppVersion}
                      onChange={(e) => setFilterAppVersion(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Environment (optional)</Label>
                    <Input
                      placeholder="sandbox / production"
                      value={filterEnvironment}
                      onChange={(e) => setFilterEnvironment(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Active</Label>
                    <Select value={filterIsActive} onValueChange={setFilterIsActive}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">true</SelectItem>
                        <SelectItem value="false">false</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Limit (max 500)</Label>
                    <Input
                      value={filterLimit}
                      onChange={(e) => setFilterLimit(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Message</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">general</SelectItem>
                    <SelectItem value="marketing">marketing</SelectItem>
                    <SelectItem value="trading">trading</SelectItem>
                    <SelectItem value="security">security</SelectItem>
                    <SelectItem value="system">system</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Body</Label>
                <Textarea
                  rows={4}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Data (JSON)</Label>
                <Textarea
                  rows={6}
                  value={dataJson}
                  onChange={(e) => setDataJson(e.target.value)}
                />
              </div>

              <div className="flex gap-2">
                <Button onClick={onSend} disabled={loading}>
                  {loading ? 'Sending…' : 'Send'}
                </Button>
                <Button variant="outline" onClick={refresh} disabled={loading}>
                  Refresh
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="dashboard" className="mt-6">
        <div className="grid gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={refresh} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </Button>
            <Select value={listPlatform} onValueChange={setListPlatform}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">all platforms</SelectItem>
                <SelectItem value="web">web</SelectItem>
                <SelectItem value="ios">ios</SelectItem>
                <SelectItem value="android">android</SelectItem>
              </SelectContent>
            </Select>
            <Select value={listProvider} onValueChange={setListProvider}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">all providers</SelectItem>
                <SelectItem value="fcm">fcm</SelectItem>
                <SelectItem value="apns">apns</SelectItem>
                <SelectItem value="webpush">webpush</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="outline">devices: {devices.length}</Badge>
            <Badge variant="outline">logs: {logs.length}</Badge>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Registered devices (latest)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Platform</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead>App</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Active</TableHead>
                      <TableHead>Last seen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {devices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-muted-foreground">
                          No devices
                        </TableCell>
                      </TableRow>
                    ) : (
                      devices.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell>{d.platform}</TableCell>
                          <TableCell>{d.provider}</TableCell>
                          <TableCell className="max-w-[240px] truncate">
                            {d.userId ?? '(anonymous)'}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {d.deviceId}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {d.appId}
                          </TableCell>
                          <TableCell className="max-w-[160px] truncate">
                            {d.appVersion ?? '—'}
                          </TableCell>
                          <TableCell>{d.isActive ? 'true' : 'false'}</TableCell>
                          <TableCell className="max-w-[220px] truncate">
                            {d.lastSeenAt || 'N/A'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Send logs (latest)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Platform</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>OK</TableHead>
                      <TableHead>Fail</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-muted-foreground">
                          No logs
                        </TableCell>
                      </TableRow>
                    ) : (
                      logs.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="max-w-[220px] truncate">
                            {l.createdAt || 'N/A'}
                          </TableCell>
                          <TableCell>{l.category ?? 'general'}</TableCell>
                          <TableCell>{l.targetType}</TableCell>
                          <TableCell>{l.platform}</TableCell>
                          <TableCell>{l.provider}</TableCell>
                          <TableCell>{l.successCount}</TableCell>
                          <TableCell>{l.failureCount}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="export" className="mt-6">
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Export CSV</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <a href="/api/push/export?type=devices&format=csv">
                    Export devices (CSV)
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href="/api/push/export?type=logs&format=csv">Export logs (CSV)</a>
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <a href="/api/push/export?type=devices&format=json">
                    Export devices (JSON)
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href="/api/push/export?type=logs&format=json">Export logs (JSON)</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>
    </Tabs>
  );
}
