'use client';

import * as React from 'react';
import { IconSearch, IconChevronDown, IconCheck } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { SymbolIcon } from '@/components/symbol-icon';
import { TradingPair, extractBaseCurrency, getDisplaySymbol } from '@/lib/exchanges';

interface SymbolSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  pairs: TradingPair[];
  placeholder?: string;
}

export function SymbolSelector({
  value,
  onValueChange,
  pairs,
  placeholder,
}: SymbolSelectorProps) {
  const t = useTranslations('strategy');
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      // Focus the search input with a slight delay to ensure the dropdown is mounted
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    } else {
      setSearch('');
    }
  }, [open]);

  const filteredPairs = React.useMemo(() => {
    if (!search) return pairs;
    const lowerSearch = search.toLowerCase();
    return pairs.filter(
      (p) =>
        p.name.toLowerCase().includes(lowerSearch) ||
        p.symbol.toLowerCase().includes(lowerSearch),
    );
  }, [pairs, search]);

  const selectedPair = React.useMemo(
    () => pairs.find((p) => p.symbol === value),
    [pairs, value],
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal h-10 px-3 bg-background border-input"
        >
          {selectedPair ? (
            <div className="flex items-center gap-2 overflow-hidden">
              <SymbolIcon
                symbol={extractBaseCurrency(selectedPair.symbol)}
                exchangeId={selectedPair.exchange?.toLowerCase()}
                size="sm"
              />
              <span className="truncate">
                {getDisplaySymbol(selectedPair.symbol, selectedPair.exchange)}
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <IconChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-[var(--radix-dropdown-menu-trigger-width)] p-0"
        align="start"
      >
        <div
          className="flex items-center border-b px-3 py-2 sticky top-0 bg-popover z-10"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <IconSearch className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Input
            ref={inputRef}
            placeholder={t('inbox.searchPlaceholder') || 'Search...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            className="flex h-8 w-full rounded-md bg-transparent py-2 text-sm outline-none border-none focus-visible:ring-0 px-0"
          />
        </div>
        <div className="max-h-[300px] overflow-y-auto p-1 custom-scrollbar">
          {filteredPairs.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {t('inbox.empty') || 'No results found.'}
            </div>
          )}
          {filteredPairs.map((pair) => (
            <DropdownMenuItem
              key={pair.symbol}
              onSelect={() => {
                onValueChange(pair.symbol);
                setOpen(false);
                setSearch('');
              }}
              className="flex items-center justify-between gap-2 px-2 py-2 cursor-pointer"
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <SymbolIcon
                  symbol={extractBaseCurrency(pair.symbol)}
                  exchangeId={pair.exchange?.toLowerCase()}
                  size="sm"
                />
                <div className="flex flex-col truncate">
                  <span className="font-medium truncate">
                    {getDisplaySymbol(pair.symbol, pair.exchange)}
                  </span>
                  {pair.name &&
                    pair.name !== getDisplaySymbol(pair.symbol, pair.exchange) && (
                      <span className="text-xs text-muted-foreground truncate">
                        {pair.name}
                      </span>
                    )}
                </div>
              </div>
              {value === pair.symbol && (
                <IconCheck className="h-4 w-4 text-primary shrink-0" />
              )}
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
