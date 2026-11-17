'use client';

import { Fragment, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useServerIpWhitelist } from '@/hooks/use-server-ip-whitelist';

interface ApiKeyIpWhitelistNoticeProps {
  variant?: 'page' | 'modal';
}

/**
 * Rich-text callback for the <ips> tag. chunks arrives as the
 * comma-joined server IP string; split it back apart so each IP gets its
 * own highlighted code chip, with ', ' separators between chips so the
 * list reads (and copies) as comma-separated.
 */
function ipHighlight(chunks: ReactNode): ReactNode {
  const text = typeof chunks === 'string' ? chunks : String(chunks);
  return (
    <>
      {text
        .split(',')
        .map((ip) => ip.trim())
        .filter(Boolean)
        .map((ip, index) => (
          <Fragment key={ip}>
            {index > 0 ? ', ' : null}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm font-semibold text-foreground">
              {ip}
            </code>
          </Fragment>
        ))}
    </>
  );
}

export function ApiKeyIpWhitelistNotice({
  variant = 'page',
}: ApiKeyIpWhitelistNoticeProps) {
  const t = useTranslations('accounts.ipWhitelist');
  const { ips } = useServerIpWhitelist();

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
          serverIps: ips.join(', '),
          ips: ipHighlight,
        })}
      </AlertDescription>
    </Alert>
  );
}
