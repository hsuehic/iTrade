import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import TransactionPage from '../app/(console)/portfolio/transaction/page';

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: () => null,
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/lib/exchanges', () => ({
  SUPPORTED_EXCHANGES: [{ id: 'okx' }],
  getDefaultTradingPair: () => 'ETH/USDT',
  getSymbolFormatHint: () => 'ETH/USDT',
  parseSymbol: () => ({ base: 'ETH', quote: 'USDT', isPerpetual: false }),
}));

vi.mock('@/components/exchange-selector', () => ({
  ExchangeSelector: () => <div />,
}));

vi.mock('@/components/orders-table', () => ({
  OrdersTable: () => <div />,
}));

vi.mock('@/components/site-header', () => ({
  SiteHeader: ({ title, links }: { title?: string; links?: React.ReactNode }) => (
    <div>
      <span>{title}</span>
      {links}
    </div>
  ),
}));

vi.mock('@/components/ui/sidebar', () => ({
  SidebarInset: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@/components/ui/label', () => ({
  Label: (props: React.LabelHTMLAttributes<HTMLLabelElement>) => <label {...props} />,
}));

vi.mock('@/components/ui/select', async () => {
  const React = await import('react');
  const Select = ({
    value,
    onValueChange,
    children,
    ...props
  }: {
    value?: string;
    onValueChange?: (value: string) => void;
    children?: React.ReactNode;
  }) => {
    let triggerId: string | undefined;
    React.Children.forEach(children, (child) => {
      if (!React.isValidElement(child)) return;
      const element = child as React.ReactElement<{ id?: string }>;
      if (typeof element.props.id === 'string') {
        triggerId = element.props.id;
      }
    });

    const options: Array<{ value: string; label: string }> = [];
    const collectOptions = (nodes: React.ReactNode) => {
      React.Children.forEach(nodes, (child) => {
        if (!React.isValidElement(child)) return;
        const element = child as React.ReactElement<{
          value?: string;
          children?: React.ReactNode;
        }>;
        const value = element.props.value;
        const label = element.props.children;
        if (typeof value === 'string' && typeof label === 'string') {
          options.push({ value, label });
        }
        if (element.props.children) {
          collectOptions(element.props.children);
        }
      });
    };
    collectOptions(children);

    return (
      <select
        id={triggerId}
        value={value}
        onChange={(event) => onValueChange?.(event.target.value)}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  };

  const SelectContent = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  const SelectItem = ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => <option value={value}>{children}</option>;
  const SelectTrigger = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  const SelectValue = () => null;

  return { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
});

describe('TransactionPage', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.startsWith('/api/accounts')) {
        return {
          ok: true,
          json: async () => [{ exchange: 'okx' }],
        } as Response;
      }
      if (url.startsWith('/api/portfolio/assets')) {
        return {
          ok: true,
          json: async () => ({
            assets: [{ asset: 'ETH', free: 0.5, locked: 0, total: 0.5, exchange: 'okx' }],
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ orders: [] }),
      } as Response;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets quantity to full balance when clicking Sell 100%', async () => {
    render(<TransactionPage />);

    const sideSelect = await screen.findByLabelText('manualOrder.fields.side');
    await userEvent.selectOptions(sideSelect, 'SELL');

    const sellAllButton = await screen.findByRole('button', {
      name: 'manualOrder.fields.sellAll',
    });
    await userEvent.click(sellAllButton);

    const quantityInput = screen.getByLabelText('manualOrder.fields.quantity');
    expect(quantityInput).toHaveValue('0.5');
  });
});
