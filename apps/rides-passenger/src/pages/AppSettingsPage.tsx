import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ROAM_LEGAL, accountDeletionMailto } from '@roam/business-config/legalUrls';
import { openLegalDocument } from '@roam/ui';
import { useTheme } from '@/contexts/ThemeContext';
import { useLocale } from '@/contexts/LocaleContext';
import { LanguagePickerSheet } from '@/components/settings/LanguagePickerSheet';
import { LocationPermissionSheet } from '@/components/settings/LocationPermissionSheet';
import { useAppVersionInfo } from '@/hooks/useAppVersionLabel';
import { useGeolocationPermissionState } from '@/hooks/useGeolocationPermissionState';
import type { SupportedLocale } from '@/lib/locales';
import { openPassengerAppSettings } from '@/utils/passengerLocationAccess';
import { isNativeCapacitorPlatform, requestGeolocationPermission } from '@roam/types';
import {
  ArrowLeft,
  Bell,
  ChevronDown,
  ChevronRight,
  Database,
  ExternalLink,
  Globe,
  Info,
  Languages,
  Mail,
  MapPin,
  MessageSquare,
  Moon,
  Palette,
  Shield,
  Smartphone,
  Sun,
  SunDim,
} from 'lucide-react';

import {
  CARD_SHADOW,
  HEADER_BG,
  HIGHLIGHT_BG,
  ON_PRIMARY_FIXED_VARIANT,
  ON_SECONDARY_FIXED_VARIANT,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  ON_TERTIARY_FIXED_VARIANT,
  OUTLINE,
  OUTLINE_VARIANT,
  PAGE_BG,
  PRIMARY,
  PRIMARY_FIXED,
  SECONDARY,
  SECONDARY_FIXED,
  SURFACE_CONTAINER_HIGH,
  SURFACE_LOW,
  SURFACE_LOWEST,
  TERTIARY_FIXED,
} from '@/lib/passengerTheme';

function SectionHeader({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="mb-3 flex items-center gap-2 px-1">
      <span style={{ color: PRIMARY }}>{icon}</span>
      <h2
        className="text-xs font-bold uppercase tracking-wider"
        style={{ color: SECONDARY }}
      >
        {label}
      </h2>
    </div>
  );
}

function BentoCard({
  children,
  className = '',
  fullWidth = false,
  highlighted,
}: {
  children: React.ReactNode;
  className?: string;
  fullWidth?: boolean;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`rounded-[24px] p-5 transition-all active:scale-[0.98] ${fullWidth ? 'col-span-2' : ''} ${className}`}
      style={{
        backgroundColor: highlighted ? HIGHLIGHT_BG : SURFACE_LOWEST,
        boxShadow: CARD_SHADOW,
      }}
    >
      {children}
    </div>
  );
}

