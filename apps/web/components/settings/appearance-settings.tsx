'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Check, Moon, Sun, Monitor, Palette } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

type ThemeOption = 'light' | 'dark' | 'system';

interface ThemeConfig {
  value: ThemeOption;
  label: string;
  icon: typeof Sun;
  description: string;
}

const themeOptions: ThemeConfig[] = [
  {
    value: 'light',
    label: 'Light',
    icon: Sun,
    description: 'A bright, clean appearance for daytime use',
  },
  {
    value: 'dark',
    label: 'Dark',
    icon: Moon,
    description: 'A darker palette that reduces eye strain',
  },
  {
    value: 'system',
    label: 'System',
    icon: Monitor,
    description: 'Automatically match your device settings',
  },
];

// Use useSyncExternalStore for SSR-safe mounting detection
const emptySubscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function AppearanceSettings() {
  const { theme, setTheme, systemTheme } = useTheme();

  // Avoid hydration mismatch using useSyncExternalStore
  const mounted = useSyncExternalStore(emptySubscribe, getSnapshot, getServerSnapshot);

  if (!mounted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="size-5" />
            Appearance
          </CardTitle>
          <CardDescription>Customize the appearance of the application.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            {themeOptions.map((option) => (
              <div
                key={option.value}
                className="h-32 rounded-lg bg-muted animate-pulse"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentTheme = theme || 'system';
  const effectiveTheme = currentTheme === 'system' ? systemTheme : currentTheme;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="size-5" />
          Appearance
        </CardTitle>
        <CardDescription>
          Customize the appearance of the application. Choose your preferred theme.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Theme Selection */}
        <div className="space-y-4">
          <Label>Theme</Label>
          <div className="grid gap-4 sm:grid-cols-3">
            {themeOptions.map((option) => {
              const Icon = option.icon;
              const isSelected = currentTheme === option.value;

              return (
                <Button
                  key={option.value}
                  variant="outline"
                  className={cn(
                    'relative h-auto flex-col items-start gap-2 p-4',
                    isSelected && 'border-primary bg-primary/5',
                  )}
                  onClick={() => setTheme(option.value)}
                >
                  <div className="flex w-full items-center justify-between">
                    <Icon className="size-5" />
                    {isSelected && <Check className="size-4 text-primary" />}
                  </div>
                  <div className="text-left">
                    <p className="font-medium">{option.label}</p>
                    <p className="text-xs text-muted-foreground">{option.description}</p>
                  </div>
                </Button>
              );
            })}
          </div>
        </div>

        {/* Current Theme Info */}
        <div className="rounded-lg border bg-muted/50 p-4">
          <div className="flex items-center gap-3">
            {effectiveTheme === 'dark' ? (
              <Moon className="size-5" />
            ) : (
              <Sun className="size-5" />
            )}
            <div>
              <p className="text-sm font-medium">
                Currently using {effectiveTheme} theme
              </p>
              <p className="text-xs text-muted-foreground">
                {currentTheme === 'system'
                  ? `Following your system preference (${systemTheme})`
                  : 'Manually selected theme'}
              </p>
            </div>
          </div>
        </div>

        {/* Theme Preview */}
        <div className="space-y-4">
          <Label>Preview</Label>
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Light Preview */}
            <div
              className={cn(
                'rounded-lg border p-4 transition-opacity',
                effectiveTheme === 'dark' && 'opacity-50',
              )}
              style={{
                backgroundColor: '#ffffff',
                color: '#09090b',
                borderColor: '#e4e4e7',
              }}
            >
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Sun className="size-4" />
                  <span className="text-sm font-medium">Light Mode</span>
                </div>
                <div
                  className="h-2 w-3/4 rounded"
                  style={{ backgroundColor: '#e4e4e7' }}
                />
                <div
                  className="h-2 w-1/2 rounded"
                  style={{ backgroundColor: '#e4e4e7' }}
                />
                <div
                  className="mt-3 rounded px-3 py-1.5 text-xs inline-block"
                  style={{ backgroundColor: '#18181b', color: '#fafafa' }}
                >
                  Button
                </div>
              </div>
            </div>

            {/* Dark Preview */}
            <div
              className={cn(
                'rounded-lg border p-4 transition-opacity',
                effectiveTheme === 'light' && 'opacity-50',
              )}
              style={{
                backgroundColor: '#09090b',
                color: '#fafafa',
                borderColor: '#27272a',
              }}
            >
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Moon className="size-4" />
                  <span className="text-sm font-medium">Dark Mode</span>
                </div>
                <div
                  className="h-2 w-3/4 rounded"
                  style={{ backgroundColor: '#27272a' }}
                />
                <div
                  className="h-2 w-1/2 rounded"
                  style={{ backgroundColor: '#27272a' }}
                />
                <div
                  className="mt-3 rounded px-3 py-1.5 text-xs inline-block"
                  style={{ backgroundColor: '#fafafa', color: '#18181b' }}
                >
                  Button
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
