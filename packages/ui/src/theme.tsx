'use client';

import { Moon, Sun } from 'lucide-react';
import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes';
import type { ReactNode } from 'react';

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <button
      aria-label="Toggle light or dark theme"
      className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      type="button"
    >
      <Sun aria-hidden="true" className="h-5 w-5 dark:hidden" />
      <Moon aria-hidden="true" className="hidden h-5 w-5 dark:block" />
    </button>
  );
}
