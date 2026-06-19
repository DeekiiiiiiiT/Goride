import React, { useState } from 'react';
import {
  readAppPrefs,
  writeAppPrefs,
  NAV_APP_LABELS,
  type AppearanceMode,
  type NavigationApp,
  type UnitsMode,
} from '../../lib/haulAppPrefs';
import { HaulSubpageHeader } from './HaulSubpageHeader';
import { HaulSegmentedControl } from './HaulSegmentedControl';

type Props = {
  onBack: () => void;
  onNavigateAbout: () => void;
  onNavigateTerms: () => void;
  onNavigatePrivacy: () => void;
};

function SettingsRow({
  icon,
  label,
  children,
  onClick,
  border = true,
}: {
  icon: string;
  label: string;
  children?: React.ReactNode;
  onClick?: () => void;
  border?: boolean;
}) {
  const inner = (
    <>
      <div className="flex items-center gap-4">
        <span className="material-symbols-outlined text-[#d8c3ad]">{icon}</span>
        <span className="text-base text-[#dae2fd]">{label}</span>
      </div>
      {children}
    </>
  );

  const className = `flex min-h-11 w-full items-center justify-between p-4 transition-colors ${
    border ? 'border-b border-[#534434]' : ''
  } ${onClick ? 'hover:bg-[#222a3d] active:bg-[#2d3449]' : ''}`;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`group ${className}`}>
        <div className="flex items-center gap-4">
          <span className="material-symbols-outlined text-[#d8c3ad] transition-colors group-hover:text-[#ffc174]">
            {icon}
          </span>
          <span className="text-base text-[#dae2fd]">{label}</span>
        </div>
        {children}
      </button>
    );
  }

  return <div className={className}>{inner}</div>;
}

export function HaulSettingsPage({ onBack, onNavigateAbout, onNavigateTerms, onNavigatePrivacy }: Props) {
  const [prefs, setPrefs] = useState(() => readAppPrefs());

  const update = <K extends keyof typeof prefs>(key: K, value: (typeof prefs)[K]) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    writeAppPrefs(next);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0b1326]">
      <HaulSubpageHeader title="Settings" onBack={onBack} variant="centered-primary" />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 pt-[88px] pb-8">
        <section className="space-y-2">
          <h2 className="px-4 text-sm font-medium tracking-wider text-[#d8c3ad] uppercase">Preferences</h2>
          <div className="overflow-hidden rounded-xl border border-[#534434] bg-[#171f33]">
            <SettingsRow icon="palette" label="Appearance">
              <HaulSegmentedControl<AppearanceMode>
                value={prefs.appearance}
                options={[
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
                onChange={(v) => update('appearance', v)}
              />
            </SettingsRow>
            <SettingsRow
              icon="language"
              label="Language"
              onClick={() => {}}
            >
              <div className="flex items-center gap-1 text-[#d8c3ad]">
                <span>{prefs.language}</span>
                <span className="material-symbols-outlined">chevron_right</span>
              </div>
            </SettingsRow>
            <SettingsRow icon="map" label="Navigation App" onClick={() => {
              const apps: NavigationApp[] = ['google_maps', 'apple_maps', 'waze'];
              const idx = apps.indexOf(prefs.navigationApp);
              update('navigationApp', apps[(idx + 1) % apps.length]);
            }}>
              <div className="flex items-center gap-1 text-[#d8c3ad]">
                <span>{NAV_APP_LABELS[prefs.navigationApp]}</span>
                <span className="material-symbols-outlined">chevron_right</span>
              </div>
            </SettingsRow>
            <SettingsRow icon="square_foot" label="Units" border={false}>
              <HaulSegmentedControl<UnitsMode>
                value={prefs.units}
                options={[
                  { value: 'metric', label: 'Metric' },
                  { value: 'imperial', label: 'Imperial' },
                ]}
                minWidth={72}
                onChange={(v) => update('units', v)}
              />
            </SettingsRow>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="px-4 text-sm font-medium tracking-wider text-[#d8c3ad] uppercase">Information</h2>
          <div className="overflow-hidden rounded-xl border border-[#534434] bg-[#171f33]">
            <SettingsRow icon="info" label="About Roam Haul" onClick={onNavigateAbout}>
              <span className="material-symbols-outlined text-[#d8c3ad]">chevron_right</span>
            </SettingsRow>
            <SettingsRow icon="gavel" label="Terms of Service" onClick={onNavigateTerms}>
              <span className="material-symbols-outlined text-[#d8c3ad]">chevron_right</span>
            </SettingsRow>
            <SettingsRow icon="shield" label="Privacy Policy" onClick={onNavigatePrivacy} border={false}>
              <span className="material-symbols-outlined text-[#d8c3ad]">chevron_right</span>
            </SettingsRow>
          </div>
        </section>

        <p className="pt-6 text-center text-sm text-[#d8c3ad]/60">Roam Haul v2.4.0</p>
      </main>
    </div>
  );
}
