'use client';

import { IconSettings, IconChartInfographic, IconUsers } from '@tabler/icons-react';
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

export function NavAdmin() {
  const { data: session } = authClient.useSession();
  const pathname = usePathname();

  // Only show if user is admin
  if (!session || (session.user as { role?: string }).role !== 'admin') {
    return null;
  }

  const items = [
    {
      title: 'Trading Pairs',
      url: '/admin/trading-pairs',
      icon: IconChartInfographic,
    },
    {
      title: 'Users & Roles',
      url: '/admin/users',
      icon: IconUsers,
    },
    {
      title: 'System Settings',
      url: '/admin/settings',
      icon: IconSettings,
    },
  ];

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Management</SidebarGroupLabel>
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
