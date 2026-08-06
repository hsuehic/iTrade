'use client';

import { useTranslations } from 'next-intl';
import Image from 'next/image';

export function LandingFooter() {
  const t = useTranslations('landing.footer');
  const tb = useTranslations('landing.brand');

  return (
    <footer className="relative border-t bg-background/80 py-10 backdrop-blur-sm">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Brand block */}
        <div className="mx-auto mb-8 max-w-3xl text-center">
          <div className="mb-3 flex items-center justify-center gap-2.5 sm:gap-3.5">
            {(['x', 't', 'r', 'd', 'e'] as const).map((k) => (
              <div key={k} className="flex flex-col items-center">
                <span className="text-lg font-black leading-none tracking-tight text-primary sm:text-xl">
                  {k.toUpperCase()}
                </span>
                <span className="mt-0.5 text-[9px] font-medium uppercase tracking-widest text-muted-foreground sm:text-[10px]">
                  {tb(`acronym.${k}`)}
                </span>
              </div>
            ))}
          </div>
          <p className="mx-auto max-w-2xl text-xs italic text-muted-foreground sm:text-sm">
            {tb('mission')}
          </p>
          <p className="mt-2 text-sm font-semibold text-foreground">
            {tb('slogan')} <span className="text-primary">{tb('sloganSub')}</span>
          </p>
        </div>

        {/* Divider */}
        <div className="mx-auto mb-6 h-px max-w-xs bg-border" />

        {/* Product + company line */}
        <div className="text-center text-sm text-muted-foreground">
          <p className="flex items-center justify-center gap-2">
            <Image
              src="/logo.svg"
              alt="iTrade Logo"
              width={18}
              height={18}
              className="size-[18px]"
            />
            <span className="font-medium text-foreground">{t('product')}</span>
          </p>
          <p className="mt-2">{t('rights')}</p>
          <p className="mt-1">{t('risk')}</p>
          <div className="mt-4 flex items-center justify-center gap-4">
            <a
              href="/privacy.html"
              target="_blank"
              rel="noopener noreferrer"
              className="underline transition-colors hover:text-foreground"
            >
              {t('privacy')}
            </a>
            <span>•</span>
            <a
              href="/terms.html"
              target="_blank"
              rel="noopener noreferrer"
              className="underline transition-colors hover:text-foreground"
            >
              {t('terms')}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
