import React, {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import i18n from '@/i18n';
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  type SupportedLocale,
  formatLocaleDisplayName,
  getLocaleDefinition,
  resolveLocale,
} from '@/lib/locales';

type LocaleContextValue = {
  locale: SupportedLocale;
  localeLabel: string;
  setLocale: (locale: SupportedLocale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readStoredLocale(): SupportedLocale {
  try {
    return resolveLocale(localStorage.getItem(LOCALE_STORAGE_KEY));
  } catch {
    return DEFAULT_LOCALE;
  }
}

function applyLocaleToDocument(locale: SupportedLocale) {
  document.documentElement.lang = locale;
  document.documentElement.dataset.locale = locale;
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(readStoredLocale);

  useLayoutEffect(() => {
    applyLocaleToDocument(locale);
    void i18n.changeLanguage(locale);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      /* ignore */
    }
  }, [locale]);

  const setLocale = useCallback((next: SupportedLocale) => {
    setLocaleState(next);
  }, []);

  const localeLabel = useMemo(
    () => formatLocaleDisplayName(locale, locale) || getLocaleDefinition(locale).nativeLabel,
    [locale],
  );

  const value = useMemo(
    () => ({ locale, localeLabel, setLocale }),
    [locale, localeLabel, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useLocale must be used within LocaleProvider');
  }
  return ctx;
}

/** Apply stored locale before React hydrates (see index.html). */
export function bootstrapLocaleFromStorage() {
  const locale = readStoredLocale();
  applyLocaleToDocument(locale);
}
