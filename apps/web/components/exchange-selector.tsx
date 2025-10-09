'use client';

import { IconBuildingBank } from '@tabler/icons-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ExchangeSelectorProps {
  value: string;
  onChange: (value: string) => void;
  exchanges: string[];
}

export function ExchangeSelector({ value, onChange, exchanges }: ExchangeSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <IconBuildingBank className="size-4 text-muted-foreground" />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Select exchange" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Exchanges</SelectItem>
          {exchanges.map((exchange) => (
            <SelectItem key={exchange} value={exchange} className="capitalize">
              {exchange.charAt(0).toUpperCase() + exchange.slice(1)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

