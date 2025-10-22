'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

export function ThemeSwitcher() {
  const { theme, setTheme, systemTheme } = useTheme();

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
      {currentTheme === 'light' ? (
        <Moon className="size-5" />
      ) : (
        <Sun className="size-5" />
      )}
    </Button>
  );
}
