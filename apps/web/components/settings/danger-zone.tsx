'use client';

import Link from 'next/link';
import { AlertTriangle, ExternalLink, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';

export function DangerZone() {
  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="size-5" />
          Danger Zone
        </CardTitle>
        <CardDescription>
          Actions in this section are irreversible. Please proceed with caution.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Warning</AlertTitle>
          <AlertDescription>
            The actions below can result in permanent data loss. Please make sure you
            understand the consequences before proceeding.
          </AlertDescription>
        </Alert>

        {/* Delete Account Section */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-medium flex items-center gap-2">
                <Trash2 className="size-4 text-destructive" />
                Delete Account
              </h3>
              <p className="text-sm text-muted-foreground">
                Permanently delete your account and all associated data. This includes all
                your strategies, trades, portfolios, and settings.
              </p>
            </div>
            <Button variant="destructive" size="sm" asChild>
              <Link href="/auth/delete-account">
                Delete Account
                <ExternalLink className="size-3" />
              </Link>
            </Button>
          </div>
        </div>

        <Separator />

        {/* Data Information */}
        <div className="rounded-lg bg-muted/50 p-4">
          <h4 className="font-medium mb-2">What gets deleted?</h4>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>Your user profile and personal information</li>
            <li>All trading strategies you&apos;ve created</li>
            <li>Historical trade data and orders</li>
            <li>Portfolio information and balance history</li>
            <li>Backtest configurations and results</li>
            <li>Email preferences and notification settings</li>
            <li>All sessions and login history</li>
          </ul>
        </div>

        <div className="rounded-lg bg-muted/50 p-4">
          <h4 className="font-medium mb-2">Before you delete</h4>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>Export any data you want to keep</li>
            <li>Stop all running strategies</li>
            <li>Close any open positions on exchanges</li>
            <li>This action cannot be undone</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
