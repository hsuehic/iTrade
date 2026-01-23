'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  IconCoinBitcoin,
  IconCoins,
  IconReceiptDollar,
  IconCalendarDollar,
  IconCircleCheck,
  IconClock,
  IconCircleX,
  IconFilter,
  IconBrandBinance,
  IconCurrencyBitcoin,
} from '@tabler/icons-react';
import { usePathname } from 'next/navigation';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

// Transaction filter shortcuts
const transactionFilters = {
  status: [
    { label: 'Filled', value: 'FILLED', icon: IconCircleCheck },
    { label: 'Open', value: 'NEW', icon: IconClock },
    { label: 'Cancelled', value: 'CANCELED', icon: IconCircleX },
  ],
  exchanges: [
    { label: 'Binance', value: 'binance', icon: IconBrandBinance },
    { label: 'OKX', value: 'okx', icon: IconCurrencyBitcoin },
    { label: 'Coinbase', value: 'coinbase', icon: IconCurrencyBitcoin },
  ],
};

export function NavPortfolio() {
  const pathname = usePathname();
  const router = useRouter();
  const { isMobile } = useSidebar();
  const items = [
    {
      name: 'Balance',
      url: '/portfolio/balance',
      icon: IconCalendarDollar,
    },
    {
      name: 'Assets',
      url: '/portfolio/assets',
      icon: IconCoinBitcoin,
    },
    {
      name: 'Position',
      url: '/portfolio/position',
      icon: IconCoins,
    },
    {
      name: 'Transaction',
      url: '/portfolio/transaction',
      icon: IconReceiptDollar,
      hasFilters: true,
    },
  ];

  const handleFilterClick = (filterType: string, value: string) => {
    const params = new URLSearchParams();
    params.set(filterType, value);
    router.push(`/portfolio/transaction?${params.toString()}`);
  };

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Portfolio</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.name}>
            <SidebarMenuButton
              isActive={pathname === item.url || pathname?.startsWith(item.url + '?')}
              asChild
            >
              <Link href={item.url}>
                <item.icon />
                <span>{item.name}</span>
              </Link>
            </SidebarMenuButton>
            {item.hasFilters && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuAction
                    showOnHover
                    className="data-[state=open]:bg-accent rounded-sm"
                  >
                    <IconFilter className="size-4" />
                    <span className="sr-only">Filter Orders</span>
                  </SidebarMenuAction>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-36 rounded-lg"
                  side={isMobile ? 'bottom' : 'right'}
                  align={isMobile ? 'end' : 'start'}
                >
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    By Status
                  </DropdownMenuLabel>
                  {transactionFilters.status.map((filter) => (
                    <DropdownMenuItem
                      key={filter.value}
                      onClick={() => handleFilterClick('status', filter.value)}
                    >
                      <filter.icon className="size-4" />
                      <span>{filter.label}</span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    By Exchange
                  </DropdownMenuLabel>
                  {transactionFilters.exchanges.map((filter) => (
                    <DropdownMenuItem
                      key={filter.value}
                      onClick={() => handleFilterClick('exchange', filter.value)}
                    >
                      <filter.icon className="size-4" />
                      <span>{filter.label}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
