import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { SupportedExchange } from '@itrade/data-manager/constants';

import { SymbolSelector } from '../components/strategy/symbol-selector';
import { getDisplaySymbol, type TradingPair } from '../lib/exchanges';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// `next/image` inside SymbolIcon adds nothing to these assertions.
vi.mock('@/components/symbol-icon', () => ({
  SymbolIcon: () => <span />,
}));

const PAIRS: TradingPair[] = [
  {
    symbol: 'BTC/USDT',
    base: 'BTC',
    quote: 'USDT',
    name: 'Bitcoin',
    type: 'spot',
    exchange: SupportedExchange.BINANCE,
  },
  {
    symbol: 'ZAMA/USDT',
    base: 'ZAMA',
    quote: 'USDT',
    name: 'Zama',
    type: 'spot',
    exchange: SupportedExchange.BINANCE,
  },
];

const searchBox = () => screen.getByRole('textbox');

describe('SymbolSelector search box', () => {
  it('filters the rows as the query is typed and keeps focus in the box', async () => {
    render(<SymbolSelector value="" onValueChange={vi.fn()} pairs={PAIRS} />);
    await userEvent.click(screen.getByRole('combobox'));

    const search = searchBox();
    await userEvent.type(search, 'zam');

    const menu = screen.getByRole('menu');
    expect(
      within(menu).getByText(getDisplaySymbol('ZAMA/USDT', 'binance')),
    ).toBeInTheDocument();
    expect(
      within(menu).queryByText(getDisplaySymbol('BTC/USDT', 'binance')),
    ).not.toBeInTheDocument();
    // The point of swallowing single character keys: Radix's typeahead would have
    // moved focus onto a matching row after the first letter.
    expect(search).toHaveFocus();
  });

  it('leaves Tab to Radix so focus stays trapped in the open menu', async () => {
    render(<SymbolSelector value="" onValueChange={vi.fn()} pairs={PAIRS} />);
    await userEvent.click(screen.getByRole('combobox'));
    const search = searchBox();

    // `fireEvent` returns false when the event was default-prevented, which is how
    // Radix's MenuContentImpl keeps Tab from walking focus out of an open menu. A
    // blanket stopPropagation on the input hid that handler from the event.
    expect(fireEvent.keyDown(search, { key: 'Tab' })).toBe(false);
  });

  it('selects the pair that was clicked', async () => {
    const onValueChange = vi.fn();
    render(<SymbolSelector value="" onValueChange={onValueChange} pairs={PAIRS} />);
    await userEvent.click(screen.getByRole('combobox'));

    await userEvent.click(
      within(screen.getByRole('menu')).getByText(
        getDisplaySymbol('ZAMA/USDT', 'binance'),
      ),
    );

    expect(onValueChange).toHaveBeenCalledWith('ZAMA/USDT');
  });
});
