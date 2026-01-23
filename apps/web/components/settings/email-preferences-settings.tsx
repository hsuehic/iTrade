'use client';

import { useState, useEffect } from 'react';
import { Loader2, Check, Mail, Bell, TrendingUp, Shield, Newspaper } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

interface EmailPreferences {
  tradingAlerts: boolean;
  priceAlerts: boolean;
  orderUpdates: boolean;
  accountActivity: boolean;
  weeklyReports: boolean;
  productUpdates: boolean;
  newsAndTips: boolean;
  marketingEmails: boolean;
}

const defaultPreferences: EmailPreferences = {
  tradingAlerts: true,
  priceAlerts: true,
  orderUpdates: true,
  accountActivity: true,
  weeklyReports: true,
  productUpdates: false,
  newsAndTips: true,
  marketingEmails: true,
};

export function EmailPreferencesSettings() {
  const [preferences, setPreferences] = useState<EmailPreferences>(defaultPreferences);
  const [originalPreferences, setOriginalPreferences] =
    useState<EmailPreferences>(defaultPreferences);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch current preferences
  useEffect(() => {
    const fetchPreferences = async () => {
      try {
        const response = await fetch('/api/settings/email-preferences');
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.preferences) {
            setPreferences(data.preferences);
            setOriginalPreferences(data.preferences);
          }
        }
      } catch (error) {
        console.error('Failed to fetch email preferences:', error);
        toast.error('Failed to load email preferences');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPreferences();
  }, []);

  // Check for changes
  useEffect(() => {
    const changed = Object.keys(preferences).some(
      (key) =>
        preferences[key as keyof EmailPreferences] !==
        originalPreferences[key as keyof EmailPreferences],
    );
    setHasChanges(changed);
  }, [preferences, originalPreferences]);

  const handleToggle = (key: keyof EmailPreferences) => {
    setPreferences((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/settings/email-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to save preferences');
      }

      toast.success('Email preferences saved successfully');
      setOriginalPreferences(preferences);
      setHasChanges(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save email preferences';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="size-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="size-5" />
          Email Preferences
        </CardTitle>
        <CardDescription>
          Choose which emails you would like to receive. You can update these settings at
          any time.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Trading Notifications */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-muted-foreground" />
              <h3 className="font-medium">Trading Notifications</h3>
            </div>
            <div className="space-y-4 pl-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="tradingAlerts" className="cursor-pointer">
                    Trading Alerts
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when your strategies execute trades
                  </p>
                </div>
                <Switch
                  id="tradingAlerts"
                  checked={preferences.tradingAlerts}
                  onCheckedChange={() => handleToggle('tradingAlerts')}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="priceAlerts" className="cursor-pointer">
                    Price Alerts
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Receive alerts when assets hit your price targets
                  </p>
                </div>
                <Switch
                  id="priceAlerts"
                  checked={preferences.priceAlerts}
                  onCheckedChange={() => handleToggle('priceAlerts')}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="orderUpdates" className="cursor-pointer">
                    Order Updates
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified about order fills and cancellations
                  </p>
                </div>
                <Switch
                  id="orderUpdates"
                  checked={preferences.orderUpdates}
                  onCheckedChange={() => handleToggle('orderUpdates')}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Account & Security */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Shield className="size-4 text-muted-foreground" />
              <h3 className="font-medium">Account & Security</h3>
            </div>
            <div className="space-y-4 pl-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="accountActivity" className="cursor-pointer">
                    Account Activity
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Receive notifications for important account activities
                  </p>
                </div>
                <Switch
                  id="accountActivity"
                  checked={preferences.accountActivity}
                  onCheckedChange={() => handleToggle('accountActivity')}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Reports & Updates */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Bell className="size-4 text-muted-foreground" />
              <h3 className="font-medium">Reports & Updates</h3>
            </div>
            <div className="space-y-4 pl-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="weeklyReports" className="cursor-pointer">
                    Weekly Reports
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Receive weekly performance summaries and insights
                  </p>
                </div>
                <Switch
                  id="weeklyReports"
                  checked={preferences.weeklyReports}
                  onCheckedChange={() => handleToggle('weeklyReports')}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="productUpdates" className="cursor-pointer">
                    Product Updates
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Stay informed about new features and improvements
                  </p>
                </div>
                <Switch
                  id="productUpdates"
                  checked={preferences.productUpdates}
                  onCheckedChange={() => handleToggle('productUpdates')}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="newsAndTips" className="cursor-pointer">
                    News & Tips
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Get trading tips and market news
                  </p>
                </div>
                <Switch
                  id="newsAndTips"
                  checked={preferences.newsAndTips}
                  onCheckedChange={() => handleToggle('newsAndTips')}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Marketing */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Newspaper className="size-4 text-muted-foreground" />
              <h3 className="font-medium">Marketing</h3>
            </div>
            <div className="space-y-4 pl-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="marketingEmails" className="cursor-pointer">
                    Marketing Emails
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Receive promotional offers and announcements
                  </p>
                </div>
                <Switch
                  id="marketingEmails"
                  checked={preferences.marketingEmails}
                  onCheckedChange={() => handleToggle('marketingEmails')}
                />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex items-center gap-4 pt-4">
            <Button
              type="submit"
              disabled={isSubmitting || !hasChanges}
              className="min-w-32"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="size-4" />
                  Save Preferences
                </>
              )}
            </Button>
            {hasChanges && (
              <p className="text-sm text-muted-foreground">You have unsaved changes</p>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
