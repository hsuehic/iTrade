'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ITRADE_SERVER_IP } from '@/lib/itrade-server-ip';

interface ApiKeyIpWhitelistNoticeProps {
  variant?: 'page' | 'modal';
}

export function ApiKeyIpWhitelistNotice({
  variant = 'page',
}: ApiKeyIpWhitelistNoticeProps) {
  const t = useTranslations('accounts.ipWhitelist');

  const ipHighlight = (chunks: ReactNode) => (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm font-semibold text-foreground">
      {chunks}
    </code>
  );

  return (
    <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30">
      <ShieldAlert className="h-4 w-4 text-amber-600" />
      {variant === 'page' ? (
        <AlertTitle className="text-amber-900 dark:text-amber-100">
          {t('title')}
        </AlertTitle>
      ) : null}
      <AlertDescription className="text-amber-900 dark:text-amber-100">
        {t.rich(variant === 'modal' ? 'modalDescription' : 'description', {
          serverIp: ITRADE_SERVER_IP,
          ip: ipHighlight,
        })}
      </AlertDescription>
    </Alert>
  );
}
