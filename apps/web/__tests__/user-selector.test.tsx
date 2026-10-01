import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import {
  UserSelector,
  userLabel,
  type UserOption,
} from '@/components/strategy/user-selector';

// Radix DropdownMenu relies on pointer-capture APIs that jsdom does not implement.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

/**
 * Rows shaped like the real prod data: a Sign in with Apple user whose display
 * name IS the private-relay address, plus two ordinary users.
 */
const USERS: UserOption[] = [
  {
    id: 'u-apple',
    name: '4tgvw22pyz@privaterelay.appleid.com',
    email: '4tgvw22pyz@privaterelay.appleid.com',
  },
  { id: 'u-ihsueh', name: 'iTrade iHsueh', email: 'itrade.ihsueh@gmail.com' },
  { id: 'u-rihong', name: 'Lai Rihong', email: '88411160@qq.com' },
];

describe('userLabel', () => {
  it('does not repeat the address when name equals email', () => {
    const label = userLabel(USERS[0]);
    expect(label).toBe('4tgvw22pyz@privaterelay.appleid.com');
    expect(label.split('@')).toHaveLength(2);
  });

  it('appends the email when it adds information', () => {
    expect(userLabel(USERS[1])).toBe('iTrade iHsueh — itrade.ihsueh@gmail.com');
  });

  it('falls back to the id when name and email are missing', () => {
    expect(userLabel({ id: 'u-x', name: null, email: '' })).toBe('u-x');
  });
});

