'use client';

import { IconWorld } from '@tabler/icons-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { locales, type AppLocale } from '@/i18n/routing';

export function LocaleSwitcher() {
  const t = useTranslations('navigation');
  const locale = useLocale() as AppLocale;
  const router = useRouter();

  const handleChange = async (nextLocale: string) => {
    if (nextLocale === locale) {
      return;
    }

    const resolvedLocale = nextLocale as AppLocale;
    try {
      await fetch('/api/locale', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({ locale: resolvedLocale }),
      });
    } finally {
      router.refresh();
      window.location.reload();
    }
  };

  const currentLabel = locale === 'en' ? t('english') : t('chinese');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 min-w-[110px] justify-between gap-2"
          aria-label={t('language')}
        >
          <span className="flex items-center gap-2">
            <IconWorld className="size-4" />
            <span>{currentLabel}</span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {locales.map((value) => (
          <DropdownMenuItem key={value} onClick={() => handleChange(value)}>
            <span>{value === 'en' ? t('english') : t('chinese')}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
