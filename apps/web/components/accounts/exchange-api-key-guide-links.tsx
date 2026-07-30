'use client';

import { ExternalLink, Monitor, Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  getExchangeDisplayName,
  SupportedExchange,
} from '@itrade/data-manager/constants';
import { getExchangeApiKeyGuides } from '@/lib/exchange-api-key-guides';

interface ExchangeApiKeyGuideLinksProps {
  exchange: string;
}

export function ExchangeApiKeyGuideLinks({ exchange }: ExchangeApiKeyGuideLinksProps) {
  const t = useTranslations('accounts.form.apiKeyGuides');
  const guides = getExchangeApiKeyGuides(exchange);

  if (!guides) {
    return null;
  }

  const exchangeName = getExchangeDisplayName(exchange as SupportedExchange);
  const linkClassName =
    'inline-flex items-center gap-2 text-sm text-primary hover:underline underline-offset-4';

  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-sm font-medium">{t('title', { exchange: exchangeName })}</p>
      <div className="flex flex-col gap-2">
        <a
          href={guides.web}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
        >
          <Monitor className="h-4 w-4 shrink-0" />
          <span>{t('webLink')}</span>
          <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
        </a>
        <a
          href={guides.mobile}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
        >
          <Smartphone className="h-4 w-4 shrink-0" />
          <span>
            {exchange === SupportedExchange.COINBASE
              ? t('mobileLinkCoinbase')
              : t('mobileLink')}
          </span>
          <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
        </a>
      </div>
    </div>
  );
}
