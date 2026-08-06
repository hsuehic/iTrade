'use client';

import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

const emptySubscribe = () => () => {};

export function ThemeSwitcher() {
  const { theme, setTheme, systemTheme } = useTheme();

  // Avoid hydration mismatch: theme is only known on the client.
  // useSyncExternalStore returns false on the server and true on the client.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  // Determine the current effective theme
  const currentTheme = theme === 'system' ? systemTheme : theme;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(currentTheme === 'light' ? 'dark' : 'light')}
      aria-label="Toggle theme"
      suppressHydrationWarning
    >
      {mounted ? (
        currentTheme === 'light' ? (
          <Moon className="size-5" />
        ) : (
          <Sun className="size-5" />
        )
      ) : (
        // SSR / pre-hydration placeholder — matches server render exactly
        <span className="size-5" aria-hidden="true" />
      )}
    </Button>
  );
}
