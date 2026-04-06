import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import { defaultLocale, isLocale } from './routing';

const LOCALE_HEADER = 'x-itrade-locale';
const LOCALE_COOKIE = 'NEXT_LOCALE';

const getMessageFallback = ({ key, namespace }: { key: string; namespace?: string }) =>
  namespace ? `${namespace}.${key}` : key;

const onIntlError = (error: unknown) => {
  const errorCode = (error as { code?: string }).code;
  if (errorCode === 'MISSING_MESSAGE') return;
  console.error(error);
};

export default getRequestConfig(async () => {
  const requestHeaders = await headers();
  const requestCookies = await cookies();
  const headerLocale = requestHeaders.get(LOCALE_HEADER);
  const cookieLocale = requestCookies.get(LOCALE_COOKIE)?.value;

  const resolvedLocale = isLocale(headerLocale)
    ? headerLocale
    : isLocale(cookieLocale)
      ? cookieLocale
      : defaultLocale;

  return {
    locale: resolvedLocale,
    messages: (await import(`../messages/${resolvedLocale}.json`)).default,
    timeZone: 'UTC',
    getMessageFallback,
    onError: onIntlError,
  };
});
