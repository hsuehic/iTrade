'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { IconLoader2 } from '@tabler/icons-react';
import { authClient } from '@/lib/auth-client';

type SystemSettings = {
  platformName: string;
  supportEmail: string;
  timezone: string;
  maintenanceMode: boolean;
  allowRegistrations: boolean;
  sessionTimeoutMinutes: string;
  maxConcurrentSessions: string;
  auditRetentionDays: string;
  announcement: string;
};

const SETTINGS_STORAGE_KEY = 'itrade-admin-settings';

const DEFAULT_SETTINGS: SystemSettings = {
  platformName: 'iTrade',
  supportEmail: 'support@itrade.com',
  timezone: 'UTC',
  maintenanceMode: false,
  allowRegistrations: true,
  sessionTimeoutMinutes: '60',
  maxConcurrentSessions: '3',
  auditRetentionDays: '90',
  announcement: '',
};

const useDebouncedValue = <T,>(value: T, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timeoutId);
  }, [value, delay]);

  return debouncedValue;
};

const validateSettings = (values: SystemSettings) => {
  const errors: Record<string, string> = {};
  const platformName = values.platformName.trim();
  const supportEmail = values.supportEmail.trim();
  const announcement = values.announcement.trim();

  if (!platformName) {
    errors.platformName = 'Platform name is required.';
  } else if (platformName.length < 2) {
    errors.platformName = 'Platform name must be at least 2 characters.';
  }

  if (!supportEmail) {
    errors.supportEmail = 'Support email is required.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) {
    errors.supportEmail = 'Enter a valid support email.';
  }

  const sessionTimeout = Number(values.sessionTimeoutMinutes);
  if (!Number.isFinite(sessionTimeout)) {
    errors.sessionTimeoutMinutes = 'Session timeout must be a number.';
  } else if (sessionTimeout < 5 || sessionTimeout > 1440) {
    errors.sessionTimeoutMinutes = 'Session timeout must be between 5 and 1440 minutes.';
  }

  const maxSessions = Number(values.maxConcurrentSessions);
  if (!Number.isFinite(maxSessions)) {
    errors.maxConcurrentSessions = 'Max sessions must be a number.';
  } else if (maxSessions < 1 || maxSessions > 20) {
    errors.maxConcurrentSessions = 'Max sessions must be between 1 and 20.';
  }

  const retentionDays = Number(values.auditRetentionDays);
  if (!Number.isFinite(retentionDays)) {
    errors.auditRetentionDays = 'Retention days must be a number.';
  } else if (retentionDays < 7 || retentionDays > 365) {
    errors.auditRetentionDays = 'Retention days must be between 7 and 365.';
  }

  if (announcement.length > 280) {
    errors.announcement = 'Announcement must be 280 characters or fewer.';
  }

  return errors;
};

