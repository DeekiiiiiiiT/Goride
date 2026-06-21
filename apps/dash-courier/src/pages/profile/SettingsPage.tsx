import React, { useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { ROAM_LEGAL, accountDeletionMailto } from '@roam/business-config/legalUrls';
import { loadAppSettings, saveAppSettings, type CourierAppSettings } from '@/lib/courierStorage';

type SettingsPageProps = {
  onBack: () => void;
};

type SelectRowProps = {
  icon: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  border?: boolean;
};

function SelectRow({ icon, label, value, options, onChange, border = true }: SelectRowProps) {
  return (
    <div
      className={`flex items-center justify-between p-4 hover:bg-surface-container-lowest transition-colors group ${
        border ? 'border-b border-surface-variant' : ''
      }`}
    >
      <div className="flex items-center gap-4">
        <div className="bg-surface-container p-2 rounded-full text-on-surface-variant group-hover:text-primary transition-colors">
          <MaterialIcon name={icon} />
        </div>
        <div>
          <p className="text-base text-on-surface">{label}</p>
          <p className="text-sm text-muted">{value}</p>
        </div>
      </div>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          aria-label={label}
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <MaterialIcon name="chevron_right" className="text-muted" />
      </div>
    </div>
  );
}

function applyTheme(appearance: CourierAppSettings['appearance']) {
  const root = document.documentElement;
  if (appearance === 'Dark') {
    root.classList.add('dark');
  } else if (appearance === 'Light') {
    root.classList.remove('dark');
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
  }
}

export function SettingsPage({ onBack }: SettingsPageProps) {
  const [settings, setSettings] = useState<CourierAppSettings>(() => loadAppSettings());

  useEffect(() => {
    applyTheme(settings.appearance);
  }, [settings.appearance]);

  const update = (patch: Partial<CourierAppSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveAppSettings(next);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-background flex flex-col overflow-hidden">
      <SubPageHeader title="Settings" onBack={onBack} />

      <main className="flex-1 overflow-y-auto px-[var(--spacing-edge)] py-6 pb-8 space-y-8">
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-primary">Preferences</h2>
          <div className="bg-surface rounded-xl shadow-soft overflow-hidden">
            <SelectRow
              icon="palette"
              label="Appearance"
              value={settings.appearance}
              options={['Light', 'Dark', 'System']}
              onChange={(v) => update({ appearance: v as CourierAppSettings['appearance'] })}
            />
            <SelectRow
              icon="language"
              label="Language"
              value={settings.language}
              options={['English (US)', 'Spanish', 'French']}
              onChange={(v) => update({ language: v })}
            />
            <SelectRow
              icon="navigation"
              label="Navigation App"
              value={settings.navApp}
              options={['Google Maps', 'Waze', 'Apple Maps']}
              onChange={(v) => update({ navApp: v })}
            />
            <SelectRow
              icon="straighten"
              label="Distance Units"
              value={settings.distanceUnits === 'km' ? 'Kilometers' : 'Miles'}
              options={['Kilometers', 'Miles']}
              onChange={(v) => update({ distanceUnits: v === 'Kilometers' ? 'km' : 'Miles' })}
              border={false}
            />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-primary">About</h2>
          <div className="bg-surface rounded-xl shadow-soft overflow-hidden">
            {[
              { label: 'About Roam Dash Courier', href: ROAM_LEGAL.privacyPolicyUrl },
              { label: 'Terms of Service', href: ROAM_LEGAL.termsOfServiceUrl },
              { label: 'Privacy Policy', href: ROAM_LEGAL.privacyPolicyUrl },
            ].map((link, i, arr) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center justify-between p-4 hover:bg-surface-container-lowest transition-colors group ${
                  i < arr.length - 1 ? 'border-b border-surface-variant' : ''
                }`}
              >
                <span className="text-base text-on-surface">{link.label}</span>
                <MaterialIcon name="chevron_right" className="text-muted group-hover:text-primary transition-colors" />
              </a>
            ))}
          </div>
        </section>

        <section className="flex flex-col items-center gap-6 mt-8">
          <a
            href={accountDeletionMailto()}
            className="text-base text-error hover:bg-error-container hover:text-on-error-container px-6 py-3 rounded-full transition-colors"
          >
            Delete Account
          </a>
          <div className="text-center">
            <p className="text-[11px] text-muted">Version 2.4.1 (Build 842)</p>
            <p className="text-[11px] text-muted mt-1">© 2024 Roam Dash Inc.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
