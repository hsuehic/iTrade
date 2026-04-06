'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { NextIntlClientProvider } from 'next-intl';

const getMessageFallback = ({ key, namespace }: { key: string; namespace?: string }) =>
  namespace ? `${namespace}.${key}` : key;

const onIntlError = (error: unknown) => {
  const errorCode = (error as { code?: string }).code;
  if (errorCode === 'MISSING_MESSAGE') return;
  console.error(error);
};

type IntlProviderProps = {
  locale: string;
  messages: Record<string, unknown>;
  children: ReactNode;
};

export function IntlProvider({ locale, messages, children }: IntlProviderProps) {
  const [timeZone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  );

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      timeZone={timeZone}
      getMessageFallback={getMessageFallback}
      onError={onIntlError}
    >
      {children}
    </NextIntlClientProvider>
  );
}
