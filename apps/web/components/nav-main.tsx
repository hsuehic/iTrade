'use client';

import {
  IconDashboard,
  IconClockBitcoin,
  IconClockDollar,
  IconDeviceAnalytics,
  IconWorldDollar,
} from '@tabler/icons-react';
import { useTranslations } from 'next-intl';

import Link from 'next/link';

import { usePathname } from 'next/navigation';

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

export function NavMain() {
  const t = useTranslations('nav.main');
  const items = [
    {
      title: t('dashboard'),
      url: '/dashboard',
      icon: IconDashboard,
    },
    {
      title: t('strategy'),
      url: '/strategy',
      icon: IconDeviceAnalytics,
    },
    {
      title: t('dryRun'),
      url: '/dry-run',
      icon: IconClockBitcoin,
    },
    {
      title: t('backtest'),
      url: '/backtest',
      icon: IconClockDollar,
    },
    {
      title: t('market'),
      url: '/market',
      icon: IconWorldDollar,
    },
  ];

  const pathname = usePathname();

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        {/* <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <SidebarMenuButton
              tooltip="Quick Create"
              className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground min-w-8 duration-200 ease-linear"
            >
              <IconCirclePlusFilled />
              <span>Create Strategy</span>
            </SidebarMenuButton>
            <Button
              size="icon"
              className="size-8 group-data-[collapsible=icon]:opacity-0"
              variant="outline"
            >
              <IconCalculatorFilled />
              <span className="sr-only">Backtest</span>
            </Button>
          </SidebarMenuItem>
        </SidebarMenu> */}
        <SidebarMenu>
          {items.map((item) => {
            const { title, url } = item;
            const isActive = pathname === url;
            return (
              <SidebarMenuItem key={title}>
                <SidebarMenuButton isActive={isActive} tooltip={title} asChild>
                  {isActive ? (
                    <a>
                      {item.icon && <item.icon />}
                      <span>{title}</span>{' '}
                    </a>
                  ) : (
                    <Link href={url}>
                      {item.icon && <item.icon />}
                      <span>{title}</span>
                    </Link>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
