import { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { getProfile } from '@/lib/accountContent';
import { getNotificationPrefs, saveNotificationPrefs, type NotificationPrefs } from '@/lib/accountSubContent';

type Props = {
  onNavigate: (page: string) => void;
};

type ToggleRow = {
  key: keyof NotificationPrefs;
  title: string;
  description: string;
  disabled?: boolean;
};

const PUSH_ROWS: ToggleRow[] = [
  { key: 'orderUpdates', title: 'Order updates', description: 'Essential real-time tracking for active orders.', disabled: true },
  { key: 'promotions', title: 'Promotions & deals', description: 'Special offers, discounts, and exclusive events.' },
  { key: 'newRestaurants', title: 'New restaurant alerts', description: 'Be the first to know when hot new spots join Roam Dash.' },
  { key: 'personalizedPicks', title: 'Personalized picks', description: 'Curated suggestions based on your past orders.' },
];

const CHANNEL_ROWS: ToggleRow[] = [
  { key: 'emailNewsletters', title: 'Email newsletters', description: 'Weekly summaries, receipts, and major announcements.' },
  { key: 'smsUpdates', title: 'SMS updates', description: 'Text messages for critical delivery moments.' },
];

export default function NotificationSettingsPage({ onNavigate }: Props) {
  const [prefs, setPrefs] = useState(getNotificationPrefs);
  const profile = getProfile();

  const update = (key: keyof NotificationPrefs, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    saveNotificationPrefs(next);
  };

  return (
    <div className="bg-background text-on-background min-h-screen flex flex-col">
      <header className="bg-surface w-full top-0 sticky shadow-sm z-40">
        <div className="flex items-center justify-between px-4 py-2 w-full max-w-[1200px] mx-auto">
          <button type="button" onClick={() => onNavigate('account')} className="flex items-center gap-2 text-primary">
            <MaterialIcon name="arrow_back" />
            <span className="text-headline-sm font-semibold">Back</span>
          </button>
          <h1 className="text-headline-lg-mobile font-bold text-primary">Notifications</h1>
          <div className="w-8 h-8 rounded-full overflow-hidden bg-surface-variant shrink-0">
            <img src={profile.avatarUrl} alt="Profile" className="w-full h-full object-cover" />
          </div>
        </div>
      </header>

      <main className="flex-grow px-4 py-6 max-w-[1200px] mx-auto w-full pb-32">
        <p className="text-body-md text-on-surface-variant mb-6">
          Manage how Roam Dash communicates with you. We&apos;ll always send essential order updates.
        </p>

        <section className="bg-surface-container-lowest rounded-xl shadow-[0px_4px_20px_rgba(0,0,0,0.04)] p-4 mb-6">
          <h2 className="text-headline-sm font-semibold text-primary mb-4 border-b border-surface-variant pb-2">
            Push Notifications
          </h2>
          <div className="flex flex-col">
            {PUSH_ROWS.map((row, index) => (
              <div key={row.key}>
                {index > 0 && <div className="h-px bg-surface-variant" />}
                <div className="flex items-center justify-between py-3 gap-4">
                  <div className="pr-2">
                    <span className="text-body-lg font-medium block">{row.title}</span>
                    <span className="text-body-sm text-on-surface-variant">{row.description}</span>
                  </div>
                  <ToggleSwitch
                    checked={prefs[row.key]}
                    onChange={v => update(row.key, v)}
                    disabled={row.disabled}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-surface-container-lowest rounded-xl shadow-[0px_4px_20px_rgba(0,0,0,0.04)] p-4">
          <h2 className="text-headline-sm font-semibold text-primary mb-4 border-b border-surface-variant pb-2">
            Other Channels
          </h2>
          <div className="flex flex-col">
            {CHANNEL_ROWS.map((row, index) => (
              <div key={row.key}>
                {index > 0 && <div className="h-px bg-surface-variant" />}
                <div className="flex items-center justify-between py-3 gap-4">
                  <div className="pr-2">
                    <span className="text-body-lg font-medium block">{row.title}</span>
                    <span className="text-body-sm text-on-surface-variant">{row.description}</span>
                  </div>
                  <ToggleSwitch checked={prefs[row.key]} onChange={v => update(row.key, v)} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
