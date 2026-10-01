'use client';

import * as React from 'react';
import { IconSearch, IconChevronDown, IconCheck } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface UserOption {
  id: string;
  /** Optional/null-tolerant so callers can pass rows from either user API shape. */
  name?: string | null;
  email?: string | null;
}

interface UserSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  users: UserOption[];
  placeholder?: string;
  /** Shown when `users` is empty (no search applied). */
  emptyText?: string;
  /**
   * Label for a pinned first row that clears the selection (empty value), e.g.
   * `All Owners` for the strategies filter. It sits outside the search filter —
   * it is the way back to the unfiltered list, so it must not disappear because
   * the query doesn't happen to match its label.
   */
  allOptionLabel?: string;
  /** Blocks opening, e.g. while the candidate list is still loading. */
  disabled?: boolean;
  /**
   * Extra classes for the trigger button. Toolbar callers need a fixed width and
   * the shorter `h-9` control height; the dialog inherits the `SymbolSelector`
   * trigger as-is.
   */
  triggerClassName?: string;
}

/**
 * How many rows to mount at once. The narrowed candidate set is small, but the
 * owners-lookup fallback passes every user (~1000), and mounting that many Radix
 * menu items on open costs visible jank. The remainder is reachable by searching.
 */
const MAX_VISIBLE_ROWS = 100;

/**
 * Split a user into the line to show and the line that adds information.
 *
 * Users created through Sign in with Apple carry an anonymous
 * `…@privaterelay.appleid.com` address AND that same string as their display
 * name, so a naive `${name} — ${email}` printed the address twice. The email is
 * therefore only kept when it differs from the name.
 */
function userLabels(user: UserOption): { primary: string; secondary: string | null } {
  const name = (user.name ?? '').trim();
  const email = (user.email ?? '').trim();
  const primary = name || email || user.id;
  const secondary = email && email.toLowerCase() !== primary.toLowerCase() ? email : null;
  return { primary, secondary };
}

/** Single-line label, e.g. `iTrade iHsueh — itrade.ihsueh@gmail.com`. */
export function userLabel(user: UserOption): string {
  const { primary, secondary } = userLabels(user);
  return secondary ? `${primary} — ${secondary}` : primary;
}

/**
 * Searchable user picker — the same interaction and styling as the trading-pair
 * `SymbolSelector` used by the create-strategy modal (outline combobox trigger,
 * search box pinned inside the dropdown, check mark on the selected row), so the
 * admin clone dialog and the console dialogs feel like one system. The search
 * lives INSIDE the dropdown; an extra filter input above it reads as a second,
 * non-functional field.
 *
 * Kept as a sibling of `SymbolSelector` rather than one shared generic: the pair
 * version renders exchange icons and resolves display symbols, which have no
 * user analogue, so merging them would only add a generic layer both call sites
 * have to thread types through.
 */
