import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, resolveLocale } from '@/lib/locales';
import enGB from './locales/en-GB.json';
import es from './locales/es.json';

function readStoredLocale(): string {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY) ?? DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    'en-GB': enGB,
    es,
  },
  lng: resolveLocale(readStoredLocale()),
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: ['en-GB', 'es'],
  defaultNS: 'common',
  ns: ['common', 'settings', 'account', 'profile', 'auth', 'services', 'activity', 'home', 'ride', 'booking', 'wallet', 'contacts', 'support', 'haulage'],
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
  returnEmptyString: false,
});

export default i18n;
