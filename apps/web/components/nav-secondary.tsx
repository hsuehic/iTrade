'use client';

import * as React from 'react';
import { IconWorld, IconSettings, IconWallet } from '@tabler/icons-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { locales, type AppLocale } from '@/i18n/routing';

export function NavSecondary({
  ...props
}: React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const t = useTranslations('nav.secondary');
  const navigationT = useTranslations('navigation');
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const pathname = usePathname();
  const { isMobile } = useSidebar();

  // --- Hover-to-open (desktop only) ---
  // modal={false} on DropdownMenu prevents Radix from stealing focus on open,
  // which is what caused the popup flicker (trigger blur → onOpenChange(false)).
  const [langOpen, setLangOpen] = React.useState(false);
  const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = React.useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const handleHoverEnter = React.useCallback(() => {
    cancelClose();
    setLangOpen(true);
  }, [cancelClose]);

  const handleHoverLeave = React.useCallback(() => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setLangOpen(false), 300);
  }, [cancelClose]);

  React.useEffect(() => cancelClose, [cancelClose]);

  const hoverProps = isMobile
    ? {}
    : { onMouseEnter: handleHoverEnter, onMouseLeave: handleHoverLeave };

  const handleLocaleChange = async (nextLocale: AppLocale) => {
    if (nextLocale === locale) {
      return;
    }

    try {
      await fetch('/api/locale', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({ locale: nextLocale }),
      });
    } finally {
      router.refresh();
      window.location.reload();
    }
  };

  const items = [
    {
      title: t('accounts'),
      url: '/accounts',
      icon: IconWallet,
    },
    {
      title: t('settings'),
      url: '/settings',
      icon: IconSettings,
    },
  ];

  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const isActive = pathname === item.url || pathname.startsWith(`${item.url}/`);
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton isActive={isActive} tooltip={item.title} asChild>
                  {isActive ? (
                    <a>
                      <item.icon />
                      <span>{item.title}</span>
                    </a>
                  ) : (
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
          <SidebarMenuItem>
            <DropdownMenu open={langOpen} onOpenChange={setLangOpen} modal={isMobile}>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton tooltip={navigationT('language')} {...hoverProps}>
                  <IconWorld />
                  <span>{navigationT('language')}</span>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-36 rounded-lg"
                side={isMobile ? 'bottom' : 'right'}
                align={isMobile ? 'end' : 'start'}
                onMouseEnter={handleHoverEnter}
                onMouseLeave={handleHoverLeave}
              >
                {locales.map((value) => (
                  <DropdownMenuItem
                    key={value}
                    onClick={() => handleLocaleChange(value as AppLocale)}
                  >
                    <IconWorld className="size-4" />
                    <span>
                      {value === 'en' ? navigationT('english') : navigationT('chinese')}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
