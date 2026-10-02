import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TradeModeDialog } from '../components/trade-mode-dialog';

/**
 * The position page's margin-mode entry: exchange → perpetual pair → mode.
 *
 * The guard the operators asked for is the point of these tests — a pair that
 * still has a position must be flagged and blocked *before* the request, and
 * the API's 409 rejections (position / open orders) must surface as the
 * "close and cancel first" copy rather than a raw exchange error.
 */

const toastSuccess = vi.fn();

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value?: string;
    onValueChange?: (value: string) => void;
    disabled?: boolean;
    children?: React.ReactNode;
  }) => (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onValueChange?.(event.target.value)}
    >
      <option value="" />
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open?: boolean; children?: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogFooter: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

const ACCOUNTS = [
  { exchange: 'binance', isActive: true },
  { exchange: 'okx', isActive: true },
  { exchange: 'coinbase', isActive: true },
];

const PAIRS = [
  {
    symbol: 'WLD/USDC:USDC',
    baseAsset: 'WLD',
    quoteAsset: 'USDC',
    type: 'perpetual',
    exchange: 'binance',
  },
  {
    symbol: 'WLD/USDC',
    baseAsset: 'WLD',
    quoteAsset: 'USDC',
    type: 'spot',
    exchange: 'binance',
  },
];

function mockFetch(
  tradeModeResponse: { ok: boolean; status?: number; body?: unknown } = {
    ok: true,
    body: { exchange: 'binance', symbol: 'WLD/USDC:USDC', marginMode: 'cross' },
  },
) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.startsWith('/api/accounts')) {
      return { ok: true, json: async () => ACCOUNTS } as Response;
    }
    if (url.startsWith('/api/trading-pairs')) {
      return { ok: true, json: async () => PAIRS } as Response;
    }
    if (url.startsWith('/api/exchange/trade-mode')) {
      // GET reads the symbol's current mode, POST performs the switch. Answer
      // them separately so a rejected switch cannot also fail the initial read.
      if ((init?.method ?? 'GET').toUpperCase() !== 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            exchange: 'binance',
            symbol: 'WLD/USDC:USDC',
            marginMode: 'cross',
          }),
        } as Response;
      }
      return {
        ok: tradeModeResponse.ok,
        status: tradeModeResponse.status ?? 200,
        json: async () => tradeModeResponse.body ?? {},
      } as Response;
    }

    throw new Error(`Unexpected fetch: ${url}`);
  });
}

async function selectPairAndMode() {
  const user = userEvent.setup();
  const selects = screen.getAllByRole('combobox');

  await waitFor(() => {
    expect(selects[0]).toHaveValue('binance');
  });
  await waitFor(() => {
    expect(
      Array.from((selects[1] as HTMLSelectElement).options).map((option) => option.value),
    ).toContain('WLD/USDC:USDC');
  });

  // only Binance exposes a margin-mode switch API — OKX/Coinbase must not appear
  const exchangeOptions = Array.from((selects[0] as HTMLSelectElement).options).map(
    (option) => option.value,
  );
  expect(exchangeOptions).toContain('binance');
  // OKX (no margin-mode switch endpoint) and Coinbase (cross-only perps) are
  // intentionally absent even though the account list contains them.
  expect(exchangeOptions).not.toContain('okx');
  expect(exchangeOptions).not.toContain('coinbase');

  await user.selectOptions(selects[1], 'WLD/USDC:USDC');
  await user.selectOptions(selects[2], 'isolated');

  return { user, selects };
}

describe('TradeModeDialog', () => {
  beforeEach(() => {
    toastSuccess.mockReset();
    global.fetch = mockFetch();
  });

  it('asks for close + cancel first and blocks the confirm when the pair has a position', async () => {
    render(
      <TradeModeDialog
        open
        onOpenChange={() => {}}
        positions={[{ exchange: 'binance', symbol: 'WLD/USDC:USDC' }]}
      />,
    );

    await selectPairAndMode();

    expect(screen.getByText('errors.positionOpen')).toBeInTheDocument();
    const confirm = screen.getByText('actions.confirm').closest('button');
    expect(confirm?.disabled).toBe(true);
    expect(global.fetch).not.toHaveBeenCalledWith(
      '/api/exchange/trade-mode',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('submits the switch for a flat pair and reports success', async () => {
    render(<TradeModeDialog open onOpenChange={() => {}} positions={[]} />);

    const { user } = await selectPairAndMode();
    await user.click(screen.getByText('actions.confirm'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/exchange/trade-mode',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            exchange: 'binance',
            symbol: 'WLD/USDC:USDC',
            tradeMode: 'isolated',
          }),
        }),
      );
    });
    expect(toastSuccess).toHaveBeenCalledTimes(1);
  });

  it('surfaces an open-orders rejection from the API as the cancel-first copy', async () => {
    global.fetch = mockFetch({
      ok: false,
      status: 409,
      body: {
        error: 'WLD/USDC:USDC still has 2 open order(s) on binance',
        code: 'open-orders',
      },
    });

    render(<TradeModeDialog open onOpenChange={() => {}} positions={[]} />);

    const { user } = await selectPairAndMode();
    await user.click(screen.getByText('actions.confirm'));

    await waitFor(() => {
      expect(screen.getByText('errors.openOrders')).toBeInTheDocument();
    });
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('surfaces the account-level Multi-Assets refusal with its own copy', async () => {
    // Binance -4168 on a flat symbol: nothing to close or cancel, the ACCOUNT
    // setting blocks isolated margin. Showing the generic "failed to switch"
    // here is what the operator hit in prod, so the code must have its own copy.
    global.fetch = mockFetch({
      ok: false,
      status: 409,
      body: {
        error:
          'Binance refused the margin-mode switch for WLDUSDC: the account is in Multi-Assets mode (code -4168)',
        code: 'multi-assets-mode',
      },
    });

    render(<TradeModeDialog open onOpenChange={() => {}} positions={[]} />);

    const { user } = await selectPairAndMode();
    await user.click(screen.getByText('actions.confirm'));

    await waitFor(() => {
      expect(screen.getByText('errors.multiAssetsMode')).toBeInTheDocument();
    });
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('flags a position reported in the raw exchange symbol format', async () => {
    render(
      <TradeModeDialog
        open
        onOpenChange={() => {}}
        // The page's positions carry unified symbols today; the comparison is
        // canonical so a raw WLDUSDC cannot silently skip the warning.
        positions={[{ exchange: 'binance', symbol: 'WLDUSDC' }]}
      />,
    );

    await selectPairAndMode();

    expect(screen.getByText('errors.positionOpen')).toBeInTheDocument();
    const confirm = screen.getByText('actions.confirm').closest('button');
    expect(confirm?.disabled).toBe(true);
  });
});
