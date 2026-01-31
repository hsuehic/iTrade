import { NextResponse } from 'next/server';

import { defaultLocale, isLocale } from '@/i18n/routing';

export async function POST(request: Request) {
  const body = (await request.json()) as { locale?: string };
  const nextLocale = isLocale(body.locale) ? body.locale : defaultLocale;

  const response = NextResponse.json({ locale: nextLocale });
  response.cookies.set('NEXT_LOCALE', nextLocale, { path: '/' });
  return response;
}
