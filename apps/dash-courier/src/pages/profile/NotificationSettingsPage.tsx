import React, { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { ToggleSwitch } from '@/components/forms/ToggleSwitch';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { DEFAULT_NOTIFICATION_SETTINGS } from '@/lib/mockSettings';

type NotificationSettingsPageProps = {
  onBack: () => void;
};

type ToggleRowProps = {
  label: string;
  description?: string;
  icon?: string;
  checked: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
  border?: boolean;
};

function ToggleRow({ label, description, icon, checked, onChange, disabled, border = true }: ToggleRowProps) {
  return (
    <div
      className={`flex justify-between items-center min-h-14 px-4 py-3 gap-4 ${
        border ? 'border-b border-surface-variant' : ''
      } hover:bg-surface-bright transition-colors`}
    >
      <div className="flex items-center gap-3 min-w-0 pr-2">
        {icon && <MaterialIcon name={icon} className="text-muted shrink-0" />}
        <div className="min-w-0">
          <span className="text-base text-on-surface block">{label}</span>
          {description && <span className="text-sm text-muted block mt-0.5">{description}</span>}
        </div>
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} disabled={disabled} label={label} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface rounded-xl shadow-soft overflow-hidden">
      <div className="px-4 py-2 bg-surface-container-low border-b border-surface-variant">
        <h2 className="text-[11px] font-medium text-muted uppercase tracking-wider">{title}</h2>
      </div>
      <div>{children}</div>
    </section>
  );
}

export function NotificationSettingsPage({ onBack }: NotificationSettingsPageProps) {
  const [settings, setSettings] = useState(DEFAULT_NOTIFICATION_SETTINGS);

  const set = (key: keyof typeof settings) => (value: boolean) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="fixed inset-0 z-[70] bg-background flex flex-col overflow-hidden">
      <SubPageHeader title="Notifications" onBack={onBack} />

      <main className="flex-1 overflow-y-auto px-[var(--spacing-edge)] py-6 pb-8 space-y-8 max-w-3xl mx-auto w-full">
        <Section title="Critical Alerts">
          <div className="px-4 py-4">
            <ToggleRow
              label="Delivery offers (push)"
              description="Required to receive order requests while online."
              checked={settings.deliveryOffers}
              disabled
              border={false}
            />
          </div>
        </Section>

        <Section title="Earnings & Promotions">
          <ToggleRow label="Earnings updates" checked={settings.earningsUpdates} onChange={set('earningsUpdates')} />
          <ToggleRow
            label="Peak pay alerts"
            description="Get notified when it's busy in your area."
            checked={settings.peakPay}
            onChange={set('peakPay')}
          />
          <ToggleRow
            label="Promotions & bonuses"
            checked={settings.promotions}
            onChange={set('promotions')}
          />
          <ToggleRow
            label="Weekly summary"
            checked={settings.weeklySummary}
            onChange={set('weeklySummary')}
            border={false}
          />
        </Section>

        <Section title="Device Behavior">
          <ToggleRow
            label="Sound for offers"
            icon="volume_up"
            checked={settings.soundOffers}
            onChange={set('soundOffers')}
          />
          <ToggleRow
            label="Vibration for offers"
            icon="vibration"
            checked={settings.vibrationOffers}
            onChange={set('vibrationOffers')}
            border={false}
          />
        </Section>
      </main>
    </div>
  );
}
