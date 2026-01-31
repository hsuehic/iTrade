'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { locales, type AppLocale } from '@/i18n/routing';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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

  return (
    <Select value={locale} onValueChange={handleChange}>
      <SelectTrigger aria-label={t('language')} className="h-9 w-[110px]">
        <SelectValue placeholder={t('language')} />
      </SelectTrigger>
      <SelectContent>
        {locales.map((value) => (
          <SelectItem key={value} value={value}>
            {value === 'en' ? t('english') : t('chinese')}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
