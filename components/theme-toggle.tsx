'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';

export function ThemeToggle({
  className,
  showLabel = false,
  variant = 'default',
}: {
  className?: string;
  showLabel?: boolean;
  variant?: 'default' | 'footer';
}) {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';
  const label = dark ? 'Light mode' : 'Dark mode';

  return (
    <button
      aria-label={`Switch to ${label.toLowerCase()}`}
      className={cn(
        'theme-toggle inline-flex min-h-9 items-center justify-center gap-2 rounded-md border px-2.5 text-sm font-medium transition',
        variant === 'footer'
          ? 'border-white/15 bg-transparent text-white/60 hover:border-white/25 hover:bg-white/5 hover:text-white'
          : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50 hover:text-ink-950',
        !showLabel && 'h-9 w-9 px-0',
        className
      )}
      onClick={toggleTheme}
      title={`Switch to ${label.toLowerCase()}`}
      type="button"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {showLabel && <span>{label}</span>}
    </button>
  );
}
