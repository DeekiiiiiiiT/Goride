import { useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { getProfile } from '@/lib/accountContent';
import { getNotificationPrefs, saveNotificationPrefs, type NotificationPrefs } from '@/lib/accountSubContent';
import {
  isRushPushSubscribedLocally,
  isRushPushSupported,
  subscribeRushPush,
  unsubscribeRushPush,
} from '@/lib/rushPushSubscribe';
import { toast } from '@/lib/toast';

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
  {
    key: 'orderUpdates',
    title: 'Order updates',
    description: 'Push alerts for accepted, on the way, and delivered (SMS stays on for critical moments).',
  },
  { key: 'promotions', title: 'Promotions & deals', description: 'Special offers, discounts, and exclusive events.' },
  { key: 'newRestaurants', title: 'New restaurant alerts', description: 'Be the first to know when hot new spots join Roam Rush.' },
  { key: 'personalizedPicks', title: 'Personalized picks', description: 'Curated suggestions based on your past orders.' },
];

const CHANNEL_ROWS: ToggleRow[] = [
  { key: 'emailNewsletters', title: 'Email newsletters', description: 'Weekly summaries, receipts, and major announcements.' },
  { key: 'smsUpdates', title: 'SMS updates', description: 'Text messages for critical delivery moments.' },
];

export default function NotificationSettingsPage({ onNavigate }: Props) {
  const [prefs, setPrefs] = useState(getNotificationPrefs);
  const [busyKey, setBusyKey] = useState<keyof NotificationPrefs | null>(null);
  const profile = getProfile();
  const pushSupported = isRushPushSupported();

  // Align toggle with a real device subscription when prefs say order updates are on.
  useEffect(() => {
    if (!prefs.orderUpdates || !pushSupported) return;
    if (isRushPushSubscribedLocally()) return;
    let cancelled = false;
    void (async () => {
      try {
        await subscribeRushPush();
      } catch {
        if (!cancelled) {
          const next = { ...getNotificationPrefs(), orderUpdates: false };
          setPrefs(next);
          saveNotificationPrefs(next);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prefs.orderUpdates, pushSupported]);

  const update = (key: keyof NotificationPrefs, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    saveNotificationPrefs(next);
  };

  const handleToggle = async (key: keyof NotificationPrefs, value: boolean) => {
    if (key !== 'orderUpdates') {
      update(key, value);
      return;
    }

    if (!pushSupported && value) {
      toast.error('Push is not available on this device');
      return;
    }

    setBusyKey('orderUpdates');
    try {
      if (value) {
        await subscribeRushPush();
        update('orderUpdates', true);
        toast.success('Order update push enabled');
      } else {
        await unsubscribeRushPush();
        update('orderUpdates', false);
        toast.success('Order update push disabled');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update push settings');
    } finally {
      setBusyKey(null);
    }
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
          Manage how Roam Rush communicates with you. SMS remains the primary channel for critical order moments; push is optional and additive.
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
                    {row.key === 'orderUpdates' && !pushSupported && (
                      <span className="text-body-sm text-on-surface-variant block mt-1">
                        Push is unavailable in this browser — SMS order updates still work.
                      </span>
                    )}
                  </div>
                  <ToggleSwitch
                    checked={prefs[row.key]}
                    onChange={(v) => void handleToggle(row.key, v)}
                    disabled={
                      row.disabled ||
                      busyKey === row.key ||
                      (row.key === 'orderUpdates' && !pushSupported && !prefs.orderUpdates)
                    }
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
                  <ToggleSwitch checked={prefs[row.key]} onChange={(v) => update(row.key, v)} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
