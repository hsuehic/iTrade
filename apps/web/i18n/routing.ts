export const locales = ['en', 'zh'] as const;

export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = 'en';

export const isLocale = (value?: string | null): value is AppLocale => {
  if (!value) {
    return false;
  }

  return locales.includes(value as AppLocale);
};
