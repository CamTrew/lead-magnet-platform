'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type Theme = 'light' | 'dark';
export type ThemePreference = 'system' | Theme;

type ThemeContextValue = {
  theme: Theme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'magnets-theme';

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    setPreferenceState(saved === 'light' || saved === 'dark' ? saved : 'system');
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const resolveTheme = () => preference === 'system'
      ? (media.matches ? 'dark' : 'light')
      : preference;
    const syncTheme = () => {
      const next = resolveTheme();
      setTheme(next);
      applyTheme(next);
    };

    if (preference === 'system') {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, preference);
    }
    syncTheme();

    media.addEventListener('change', syncTheme);
    return () => media.removeEventListener('change', syncTheme);
  }, [preference]);

  const toggleTheme = useCallback(() => {
    setPreferenceState(theme === 'dark' ? 'light' : 'dark');
  }, [theme]);

  const value = useMemo(
    () => ({ theme, toggleTheme }),
    [theme, toggleTheme]
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
