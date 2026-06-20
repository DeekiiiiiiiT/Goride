import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

const MAP_BG =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCCu-6sYpt6Haqy0aMiE8nz39JZDcJOBmoAP5wIvJ99v-uNmbpqDqtxEt8goctwtO5MwsXOFszq6RHpVKaKGIhiLF3hXqJ_dE_IDyNptkQukazyJrVwQNyQc2xvgTdgY-ecE-Qjh-8_7VJZR-1ixs4Vwsi3lY0wJ94j-je6FxcRiflvqX-TMerRCcSvf1v9ZkqwnT-Sgs1OgjJXy_ZAtGedtg5jm0PBNTkzpZ0WoSvOhiJU1xa7aeX1Z4zNpAtNy-tzrWtwROgV1vs';

const TROUBLESHOOTING_STEPS = [
  { icon: 'my_location', text: 'Make sure location services are enabled' },
  { icon: 'rule_settings', text: "Check that Roam Dash has 'Always' location permission" },
  { icon: 'directions_run', text: 'Try moving to an open area' },
] as const;

type LocationIssueSheetProps = {
  onOpenSettings: () => void;
  onRetry: () => void;
};

export function LocationIssueSheet({ onOpenSettings, onRetry }: LocationIssueSheetProps) {
  return (
    <div className="fixed inset-0 z-[80] flex flex-col overflow-hidden select-none">
      <div
        className="absolute inset-0 bg-surface-container-high bg-cover bg-center"
        style={{ backgroundImage: `url('${MAP_BG}')` }}
        aria-hidden
      >
        <div className="absolute inset-0 bg-gradient-to-t from-surface/80 to-transparent" />
      </div>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-end px-[var(--spacing-edge)] pb-8 pt-6 courier-map-bg-blur">
        <div className="w-full max-w-md bg-surface rounded-t-3xl rounded-b-xl shadow-[0_4px_40px_rgba(0,0,0,0.12)] flex flex-col p-6 border border-surface-variant">
          <div className="w-12 h-1.5 bg-surface-variant rounded-full mx-auto mb-6" />

          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-full bg-error-container/20 flex items-center justify-center courier-subtle-pulse">
              <MaterialIcon name="location_off" className="text-error text-[40px]" filled />
            </div>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold text-on-surface mb-2">
              We can&apos;t find your location
            </h1>
            <p className="text-base text-on-surface-variant px-2">
              Roam Dash needs your precise location to route deliveries accurately and ensure you
              get paid for your active time.
            </p>
          </div>

          <div className="bg-surface-container-low rounded-xl p-4 mb-8 border border-surface-variant">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-on-surface mb-4">
              Troubleshooting Steps
            </h2>
            <ul className="space-y-4">
              {TROUBLESHOOTING_STEPS.map((step) => (
                <li key={step.icon} className="flex items-start gap-2">
                  <MaterialIcon name={step.icon} className="text-primary text-[20px] mt-0.5 shrink-0" />
                  <span className="text-sm text-on-surface">{step.text}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onOpenSettings}
              className="w-full h-14 bg-primary text-on-primary text-xl font-semibold rounded-xl shadow-[0_6px_12px_rgba(0,108,73,0.1)] active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
            >
              <MaterialIcon name="settings" className="text-2xl" />
              Open Settings
            </button>
            <button
              type="button"
              onClick={onRetry}
              className="w-full h-14 bg-transparent text-on-surface-variant text-xl font-semibold rounded-xl border border-outline-variant active:bg-surface-container-low transition-colors flex items-center justify-center gap-2"
            >
              <MaterialIcon name="refresh" className="text-2xl" />
              Retry
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