export function UserSelector({
  value,
  onValueChange,
  users,
  placeholder,
  emptyText = 'No users found.',
  allOptionLabel,
  disabled = false,
  triggerClassName,
}: UserSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) {
      setSearch('');
      return;
    }
    // Focus the search input with a slight delay to ensure the dropdown is mounted.
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
    // Cleared on close so a menu closed in the same tick cannot steal focus back.
    return () => clearTimeout(timer);
  }, [open]);

  // `id` is searchable too: users with neither name nor email are labelled by id,
  // and without this they would become unreachable as soon as a query is typed.
  const filteredUsers = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.name ?? '').toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q),
    );
  }, [users, search]);

  const visibleUsers = filteredUsers.slice(0, MAX_VISIBLE_ROWS);
  const hiddenCount = filteredUsers.length - visibleUsers.length;

  // Look the selection up in the FULL list (not the filtered one) so the trigger
  // keeps rendering the chosen user while a search term narrows the rows.
  const selectedUser = React.useMemo(
    () => users.find((u) => u.id === value),
    [users, value],
  );

  // If the value cannot be resolved (e.g. the candidate set narrowed after it was
  // set), show the raw value rather than the placeholder — the form still submits
  // it, and an empty-looking trigger would hide that from the admin.
  // An empty value means "no user picked". With `allOptionLabel` that is a real
  // choice to display (`All Owners`); without it, the field is simply unset and the
  // placeholder is the honest rendering.
  const triggerText = selectedUser
    ? userLabel(selectedUser)
    : value
      ? value
      : (allOptionLabel ?? null);

  const commitSelection = (id: string) => {
    onValueChange(id);
    setOpen(false);
    setSearch('');
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = filteredUsers[0];
      if (!first) return;
      commitSelection(first.id);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      // No stopPropagation needed: Radix's own arrow handling bails out when
      // `event.target !== content` (react-menu MenuContentImpl keydown), and the
      // target here is this input, so the two never race.
      const items = listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
      if (!items?.length) return;
      const target = e.key === 'ArrowDown' ? items[0] : items[items.length - 1];
      target.focus();
      return;
    }
    // Swallow ONLY what Radix would otherwise consume as typeahead: its content
    // keydown runs `handleTypeaheadSearch` for single character keys and would jump
    // focus onto a matching row mid-word. Everything else is left alone so the menu
    // keeps its normal keyboard contract — Tab is cancelled by that same Radix
    // handler to keep focus trapped in the open menu, and Escape reaches Radix's
    // document-level listener either way. A blanket stopPropagation here silently
    // disabled the Tab trap.
    const isTypeaheadKey = e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey;
    if (isTypeaheadKey) e.stopPropagation();
  };

  // Walking off either end of the list returns to the search box. Without it a
  // keyboard user who reached a row can only change the query by closing and
  // reopening the menu (typing while a row has focus hits Radix typeahead).
  const handleListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    if (!inputRef.current) return;
    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (index === -1) return;
    const atEdge = e.key === 'ArrowUp' ? index === 0 : index === items.length - 1;
    if (!atEdge) return;
    e.preventDefault();
    e.stopPropagation();
    inputRef.current.focus();
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      {/* `disabled` goes to BOTH Radix and the button: Radix gates its own
          pointerdown on its prop (a disabled child button alone does not stop it
          opening), and the button carries the disabled semantics/styling. */}
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal h-10 px-3 bg-background border-input',
            triggerClassName,
          )}
        >
          {triggerText ? (
            <span className="truncate">{triggerText}</span>
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
        {/* No search box when there is nothing to search: a focusable field over an
            empty list is a dead control, and it steals the opening focus. */}
        {users.length > 0 && (
          <div
            className="flex items-center border-b px-3 py-2 sticky top-0 bg-popover z-10"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <IconSearch className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Input
              ref={inputRef}
              placeholder="Search name, email or id..."
              aria-label="Search users by name, email or id"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="flex h-8 w-full rounded-md bg-transparent py-2 text-sm outline-none border-none focus-visible:ring-0 px-0"
            />
          </div>
        )}
        <div
          ref={listRef}
          onKeyDown={handleListKeyDown}
          className="max-h-[300px] overflow-y-auto p-1 custom-scrollbar"
        >
          {/* Pinned outside the search results: the unfiltered list has to stay one
              click away even when the query matches nothing. */}
          {allOptionLabel && (
            <DropdownMenuItem
              onSelect={() => commitSelection('')}
              className="flex items-center justify-between gap-2 px-2 py-2 cursor-pointer"
            >
              <span className="font-medium truncate">{allOptionLabel}</span>
              {value === '' && <IconCheck className="h-4 w-4 text-primary shrink-0" />}
            </DropdownMenuItem>
          )}
          {users.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {emptyText}
            </div>
          )}
          {users.length > 0 && filteredUsers.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No results found.
            </div>
          )}
          {visibleUsers.map((user) => {
            const { primary, secondary } = userLabels(user);
            return (
              <DropdownMenuItem
                key={user.id}
                onSelect={() => commitSelection(user.id)}
                className="flex items-center justify-between gap-2 px-2 py-2 cursor-pointer"
              >
                <div className="flex flex-col truncate">
                  <span className="font-medium truncate">{primary}</span>
                  {secondary && (
                    <span className="text-xs text-muted-foreground truncate">
                      {secondary}
                    </span>
                  )}
                </div>
                {value === user.id && (
                  <IconCheck className="h-4 w-4 text-primary shrink-0" />
                )}
              </DropdownMenuItem>
            );
          })}
          {hiddenCount > 0 && (
            <div className="p-2 text-center text-xs text-muted-foreground">
              {hiddenCount} more hidden — refine your search
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
