import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, MapPin, X } from 'lucide-react';
import type { PermissionGrantState } from '@roam/types';
import {
  ON_PRIMARY,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PRIMARY,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

type Props = {
  open: boolean;
  grantState: PermissionGrantState;
  loading: boolean;
  onClose: () => void;
  onAllow: () => void;
  onOpenSettings: () => void;
};

export function LocationPermissionSheet({
  open,
  grantState,
  loading,
  onClose,
  onAllow,
  onOpenSettings,
}: Props) {
  const { t } = useTranslation(['settings', 'common']);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const statusKey =
    grantState === 'granted'
      ? 'privacy.locationStatusGranted'
      : grantState === 'denied'
        ? 'privacy.locationStatusDenied'
        : grantState === 'prompt'
          ? 'privacy.locationStatusPrompt'
          : 'privacy.locationStatusUnsupported';

  const showAllow = !loading && grantState === 'prompt';
  const showOpenSettings = !loading && (grantState === 'denied' || grantState === 'granted');
  const primaryAction = showAllow ? onAllow : showOpenSettings ? onOpenSettings : undefined;
  const primaryLabel = showAllow
    ? t('privacy.locationAllowCta')
    : showOpenSettings
      ? grantState === 'granted'
        ? t('privacy.locationManageInSettingsCta')
        : t('privacy.locationOpenSettingsCta')
      : null;

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
        aria-labelledby="location-permission-title"
        className="relative w-full max-w-lg rounded-t-[24px] px-4 pb-8 pt-4 safe-x safe-b"
        style={{ backgroundColor: SURFACE_LOWEST }}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${PRIMARY}18` }}
            >
              <MapPin className="h-5 w-5" style={{ color: PRIMARY }} aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 id="location-permission-title" className="text-lg font-semibold" style={{ color: ON_SURFACE }}>
                {t('privacy.locationSheetTitle')}
              </h2>
              <p className="mt-1 text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                {t('privacy.locationSheetDescription')}
              </p>
            </div>
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

        <div className="mb-6 flex items-center gap-2">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" style={{ color: PRIMARY }} aria-hidden />
              <span className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                {t('common:loading')}
              </span>
            </>
          ) : (
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{
                backgroundColor:
                  grantState === 'granted' ? `${PRIMARY}18` : `${OUTLINE_VARIANT}40`,
                color: grantState === 'granted' ? PRIMARY : ON_SURFACE_VARIANT,
              }}
            >
              {t(statusKey)}
            </span>
          )}
        </div>

        {primaryLabel && primaryAction ? (
          <button
            type="button"
            onClick={primaryAction}
            className="flex h-12 w-full items-center justify-center rounded-2xl text-sm font-semibold transition-opacity active:opacity-90"
            style={{ backgroundColor: PRIMARY, color: ON_PRIMARY }}
          >
            {primaryLabel}
          </button>
        ) : null}

        {!loading && grantState === 'unsupported' ? (
          <p className="text-center text-sm" style={{ color: ON_SURFACE_VARIANT }}>
            {t('privacy.locationWebDeniedHint')}
          </p>
        ) : null}

        <div
          className="mx-auto mt-3 h-1 w-10 rounded-full"
          style={{ backgroundColor: OUTLINE_VARIANT }}
          aria-hidden
        />
      </div>
    </div>
  );
}
