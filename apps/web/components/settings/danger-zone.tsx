'use client';

import Link from 'next/link';
import { AlertTriangle, ExternalLink, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

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
  const t = useTranslations('settings.danger');
  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="size-5" />
          {t('title')}
        </CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>{t('warning.title')}</AlertTitle>
          <AlertDescription>{t('warning.description')}</AlertDescription>
        </Alert>

        {/* Delete Account Section */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-medium flex items-center gap-2">
                <Trash2 className="size-4 text-destructive" />
                {t('deleteAccount.title')}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t('deleteAccount.description')}
              </p>
            </div>
            <Button variant="destructive" size="sm" asChild>
              <Link href="/auth/delete-account">
                {t('deleteAccount.action')}
                <ExternalLink className="size-3" />
              </Link>
            </Button>
          </div>
        </div>

        <Separator />

        {/* Data Information */}
        <div className="rounded-lg bg-muted/50 p-4">
          <h4 className="font-medium mb-2">{t('deleted.title')}</h4>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>{t('deleted.items.profile')}</li>
            <li>{t('deleted.items.strategies')}</li>
            <li>{t('deleted.items.trades')}</li>
            <li>{t('deleted.items.portfolio')}</li>
            <li>{t('deleted.items.backtests')}</li>
            <li>{t('deleted.items.notifications')}</li>
            <li>{t('deleted.items.sessions')}</li>
          </ul>
        </div>

        <div className="rounded-lg bg-muted/50 p-4">
          <h4 className="font-medium mb-2">{t('before.title')}</h4>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>{t('before.items.export')}</li>
            <li>{t('before.items.stopStrategies')}</li>
            <li>{t('before.items.closePositions')}</li>
            <li>{t('before.items.irreversible')}</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
