'use client';

import * as React from 'react';
import { IconLanguage, IconSettings, IconWallet } from '@tabler/icons-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuAction,
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
            const isActive = pathname === item.url;
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
            <SidebarMenuButton tooltip={navigationT('language')}>
              <IconLanguage />
              <span>{navigationT('language')}</span>
            </SidebarMenuButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuAction
                  showOnHover
                  className="data-[state=open]:bg-accent rounded-sm"
                >
                  <IconLanguage className="size-4" />
                  <span className="sr-only">{navigationT('language')}</span>
                </SidebarMenuAction>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-36 rounded-lg"
                side={isMobile ? 'bottom' : 'right'}
                align={isMobile ? 'end' : 'start'}
              >
                {locales.map((value) => (
                  <DropdownMenuItem
                    key={value}
                    onClick={() => handleLocaleChange(value as AppLocale)}
                  >
                    <IconLanguage className="size-4" />
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
