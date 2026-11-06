import { useState } from 'react';
import type { ChangeEvent } from 'react';

type Theme = 'system' | 'light' | 'dark';

const THEME_STORAGE_KEY = 'ff.theme';

function isTheme(value: string): value is Theme {
  return value === 'system' || value === 'light' || value === 'dark';
}

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored && isTheme(stored)) {
    return stored;
  }
  return 'system';
}

function applyTheme(theme: Theme): void {
  if (theme === 'system') {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextTheme = event.target.value;
    if (!isTheme(nextTheme)) {
      return;
    }
    setTheme(nextTheme);
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
  }

  return (
    <label className="relative flex items-center">
      <span className="sr-only">Theme</span>
      <select
        className="h-8 cursor-pointer appearance-none rounded-md border border-header-control-border bg-header-control pr-7 pl-2.5 text-xs font-medium text-header-fg transition-colors hover:border-header-muted focus:outline-none"
        data-testid="theme-select"
        value={theme}
        onChange={handleChange}
      >
        <option className="bg-surface text-text" value="system">
          System
        </option>
        <option className="bg-surface text-text" value="light">
          Light
        </option>
        <option className="bg-surface text-text" value="dark">
          Dark
        </option>
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 fill-none stroke-header-muted"
        strokeWidth={2}
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </label>
  );
}
