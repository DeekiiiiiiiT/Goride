import React, { useState } from 'react';
import { toast } from 'sonner';
import {
  readNotificationPrefs,
  writeNotificationPrefs,
  type HaulNotificationPrefs,
} from '../../lib/haulNotificationPrefs';
import { HaulSubpageHeader } from './HaulSubpageHeader';
import { HaulToggle } from './HaulToggle';
import { haulPrimaryBtn } from '../auth/haulAuthUi';

type Props = {
  onBack: () => void;
};

type RowProps = {
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  icon?: string;
  border?: boolean;
};

function PrefRow({ title, description, checked, onChange, icon, border = true }: RowProps) {
  return (
    <div className={`flex items-center justify-between gap-4 p-4 ${border ? 'border-b border-[#534434]' : ''}`}>
      <div className="flex min-w-0 flex-1 items-start gap-4">
        {icon ? <span className="material-symbols-outlined mt-0.5 text-[#d8c3ad]">{icon}</span> : null}
        <div>
          <div className="text-lg font-semibold text-[#dae2fd]">{title}</div>
          <div className="text-sm text-[#d8c3ad]">{description}</div>
        </div>
      </div>
      <HaulToggle checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

export function HaulNotificationSettingsPage({ onBack }: Props) {
  const [prefs, setPrefs] = useState<HaulNotificationPrefs>(() => readNotificationPrefs());

  const set = <K extends keyof HaulNotificationPrefs>(key: K, value: HaulNotificationPrefs[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }));
  };

  const handleSave = () => {
    writeNotificationPrefs(prefs);
    toast.success('Preferences saved');
    onBack();
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0b1326]">
      <HaulSubpageHeader title="Notifications" onBack={onBack} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-[88px] pb-32">
        <p className="mb-6 text-[#d8c3ad]">Configure how and when you want to receive alerts from Roam Haul.</p>

        <div className="overflow-hidden rounded-xl border border-[#534434] bg-[#171f33]">
          <PrefRow
            title="New Job Requests"
            description="Push notifications for new available freight matching your criteria."
            checked={prefs.newJobs}
            onChange={(v) => set('newJobs', v)}
          />
          <PrefRow
            title="Earnings Updates"
            description="Alerts when payments are processed or weekly summaries are ready."
            checked={prefs.earnings}
            onChange={(v) => set('earnings', v)}
          />
          <PrefRow
            title="Promotions & Offers"
            description="Special rates, bonus opportunities, and partner discounts."
            checked={prefs.promotions}
            onChange={(v) => set('promotions', v)}
          />
          <PrefRow
            title="App Updates"
            description="Important system maintenance and new feature announcements."
            checked={prefs.appUpdates}
            onChange={(v) => set('appUpdates', v)}
            border={false}
          />
        </div>

        <p className="mt-6 mb-2 px-1 text-sm tracking-widest text-[#ffc174] uppercase">Device Preferences</p>
        <div className="overflow-hidden rounded-xl border border-[#534434] bg-[#171f33]">
          <PrefRow
            title="Sound Alerts"
            description="Play sounds for incoming priority alerts."
            checked={prefs.sound}
            onChange={(v) => set('sound', v)}
            icon="volume_up"
          />
          <PrefRow
            title="Vibration"
            description="Vibrate device on new notifications."
            checked={prefs.vibration}
            onChange={(v) => set('vibration', v)}
            icon="vibration"
            border={false}
          />
        </div>
      </main>
      <div className="fixed bottom-0 left-0 z-50 w-full border-t border-[#534434] bg-[#0b1326]/90 px-4 py-4 backdrop-blur-md">
        <button type="button" onClick={handleSave} className={haulPrimaryBtn}>
          Save Preferences
        </button>
      </div>
    </div>
  );
}
