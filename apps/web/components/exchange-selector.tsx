'use client';

import { IconBuildingBank } from '@tabler/icons-react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ExchangeLogo } from '@/components/exchange-logo';

interface ExchangeSelectorProps {
  value: string;
  onChange: (value: string) => void;
  exchanges: string[];
}

export function ExchangeSelector({ value, onChange, exchanges }: ExchangeSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Select exchange">
            {value === 'all' ? (
              'All Exchanges'
            ) : (
              <ExchangeLogo
                exchange={value}
                size="sm"
                showName={true}
                className="text-sm"
              />
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            <div className="flex items-center gap-2">
              <IconBuildingBank className="size-4" />
              <span>All Exchanges</span>
            </div>
          </SelectItem>
          {exchanges.map((exchange) => (
            <SelectItem key={exchange} value={exchange}>
              <ExchangeLogo
                exchange={exchange}
                size="sm"
                showName={true}
                className="text-sm"
              />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
