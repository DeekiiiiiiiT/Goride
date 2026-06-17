/** BCP-47 locale tags supported by the passenger app.
 *  To add a locale: extend SupportedLocale, SUPPORTED_LOCALES, add locales/<tag>.json,
 *  register in src/i18n/index.ts (resources + supportedLngs), and update index.html bootstrap allowlist.
 */
export type SupportedLocale = 'en-GB' | 'es';

export const LOCALE_STORAGE_KEY = 'roam-passenger-locale';

export const DEFAULT_LOCALE: SupportedLocale = 'en-GB';

export type LocaleDefinition = {
  id: SupportedLocale;
  labelKey: string;
  nativeLabel: string;
};

export const SUPPORTED_LOCALES: readonly LocaleDefinition[] = [
  { id: 'en-GB', labelKey: 'languages.enGB', nativeLabel: 'English (UK)' },
  { id: 'es', labelKey: 'languages.es', nativeLabel: 'Español' },
] as const;

const SUPPORTED_SET = new Set<string>(SUPPORTED_LOCALES.map((l) => l.id));

export function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  return typeof value === 'string' && SUPPORTED_SET.has(value);
}

export function resolveLocale(value: string | null | undefined): SupportedLocale {
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}

export function getLocaleDefinition(id: SupportedLocale): LocaleDefinition {
  const found = SUPPORTED_LOCALES.find((l) => l.id === id);
  return found ?? SUPPORTED_LOCALES[0];
}

export function formatLocaleDisplayName(
  localeId: SupportedLocale,
  displayIn?: SupportedLocale,
): string {
  try {
    const tag = localeId;
    const displayNames = new Intl.DisplayNames([displayIn ?? localeId], { type: 'language' });
    const name = displayNames.of(tag);
    if (name) return name;
  } catch {
    /* ignore */
  }
  return getLocaleDefinition(localeId).nativeLabel;
}
