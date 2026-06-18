import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'preference_dark_mode';
export const PORTAL_THEME_EVENT = 'roam-portal-theme-change';

export function readPortalThemePreference(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored !== null) return stored === 'true';
  return true;
}

export function applyPortalTheme(isDark: boolean): void {
  const root = document.documentElement;
  if (isDark) {
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
  }
  localStorage.setItem(STORAGE_KEY, String(isDark));
  window.dispatchEvent(new CustomEvent(PORTAL_THEME_EVENT, { detail: { isDark } }));
}

/** Call before React mounts to avoid a light/dark flash. */
export function initPortalTheme(): void {
  applyPortalTheme(readPortalThemePreference());
}

export function usePortalTheme() {
  const [isDark, setIsDark] = useState(() => readPortalThemePreference());

  useEffect(() => {
    const onThemeChange = (event: Event) => {
      const detail = (event as CustomEvent<{ isDark: boolean }>).detail;
      if (detail && typeof detail.isDark === 'boolean') {
        setIsDark(detail.isDark);
      } else {
        setIsDark(readPortalThemePreference());
      }
    };
    window.addEventListener(PORTAL_THEME_EVENT, onThemeChange);
    return () => window.removeEventListener(PORTAL_THEME_EVENT, onThemeChange);
  }, []);

  const setDarkMode = useCallback((next: boolean) => {
    applyPortalTheme(next);
    setIsDark(next);
  }, []);

  return { isDark, setDarkMode };
}