describe('UserSelector', () => {
  it('renders the selected user in the trigger', () => {
    render(<UserSelector value="u-ihsueh" onValueChange={vi.fn()} users={USERS} />);
    expect(screen.getByRole('combobox')).toHaveTextContent(
      'iTrade iHsueh — itrade.ihsueh@gmail.com',
    );
  });

  it('renders the placeholder when nothing is selected', () => {
    render(
      <UserSelector
        value=""
        onValueChange={vi.fn()}
        users={USERS}
        placeholder="Select target user"
      />,
    );
    expect(screen.getByRole('combobox')).toHaveTextContent('Select target user');
  });

  it('lists every user once, searching by name or email, and reports the clicked id', async () => {
    const onValueChange = vi.fn();
    render(<UserSelector value="" onValueChange={onValueChange} users={USERS} />);

    await userEvent.click(screen.getByRole('combobox'));

    const list = await screen.findByRole('menu');
    // Apple-relay user: name == email, so the address must appear exactly once.
    expect(within(list).getAllByText('4tgvw22pyz@privaterelay.appleid.com')).toHaveLength(
      1,
    );
    expect(within(list).getByText('iTrade iHsueh')).toBeInTheDocument();
    expect(within(list).getByText('itrade.ihsueh@gmail.com')).toBeInTheDocument();

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Search users by name, email or id' }),
      'rihong',
    );
    expect(within(list).queryByText('iTrade iHsueh')).not.toBeInTheDocument();

    await userEvent.click(within(list).getByText('Lai Rihong'));
    expect(onValueChange).toHaveBeenCalledWith('u-rihong');
  });

  it('searches by email too', async () => {
    render(<UserSelector value="" onValueChange={vi.fn()} users={USERS} />);
    await userEvent.click(screen.getByRole('combobox'));
    const list = await screen.findByRole('menu');

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Search users by name, email or id' }),
      '88411160',
    );
    expect(within(list).getByText('Lai Rihong')).toBeInTheDocument();
    expect(within(list).queryByText('iTrade iHsueh')).not.toBeInTheDocument();
  });

  it('shows "No results found." for an unmatched search and the empty text for an empty list', async () => {
    const { unmount } = render(
      <UserSelector value="" onValueChange={vi.fn()} users={USERS} />,
    );
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Search users by name, email or id' }),
      'zzz',
    );
    expect(await screen.findByText('No results found.')).toBeInTheDocument();
    unmount();

    render(
      <UserSelector
        value=""
        onValueChange={vi.fn()}
        users={[]}
        emptyText="No users with a bound exchange account"
      />,
    );
    await userEvent.click(screen.getByRole('combobox'));
    expect(
      await screen.findByText('No users with a bound exchange account'),
    ).toBeInTheDocument();
  });

  it('renders an unresolvable value in the trigger instead of the placeholder', () => {
    render(
      <UserSelector
        value="u-gone"
        onValueChange={vi.fn()}
        users={USERS}
        placeholder="Select target user"
      />,
    );
    // The stale id is still submitted by the form, so the trigger must not look empty.
    expect(screen.getByRole('combobox')).toHaveTextContent('u-gone');
  });

  it('finds users by id, so rows without a name or email stay selectable', async () => {
    const onValueChange = vi.fn();
    render(
      <UserSelector
        value=""
        onValueChange={onValueChange}
        users={[...USERS, { id: 'u-noname', name: null, email: null }]}
      />,
    );
    await userEvent.click(screen.getByRole('combobox'));
    const list = await screen.findByRole('menu');

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Search users by name, email or id' }),
      'u-noname',
    );
    await userEvent.click(within(list).getByText('u-noname'));
    expect(onValueChange).toHaveBeenCalledWith('u-noname');
  });

  it('is keyboard operable: ArrowDown moves focus into the rows', async () => {
    render(<UserSelector value="" onValueChange={vi.fn()} users={USERS} />);
    await userEvent.click(screen.getByRole('combobox'));

    const search = await screen.findByRole('textbox', {
      name: 'Search users by name, email or id',
    });
    await userEvent.type(search, 'rihong');
    // ArrowDown must move focus off the search box: Radix rows are not Tab stops,
    // so this is the only keyboard path to a row.
    await userEvent.keyboard('{ArrowDown}');
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /Lai Rihong/ })).toHaveFocus();
  });

  it('selects the first match on Enter', async () => {
    const onValueChange = vi.fn();
    render(<UserSelector value="" onValueChange={onValueChange} users={USERS} />);
    await userEvent.click(screen.getByRole('combobox'));

    await userEvent.type(
      await screen.findByRole('textbox', { name: 'Search users by name, email or id' }),
      'ihsueh',
    );
    await userEvent.keyboard('{Enter}');
    expect(onValueChange).toHaveBeenCalledWith('u-ihsueh');
  });

  it('leaves Tab to Radix so focus stays trapped in the open menu', async () => {
    render(<UserSelector value="" onValueChange={vi.fn()} users={USERS} />);
    await userEvent.click(screen.getByRole('combobox'));
    const search = await screen.findByRole('textbox', {
      name: 'Search users by name, email or id',
    });

    // fireEvent returns false when the event was default-prevented. Radix's content
    // keydown calls preventDefault on Tab; the search box must not stop the event
    // from reaching it, or Tab would walk focus out of a still-open menu.
    expect(fireEvent.keyDown(search, { key: 'Tab' })).toBe(false);
  });

  it('still closes on Escape while the search box has focus', async () => {
    render(<UserSelector value="" onValueChange={vi.fn()} users={USERS} />);
    await userEvent.click(screen.getByRole('combobox'));
    expect(await screen.findByRole('menu')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('returns to the search box with ArrowUp from the first row', async () => {
    render(<UserSelector value="" onValueChange={vi.fn()} users={USERS} />);
    await userEvent.click(screen.getByRole('combobox'));
    const search = await screen.findByRole('textbox', {
      name: 'Search users by name, email or id',
    });

    await userEvent.keyboard('{ArrowDown}');
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /4tgvw22pyz/ })).toHaveFocus();

    await userEvent.keyboard('{ArrowUp}');
    expect(search).toHaveFocus();
  });

  it('pins a clearing option outside the search results', async () => {
    const onValueChange = vi.fn();
    render(
      <UserSelector
        value=""
        onValueChange={onValueChange}
        users={USERS}
        allOptionLabel="All Owners"
      />,
    );
    // The empty value is a real choice here, so the trigger must name it rather
    // than fall back to the placeholder.
    expect(screen.getByRole('combobox')).toHaveTextContent('All Owners');

    await userEvent.click(screen.getByRole('combobox'));
    const list = await screen.findByRole('menu');
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Search users by name, email or id' }),
      'zzz',
    );
    expect(await within(list).findByText('No results found.')).toBeInTheDocument();
    // Still one click away from the unfiltered list.
    expect(within(list).getByText('All Owners')).toBeInTheDocument();

    await userEvent.click(within(list).getByText('All Owners'));
    expect(onValueChange).toHaveBeenCalledWith('');
  });

  it('does not open while disabled', async () => {
    render(<UserSelector value="" onValueChange={vi.fn()} users={USERS} disabled />);
    await userEvent.click(screen.getByRole('combobox'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('does not render a search box when there are no users to search', async () => {
    render(<UserSelector value="" onValueChange={vi.fn()} users={[]} />);
    await userEvent.click(screen.getByRole('combobox'));
    expect(await screen.findByText('No users found.')).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Search users by name, email or id' }),
    ).not.toBeInTheDocument();
  });

  it('caps rendered rows and says how many are hidden', async () => {
    const many: UserOption[] = Array.from({ length: 130 }, (_, i) => ({
      id: `u-${i}`,
      name: `User ${i}`,
      email: `user${i}@example.com`,
    }));
    render(<UserSelector value="" onValueChange={vi.fn()} users={many} />);
    await userEvent.click(screen.getByRole('combobox'));
    const list = await screen.findByRole('menu');

    expect(within(list).getAllByRole('menuitem')).toHaveLength(100);
    expect(
      within(list).getByText('30 more hidden — refine your search'),
    ).toBeInTheDocument();
  });
});
