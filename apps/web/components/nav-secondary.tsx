'use client';

import * as React from 'react';
import { IconSettings, IconWallet } from '@tabler/icons-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

export function NavSecondary({
  ...props
}: React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const pathname = usePathname();

  const items = [
    {
      title: 'Accounts',
      url: '/accounts',
      icon: IconWallet,
    },
    {
      title: 'Settings',
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
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
