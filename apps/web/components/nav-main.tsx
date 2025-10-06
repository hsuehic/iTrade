import {
  IconDashboard,
  IconClockBitcoin,
  IconClockDollar,
  IconDeviceAnalytics,
  IconWorldDollar,
} from '@tabler/icons-react';

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

export function NavMain({ pathname }: { pathname?: string | null }) {
  const items = [
    {
      title: 'Dashboard',
      url: '/dashboard',
      icon: IconDashboard,
    },
    {
      title: 'Strategies',
      url: '/strategies',
      icon: IconDeviceAnalytics,
    },
    {
      title: 'Dry run',
      url: '/dry-run',
      icon: IconClockBitcoin,
    },
    {
      title: 'Becktesting',
      url: '/backtestings',
      icon: IconClockDollar,
    },
    {
      title: 'Market',
      url: '/market',
      icon: IconWorldDollar,
    },
  ];

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
            return (
              <SidebarMenuItem key={title}>
                <SidebarMenuButton
                  isActive={pathname === url}
                  tooltip={title}
                  asChild
                >
                  <a href={url}>
                    {item.icon && <item.icon />}
                    <span>{title}</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