export default function AppSettingsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const { themeMode, setThemeMode } = useTheme();
  const { locale, localeLabel, setLocale } = useLocale();
  const appVersionInfo = useAppVersionInfo();
  const [languageSheetOpen, setLanguageSheetOpen] = useState(false);
  const [locationSheetOpen, setLocationSheetOpen] = useState(false);
  const { grantState, loading: locationLoading, refresh: refreshLocation, rowStatusLabelKey } =
    useGeolocationPermissionState(true);

  const notifySoon = () => {
    toast.message(tc('comingSoon'));
  };

  const handleLanguageSelect = (next: SupportedLocale) => {
    setLocale(next);
    toast.success(t('languageUpdated'));
  };

  const handleLocationAllow = async () => {
    const next = await requestGeolocationPermission();
    await refreshLocation();
    if (next === 'granted') {
      toast.success(t('privacy.locationAllowedToast'));
      return;
    }
    toast.message(t('privacy.locationDeniedToast'));
  };

  const handleLocationOpenSettings = async () => {
    if (isNativeCapacitorPlatform()) {
      await openPassengerAppSettings();
      return;
    }
    toast.message(t('privacy.locationWebDeniedHint'));
  };

  const handleLocationSheetOpen = () => {
    setLocationSheetOpen(true);
    void refreshLocation();
  };

  const themeOptions = [
    { id: 'light' as const, label: t('display.light'), icon: Sun },
    { id: 'dark' as const, label: t('display.dark'), icon: Moon },
    { id: 'auto' as const, label: t('display.auto'), icon: SunDim },
  ];

  return (
    <div
      className="flex min-h-[100dvh] flex-col pb-28"
      style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}
    >
      <header
        className="sticky top-0 z-50 flex h-16 w-full items-center px-4 backdrop-blur-md safe-t"
        style={{ backgroundColor: HEADER_BG }}
      >
        <div className="flex w-full items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/account')}
            className="passenger-row-hover rounded-full p-2 transition-colors active:opacity-70"
            style={{ color: PRIMARY }}
            aria-label={tc('backToAccount')}
          >
            <ArrowLeft className="h-6 w-6" strokeWidth={2} aria-hidden />
          </button>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: ON_SURFACE }}>
            {t('title')}
          </h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 safe-x">
        <div className="flex flex-col gap-6">
          <section>
            <SectionHeader icon={<Bell className="h-5 w-5" aria-hidden />} label={t('sections.notifications')} />
            <div
              className="overflow-hidden rounded-[24px]"
              style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
            >
              <div
                className="flex items-center justify-between border-b px-5 py-3"
                style={{ borderColor: OUTLINE_VARIANT }}
              >
                <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                  {t('notifications.summary')}
                </p>
                <span
                  className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--passenger-secondary) 12%, transparent)',
                    color: SECONDARY,
                  }}
                >
                  {tc('comingSoon')}
                </span>
              </div>
              {(
                [
                  {
                    icon: Smartphone,
                    label: t('notifications.push'),
                    description: t('notifications.pushDescription'),
                    iconBg: PRIMARY_FIXED,
                    iconColor: ON_PRIMARY_FIXED_VARIANT,
                  },
                  {
                    icon: Mail,
                    label: t('notifications.email'),
                    iconBg: SECONDARY_FIXED,
                    iconColor: ON_SECONDARY_FIXED_VARIANT,
                  },
                  {
                    icon: MessageSquare,
                    label: t('notifications.sms'),
                    iconBg: SECONDARY_FIXED,
                    iconColor: ON_SECONDARY_FIXED_VARIANT,
                  },
                ] as const
              ).map(({ icon: Icon, label, description, iconBg, iconColor }, index, items) => (
                <button
                  key={label}
                  type="button"
                  onClick={notifySoon}
                  className="passenger-row-hover flex w-full items-center gap-3 px-5 py-3.5 text-left opacity-80 transition-opacity"
                  style={{
                    borderBottom:
                      index < items.length - 1 ? `1px solid ${OUTLINE_VARIANT}` : undefined,
                  }}
                >
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: iconBg }}
                  >
                    <Icon className="h-4 w-4" style={{ color: iconColor }} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold" style={{ color: ON_SURFACE }}>
                      {label}
                    </p>
                    {description ? (
                      <p className="truncate text-xs" style={{ color: ON_SURFACE_VARIANT }}>
                        {description}
                      </p>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section>
            <SectionHeader icon={<Shield className="h-5 w-5" aria-hidden />} label={t('sections.privacySafety')} />
            <div
              className="overflow-hidden rounded-[24px]"
              style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
            >
              <button
                type="button"
                onClick={handleLocationSheetOpen}
                className="passenger-row-hover flex w-full items-center justify-between px-5 py-4 text-left"
                style={{ borderBottom: `1px solid ${OUTLINE_VARIANT}` }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: TERTIARY_FIXED }}
                  >
                    <MapPin
                      className="h-4 w-4"
                      style={{ color: ON_TERTIARY_FIXED_VARIANT }}
                      aria-hidden
                    />
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="text-sm font-semibold">{t('privacy.location')}</p>
                    <p className="text-xs" style={{ color: ON_SURFACE_VARIANT }}>
                      {locationLoading
                        ? t('privacy.locationDescription')
                        : t(`privacy.${rowStatusLabelKey}`)}
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0" style={{ color: OUTLINE }} />
              </button>
              <button
                type="button"
                onClick={notifySoon}
                className="passenger-row-hover flex w-full items-center justify-between px-5 py-4 text-left opacity-80"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: SURFACE_CONTAINER_HIGH }}
                  >
                    <Database className="h-4 w-4" style={{ color: ON_SURFACE_VARIANT }} aria-hidden />
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="text-sm font-semibold">{t('privacy.dataSharing')}</p>
                    <p className="text-xs" style={{ color: ON_SURFACE_VARIANT }}>
                      {t('privacy.dataSharingDescription')}
                    </p>
                  </div>
                </div>
                <span
                  className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--passenger-secondary) 12%, transparent)',
                    color: SECONDARY,
                  }}
                >
                  {tc('comingSoon')}
                </span>
              </button>
            </div>
          </section>

          <section>
            <SectionHeader icon={<Palette className="h-5 w-5" aria-hidden />} label={t('sections.display')} />
            <BentoCard fullWidth>
              <p className="mb-4 font-semibold">{t('display.themeMode')}</p>
              <div
                className="flex gap-1 rounded-xl p-1"
                style={{ backgroundColor: SURFACE_LOW }}
                role="group"
                aria-label={t('display.themeAria')}
              >
                {themeOptions.map(({ id, label, icon: Icon }) => {
                  const active = themeMode === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setThemeMode(id)}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold tracking-wide transition-colors ${
                        active ? 'shadow-sm' : ''
                      }`}
                      style={{
                        backgroundColor: active ? SURFACE_LOWEST : 'transparent',
                        color: active ? PRIMARY : ON_SURFACE_VARIANT,
                      }}
                    >
                      <Icon className="h-[18px] w-[18px]" aria-hidden />
                      {label}
                    </button>
                  );
                })}
              </div>
            </BentoCard>
          </section>

          <section>
            <SectionHeader icon={<Globe className="h-5 w-5" aria-hidden />} label={t('sections.preferences')} />
            <BentoCard fullWidth>
              <button
                type="button"
                onClick={() => setLanguageSheetOpen(true)}
                className="flex w-full items-center justify-between text-left"
              >
                <div className="flex items-center gap-4">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl"
                    style={{ backgroundColor: SECONDARY_FIXED }}
                  >
                    <Languages
                      className="h-5 w-5"
                      style={{ color: ON_SECONDARY_FIXED_VARIANT }}
                      aria-hidden
                    />
                  </div>
                  <p className="font-semibold">{t('preferences.appLanguage')}</p>
                </div>
                <div className="flex items-center gap-2 font-medium" style={{ color: PRIMARY }}>
                  <span>{localeLabel}</span>
                  <ChevronDown className="h-5 w-5" aria-hidden />
                </div>
              </button>
            </BentoCard>
          </section>

          <section>
            <SectionHeader icon={<Info className="h-5 w-5" aria-hidden />} label={t('sections.legal')} />
            <div
              className="overflow-hidden rounded-[24px]"
              style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
            >
              <button
                type="button"
                onClick={() => openLegalDocument(ROAM_LEGAL.termsOfServiceUrl)}
                className="passenger-row-hover flex w-full items-center justify-between px-6 py-4 text-left transition-colors"
              >
                <span className="font-medium">{t('legal.terms')}</span>
                <ExternalLink className="h-5 w-5" style={{ color: OUTLINE }} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => openLegalDocument(ROAM_LEGAL.privacyPolicyUrl)}
                className="passenger-row-hover flex w-full items-center justify-between px-6 py-4 text-left transition-colors"
              >
                <span className="font-medium">{t('legal.privacy')}</span>
                <ExternalLink className="h-5 w-5" style={{ color: OUTLINE }} aria-hidden />
              </button>
              <a
                href={accountDeletionMailto()}
                className="passenger-row-hover flex w-full items-center justify-between px-6 py-4 text-left transition-colors"
              >
                <span className="font-medium">{t('legal.accountDeletion')}</span>
                <ExternalLink className="h-5 w-5" style={{ color: OUTLINE }} aria-hidden />
              </a>
              <button
                type="button"
                onClick={notifySoon}
                className="passenger-row-hover flex w-full items-center justify-between px-6 py-4 text-left transition-colors"
              >
                <span className="font-medium">{t('legal.licenses')}</span>
                <ChevronRight className="h-5 w-5" style={{ color: OUTLINE }} aria-hidden />
              </button>
            </div>
            <p className="mt-6 text-center text-sm" style={{ color: OUTLINE }}>
              {t('appVersion', {
                version: appVersionInfo.version,
                year: appVersionInfo.buildYear,
              })}
            </p>
          </section>
        </div>
      </main>

      <LanguagePickerSheet
        open={languageSheetOpen}
        value={locale}
        onClose={() => setLanguageSheetOpen(false)}
        onSelect={handleLanguageSelect}
      />

      <LocationPermissionSheet
        open={locationSheetOpen}
        grantState={grantState}
        loading={locationLoading}
        onClose={() => setLocationSheetOpen(false)}
        onAllow={() => void handleLocationAllow()}
        onOpenSettings={() => void handleLocationOpenSettings()}
      />
    </div>
  );
}
