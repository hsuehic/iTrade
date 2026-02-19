import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { OrdersTable } from '../components/orders-table';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@tabler/icons-react', () => ({
  IconSearch: () => <span />,
  IconSortAscending: () => <span />,
  IconSortDescending: () => <span />,
  IconFilter: () => <span />,
  IconX: () => <span />,
  IconRefresh: () => <span />,
  IconChevronLeft: () => <span />,
  IconChevronRight: () => <span />,
  IconCalendar: () => <span />,
  IconCircleCheck: () => <span />,
  IconCircleX: () => <span />,
  IconClock: () => <span />,
  IconLoader: () => <span />,
  IconAlertCircle: () => <span />,
}));

vi.mock('@/components/exchange-logo', () => ({
  ExchangeLogo: () => <span />,
}));

vi.mock('@/components/symbol-icon', () => ({
  SymbolIcon: () => <span />,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label {...props}>{children}</label>
  ),
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

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: () => <div />,
}));

vi.mock('@/components/ui/table', () => ({
  Table: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
  TableBody: ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>,
  TableCell: ({ children }: { children: React.ReactNode }) => <td>{children}</td>,
  TableHead: ({ children }: { children: React.ReactNode }) => <th>{children}</th>,
  TableHeader: ({ children }: { children: React.ReactNode }) => <thead>{children}</thead>,
  TableRow: ({ children }: { children: React.ReactNode }) => <tr>{children}</tr>,
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  TooltipProvider: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock('@/lib/exchanges', () => ({
  getDisplaySymbol: (symbol: string) => symbol,
  extractBaseCurrency: (symbol: string) => symbol.split('/')[0],
}));

vi.mock('@/lib/utils', () => ({
  cn: (...classes: string[]) => classes.filter(Boolean).join(' '),
  formatDate: () => '2024-01-01',
  formatFullDate: () => '2024-01-01 00:00:00',
}));

describe('OrdersTable edit flow', () => {
  const order = {
    id: 'order-1',
    symbol: 'BTC/USDT',
    exchange: 'okx',
    side: 'BUY' as const,
    type: 'LIMIT',
    quantity: '0.5',
    price: '30000',
    status: 'NEW',
    timeInForce: 'GTC',
    timestamp: new Date().toISOString(),
  };

  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url.startsWith('/api/orders') && (!init || init.method === 'GET')) {
        return {
          ok: true,
          json: async () => ({ orders: [order] }),
        } as Response;
      }

      if (url.startsWith(`/api/orders/${order.id}`) && init?.method === 'PUT') {
        return {
          ok: true,
          json: async () => ({ order }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({}),
      } as Response;
    }) as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows validation errors for invalid edits', async () => {
    const user = userEvent.setup();

    render(<OrdersTable refreshInterval={60000} initialEditOrderId="order-1" />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByLabelText('edit.fields.quantity')).toHaveValue('0.5');
    });
    const quantityInput = screen.getByLabelText('edit.fields.quantity');
    await user.clear(quantityInput);
    fireEvent.blur(quantityInput);

    const saveButton = screen.getByRole('button', { name: 'edit.actions.save' });
    await user.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Quantity is required')).toBeInTheDocument();
    });
  });

  it('submits edit order update', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(global.fetch);

    render(<OrdersTable refreshInterval={60000} initialEditOrderId="order-1" />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByLabelText('edit.fields.price')).toHaveValue('30000');
    });
    const priceInput = screen.getByLabelText('edit.fields.price');
    await user.clear(priceInput);
    await user.type(priceInput, '31000');
    fireEvent.blur(priceInput);

    const saveButton = screen.getByRole('button', { name: 'edit.actions.save' });
    await waitFor(() => {
      expect(saveButton).not.toBeDisabled();
    });
    await user.click(saveButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/orders/${order.id}`,
        expect.objectContaining({
          method: 'PUT',
        }),
      );
    });
  });
});
