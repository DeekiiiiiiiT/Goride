import { useRef } from 'react';
import { toast } from 'sonner';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { useNotificationSettings } from '../../hooks/useNotificationSettings';
import { useWebPush } from '../../hooks/useWebPush';
import {
  ALERT_SOUND_URLS,
  NotificationSettings,
  ORDER_ALERT_SOUND_OPTIONS,
  OrderAlertSound,
} from '../../types/notifications';

interface NotificationSettingsViewProps {
  merchantId: string;
  onBack: () => void;
}

function SettingsToggle({
  checked,
  onChange,
  id,
  disabled = false,
}: {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  id: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`relative inline-flex items-center ${disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
    >
      <input
        id={id}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked)}
      />
      <div className="h-6 w-11 rounded-full bg-surface-dim transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-all peer-checked:bg-primary-container peer-checked:after:translate-x-5 peer-disabled:bg-primary-container/40 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-container/20" />
    </label>
  );
}

interface ToggleRowProps {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}

function ToggleRow({ id, label, description, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <div className="flex min-h-[64px] items-center justify-between py-inset-sm">
      <div className="pr-inset-sm">
        <p className="text-body-lg text-on-background">{label}</p>
        {description && <p className="text-body-sm text-tertiary">{description}</p>}
      </div>
      <SettingsToggle id={id} checked={checked} disabled={disabled} onChange={onChange} />
    </div>
  );
}

export default function NotificationSettingsView({
  merchantId,
  onBack,
}: NotificationSettingsViewProps) {
  const { settings, updateSettings } = useNotificationSettings(merchantId);
  const { isSupported, isSubscribed, permission, subscribe, unsubscribe } = useWebPush(merchantId);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleTestSound = () => {
    if (settings.orderAlertSound === 'custom') {
      toast.info('Custom sounds are coming soon');
      return;
    }

    const url = ALERT_SOUND_URLS[settings.orderAlertSound];
    if (!audioRef.current) {
      audioRef.current = new Audio(url);
    } else {
      audioRef.current.src = url;
    }

    audioRef.current.volume = settings.soundVolume / 100;
    audioRef.current.play().catch(() => {
      toast.error('Could not play sound');
    });

    if (settings.vibration && 'vibrate' in navigator) {
      navigator.vibrate(200);
    }
  };

  const updateAlert = (key: keyof NotificationSettings, value: boolean) => {
    updateSettings({ [key]: value });
  };

  const handlePushToggle = async (enabled: boolean) => {
    if (!isSupported) {
      toast.info('Push notifications are not supported in this browser');
      return;
    }

    try {
      if (enabled) {
        await subscribe();
        toast.success('Background notifications enabled');
      } else {
        await unsubscribe();
        toast.success('Background notifications disabled');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update push settings');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex min-h-dvh flex-col bg-background pb-24 pt-16 text-on-background">
      <header className="fixed top-0 z-50 flex h-16 w-full items-center justify-between border-b border-outline-variant bg-surface px-margin-mobile">
        <div className="flex items-center gap-inset-sm">
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center rounded-full text-primary transition-colors hover:bg-surface-container active:opacity-80"
            aria-label="Back"
          >
            <MaterialIcon name="arrow_back" />
          </button>
          <h1 className="text-headline-md font-bold text-primary">Notification Settings</h1>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-grow flex-col gap-inset-md p-margin-mobile md:p-margin-tablet">
        <section className="rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-sm shadow-sm md:p-inset-md">
          <h2 className="mb-inset-md text-headline-md text-on-background">Alert Preferences</h2>
          <div className="flex flex-col divide-y divide-surface-dim">
            <ToggleRow
              id="toggle_new_orders"
              label="New order alerts (in-app)"
              description="Sound and vibration while the app is open."
              checked={settings.newOrderAlerts}
              disabled
            />
            <ToggleRow
              id="toggle_push"
              label="Background push notifications"
              description={
                !isSupported
                  ? 'Not available in this browser.'
                  : permission === 'denied'
                    ? 'Enable notifications in browser settings.'
                    : 'Get alerts when the app is closed.'
              }
              checked={isSubscribed}
              disabled={!isSupported || permission === 'denied'}
              onChange={handlePushToggle}
            />
            <ToggleRow
              id="toggle_order_updates"
              label="Order updates"
              checked={settings.orderUpdates}
              onChange={(checked) => updateAlert('orderUpdates', checked)}
            />
            <ToggleRow
              id="toggle_daily_email"
              label="Daily summary email"
              checked={settings.dailySummaryEmail}
              onChange={(checked) => updateAlert('dailySummaryEmail', checked)}
            />
            <ToggleRow
              id="toggle_weekly_email"
              label="Weekly report email"
              checked={settings.weeklyReportEmail}
              onChange={(checked) => updateAlert('weeklyReportEmail', checked)}
            />
            <ToggleRow
              id="toggle_payouts"
              label="Payout notifications"
              checked={settings.payoutNotifications}
              onChange={(checked) => updateAlert('payoutNotifications', checked)}
            />
            <ToggleRow
              id="toggle_reviews"
              label="New review alerts"
              checked={settings.newReviewAlerts}
              onChange={(checked) => updateAlert('newReviewAlerts', checked)}
            />
            <ToggleRow
              id="toggle_promos"
              label="Promotional tips from Roam Dash"
              checked={settings.promotionalTips}
              onChange={(checked) => updateAlert('promotionalTips', checked)}
            />
          </div>
        </section>

        <section className="rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-sm shadow-sm md:p-inset-md">
          <h2 className="mb-inset-md text-headline-md text-on-background">Kitchen Sound Settings</h2>
          <div className="flex flex-col gap-inset-md">
            <div className="flex flex-col gap-inset-xs">
              <label className="text-label-md text-on-background" htmlFor="sound_select">
                Order alert sound
              </label>
              <div className="relative">
                <select
                  id="sound_select"
                  value={settings.orderAlertSound}
                  onChange={(event) =>
                    updateSettings({ orderAlertSound: event.target.value as OrderAlertSound })
                  }
                  className="block min-h-[48px] w-full appearance-none rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-3 text-body-lg text-on-background focus:border-primary-container focus:ring focus:ring-primary-container/50"
                >
                  {ORDER_ALERT_SOUND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-on-surface-variant">
                  <MaterialIcon name="expand_more" />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-inset-sm py-2">
              <div className="flex items-center justify-between">
                <label className="text-label-md text-on-background" htmlFor="volume_slider">
                  Sound volume
                </label>
                <span className="text-body-sm text-tertiary">{settings.soundVolume}%</span>
              </div>
              <div className="flex items-center gap-inset-sm">
                <MaterialIcon name="volume_down" className="text-tertiary" />
                <input
                  id="volume_slider"
                  type="range"
                  min={0}
                  max={100}
                  value={settings.soundVolume}
                  onChange={(event) =>
                    updateSettings({ soundVolume: Number(event.target.value) })
                  }
                  className="h-2 flex-grow cursor-pointer appearance-none rounded-full bg-surface-dim accent-primary-container [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary-container [&::-webkit-slider-thumb]:shadow-sm"
                />
                <MaterialIcon name="volume_up" className="text-tertiary" />
              </div>
            </div>

            <div className="border-t border-surface-dim pb-inset-xs pt-inset-md">
              <div className="mb-inset-md flex min-h-[48px] items-center justify-between">
                <p className="text-body-lg text-on-background">Vibration</p>
                <SettingsToggle
                  id="toggle_vibration"
                  checked={settings.vibration}
                  onChange={(checked) => updateSettings({ vibration: checked })}
                />
              </div>
              <button
                type="button"
                onClick={handleTestSound}
                className="flex min-h-[48px] w-full items-center justify-center gap-inset-xs rounded-lg border border-primary-container bg-surface-container-lowest text-label-md text-primary-container transition-colors hover:bg-surface-container-low"
              >
                <MaterialIcon name="play_arrow" />
                Test Sound
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