export default function AdminSystemSettingsPage() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const timezoneOptions = useMemo(
    () => [
      'UTC',
      'America/New_York',
      'America/Los_Angeles',
      'Europe/London',
      'Europe/Berlin',
      'Asia/Shanghai',
      'Asia/Singapore',
      'Asia/Tokyo',
      'Australia/Sydney',
    ],
    [],
  );

  const debouncedSettings = useDebouncedValue(settings, 500);

  useEffect(() => {
    setErrors(validateSettings(debouncedSettings));
  }, [debouncedSettings]);

  useEffect(() => {
    if (sessionPending) return;
    if (!session || (session.user as { role?: string }).role !== 'admin') {
      router.push('/dashboard');
    }
  }, [session, sessionPending, router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as Partial<SystemSettings>;
      setSettings((prev) => ({
        ...prev,
        ...parsed,
      }));
    } catch (error) {
      console.error('Failed to load system settings:', error);
    }
  }, []);

  const markTouched = useCallback((field: keyof SystemSettings) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  const showError = (field: keyof SystemSettings) =>
    (touched[field] || submitAttempted) && errors[field];

  const handleSave = async () => {
    setSubmitAttempted(true);
    const currentErrors = validateSettings(settings);
    setErrors(currentErrors);

    if (Object.keys(currentErrors).length > 0) {
      toast.error('Please fix the highlighted settings before saving.');
      return;
    }

    setIsSaving(true);
    try {
      const sanitizedSettings: SystemSettings = {
        ...settings,
        platformName: settings.platformName.trim(),
        supportEmail: settings.supportEmail.trim(),
        announcement: settings.announcement.trim(),
      };
      window.localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify(sanitizedSettings),
      );
      toast.success('System settings saved.');
    } catch (error) {
      console.error('Failed to save system settings:', error);
      toast.error('Failed to save system settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    setTouched({});
    setSubmitAttempted(false);
    setErrors(validateSettings(DEFAULT_SETTINGS));
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
    }
    toast.success('System settings reset to defaults.');
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

  return (
    <SidebarInset>
      <SiteHeader title="Admin - System Settings" />
      <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">System Settings</h2>
            <p className="text-muted-foreground text-sm">
              Configure platform defaults and operational controls.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleReset} disabled={isSaving}>
              Reset Defaults
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>General</CardTitle>
              <CardDescription>Core branding and communication settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="platformName">Platform Name</Label>
                <Input
                  id="platformName"
                  value={settings.platformName}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, platformName: event.target.value }))
                  }
                  onBlur={() => markTouched('platformName')}
                  aria-invalid={!!showError('platformName')}
                  aria-describedby={
                    showError('platformName') ? 'platformName-error' : undefined
                  }
                />
                {showError('platformName') && (
                  <p
                    id="platformName-error"
                    className="text-xs text-destructive"
                    role="alert"
                  >
                    {errors.platformName}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="supportEmail">Support Email</Label>
                <Input
                  id="supportEmail"
                  type="email"
                  value={settings.supportEmail}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, supportEmail: event.target.value }))
                  }
                  onBlur={() => markTouched('supportEmail')}
                  aria-invalid={!!showError('supportEmail')}
                  aria-describedby={
                    showError('supportEmail') ? 'supportEmail-error' : undefined
                  }
                />
                {showError('supportEmail') && (
                  <p
                    id="supportEmail-error"
                    className="text-xs text-destructive"
                    role="alert"
                  >
                    {errors.supportEmail}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Default Timezone</Label>
                <Select
                  value={settings.timezone}
                  onValueChange={(value) =>
                    setSettings((prev) => ({ ...prev, timezone: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {timezoneOptions.map((timezone) => (
                      <SelectItem key={timezone} value={timezone}>
                        {timezone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="announcement">Announcement Banner</Label>
                <Textarea
                  id="announcement"
                  value={settings.announcement}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, announcement: event.target.value }))
                  }
                  onBlur={() => markTouched('announcement')}
                  placeholder="Share important platform updates with all users."
                  aria-invalid={!!showError('announcement')}
                  aria-describedby={
                    showError('announcement') ? 'announcement-error' : undefined
                  }
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Displayed on the dashboard home screen.</span>
                  <span>{settings.announcement.trim().length}/280</span>
                </div>
                {showError('announcement') && (
                  <p
                    id="announcement-error"
                    className="text-xs text-destructive"
                    role="alert"
                  >
                    {errors.announcement}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Access Control</CardTitle>
              <CardDescription>Manage user access and session limits.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label htmlFor="registrations" className="text-base">
                    Allow New Registrations
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Disable to prevent new user sign-ups.
                  </p>
                </div>
                <Switch
                  id="registrations"
                  checked={settings.allowRegistrations}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({ ...prev, allowRegistrations: checked }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sessionTimeout">Session Timeout (minutes)</Label>
                <Input
                  id="sessionTimeout"
                  type="number"
                  min={5}
                  max={1440}
                  value={settings.sessionTimeoutMinutes}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      sessionTimeoutMinutes: event.target.value,
                    }))
                  }
                  onBlur={() => markTouched('sessionTimeoutMinutes')}
                  aria-invalid={!!showError('sessionTimeoutMinutes')}
                  aria-describedby={
                    showError('sessionTimeoutMinutes')
                      ? 'sessionTimeout-error'
                      : undefined
                  }
                />
                {showError('sessionTimeoutMinutes') && (
                  <p
                    id="sessionTimeout-error"
                    className="text-xs text-destructive"
                    role="alert"
                  >
                    {errors.sessionTimeoutMinutes}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maxSessions">Max Concurrent Sessions</Label>
                <Input
                  id="maxSessions"
                  type="number"
                  min={1}
                  max={20}
                  value={settings.maxConcurrentSessions}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      maxConcurrentSessions: event.target.value,
                    }))
                  }
                  onBlur={() => markTouched('maxConcurrentSessions')}
                  aria-invalid={!!showError('maxConcurrentSessions')}
                  aria-describedby={
                    showError('maxConcurrentSessions') ? 'maxSessions-error' : undefined
                  }
                />
                {showError('maxConcurrentSessions') && (
                  <p
                    id="maxSessions-error"
                    className="text-xs text-destructive"
                    role="alert"
                  >
                    {errors.maxConcurrentSessions}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="auditRetention">Audit Log Retention (days)</Label>
                <Input
                  id="auditRetention"
                  type="number"
                  min={7}
                  max={365}
                  value={settings.auditRetentionDays}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      auditRetentionDays: event.target.value,
                    }))
                  }
                  onBlur={() => markTouched('auditRetentionDays')}
                  aria-invalid={!!showError('auditRetentionDays')}
                  aria-describedby={
                    showError('auditRetentionDays') ? 'auditRetention-error' : undefined
                  }
                />
                {showError('auditRetentionDays') && (
                  <p
                    id="auditRetention-error"
                    className="text-xs text-destructive"
                    role="alert"
                  >
                    {errors.auditRetentionDays}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Maintenance</CardTitle>
              <CardDescription>
                Control platform availability and messaging.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label htmlFor="maintenance" className="text-base">
                    Maintenance Mode
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Enable to restrict non-admin access while maintenance is active.
                  </p>
                </div>
                <Switch
                  id="maintenance"
                  checked={settings.maintenanceMode}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({ ...prev, maintenanceMode: checked }))
                  }
                />
              </div>
              <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
                Maintenance mode alerts are displayed on login and dashboard screens.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </SidebarInset>
  );
}
