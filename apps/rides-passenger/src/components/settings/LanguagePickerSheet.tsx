import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';
import {
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PRIMARY,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';
import {
  SUPPORTED_LOCALES,
  type SupportedLocale,
  formatLocaleDisplayName,
  getLocaleDefinition,
} from '@/lib/locales';

type Props = {
  open: boolean;
  value: SupportedLocale;
  onClose: () => void;
  onSelect: (locale: SupportedLocale) => void;
};

export function LanguagePickerSheet({ open, value, onClose, onSelect }: Props) {
  const { t, i18n } = useTranslation(['settings', 'common']);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const handleSelect = (locale: SupportedLocale) => {
    if (locale === value) {
      onClose();
      return;
    }
    onSelect(locale);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label={t('common:close')}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="language-picker-title"
        className="relative w-full max-w-lg rounded-t-[24px] px-4 pb-8 pt-4 safe-x safe-b"
        style={{ backgroundColor: SURFACE_LOWEST }}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 id="language-picker-title" className="text-lg font-semibold" style={{ color: ON_SURFACE }}>
              {t('settings:preferences.pickerTitle')}
            </h2>
            <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
              {t('settings:preferences.pickerDescription')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 transition-opacity active:opacity-70"
            style={{ color: ON_SURFACE_VARIANT }}
            aria-label={t('common:close')}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <ul className="flex flex-col gap-1" role="listbox" aria-label={t('settings:preferences.pickerTitle')}>
          {SUPPORTED_LOCALES.map((entry) => {
            const selected = entry.id === value;
            const displayName =
              formatLocaleDisplayName(entry.id, i18n.language as SupportedLocale) ||
              t(`common:languages.${entry.id === 'en-GB' ? 'enGB' : entry.id}`, {
                defaultValue: getLocaleDefinition(entry.id).nativeLabel,
              });
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => handleSelect(entry.id)}
                  className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition-colors active:opacity-80"
                  style={{
                    backgroundColor: selected ? `${PRIMARY}14` : 'transparent',
                    color: ON_SURFACE,
                  }}
                >
                  <span className="font-medium">{displayName}</span>
                  {selected ? <Check className="h-5 w-5 shrink-0" style={{ color: PRIMARY }} aria-hidden /> : null}
                </button>
              </li>
            );
          })}
        </ul>

        <div
          className="mx-auto mt-3 h-1 w-10 rounded-full"
          style={{ backgroundColor: OUTLINE_VARIANT }}
          aria-hidden
        />
      </div>
    </div>
  );
}
