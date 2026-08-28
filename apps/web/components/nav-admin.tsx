'use client';

import {
  IconSettings,
  IconChartInfographic,
  IconUsers,
  IconBrain,
  IconBook,
  IconHistory,
  IconBell,
} from '@tabler/icons-react';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { authClient } from '@/lib/auth-client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

export function NavAdmin() {
  const t = useTranslations('nav.admin');
  const { data: session } = authClient.useSession();
  const pathname = usePathname();

  // Only show if user is admin
  if (!session || (session.user as { role?: string }).role !== 'admin') {
    return null;
  }

  const items = [
    {
      title: t('tradingPairs'),
      url: '/admin/trading-pairs',
      icon: IconChartInfographic,
    },
    {
      title: t('users'),
      url: '/admin/users',
      icon: IconUsers,
    },
    {
      title: t('auditLog'),
      url: '/admin/audit-log',
      icon: IconHistory,
    },
    {
      title: t('aiConfig'),
      url: '/admin/ai-config',
      icon: IconBrain,
    },
    {
      title: t('helpKb'),
      url: '/admin/help-kb',
      icon: IconBook,
    },
    {
      title: t('push'),
      url: '/push',
      icon: IconBell,
    },
    {
      title: t('settings'),
      url: '/admin/settings',
      icon: IconSettings,
    },
  ];

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t('label')}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton
              asChild
              isActive={pathname === item.url}
              tooltip={item.title}
            >
              <Link href={item.url}>
                {item.icon && <item.icon />}
                <span>{item.title}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
