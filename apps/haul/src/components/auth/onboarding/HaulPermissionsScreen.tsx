import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import {
  checkGeolocationGranted,
  checkNotificationGranted,
  markOnboardingDismissed,
  requestGeolocationPermission,
  requestNotificationPermission,
  type PermissionGrantState,
} from '@roam/types';
import { checkCameraPermission, requestCameraPermission } from '../../../utils/requestCameraPermission';
import { haulPrimaryBtn } from '../haulAuthUi';

type PermissionKey = 'location' | 'notifications' | 'camera';

type PermissionCard = {
  key: PermissionKey;
  icon: string;
  title: string;
  description: string;
  actionLabel: string;
  variant: 'filled' | 'outline';
};

const CARDS: PermissionCard[] = [
  {
    key: 'location',
    icon: 'location_on',
    title: 'Location',
    description: 'Required for navigation and load tracking',
    actionLabel: 'Allow',
    variant: 'filled',
  },
  {
    key: 'notifications',
    icon: 'notifications_active',
    title: 'Notifications',
    description: 'Receive instant alerts for available jobs',
    actionLabel: 'Enable',
    variant: 'filled',
  },
  {
    key: 'camera',
    icon: 'photo_camera',
    title: 'Camera',
    description: 'Capture proof of delivery and document scans',
    actionLabel: 'Allow',
    variant: 'outline',
  },
];

type Props = {
  onBack: () => void;
  onContinue: () => Promise<void>;
};

export function HaulPermissionsScreen({ onBack, onContinue }: Props) {
  const [states, setStates] = useState<Record<PermissionKey, PermissionGrantState>>({
    location: 'prompt',
    notifications: 'prompt',
    camera: 'prompt',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      const [loc, notif, cam] = await Promise.all([
        checkGeolocationGranted(),
        checkNotificationGranted(),
        checkCameraPermission(),
      ]);
      setStates({ location: loc, notifications: notif, camera: cam });
    })();
  }, []);

  const request = async (key: PermissionKey) => {
    let state: PermissionGrantState = 'unsupported';
    if (key === 'location') state = await requestGeolocationPermission();
    else if (key === 'notifications') state = await requestNotificationPermission();
    else state = await requestCameraPermission();
    setStates((prev) => ({ ...prev, [key]: state }));
    if (state === 'granted') {
      const policyKey =
        key === 'location'
          ? 'location_precise_while_using'
          : key === 'notifications'
            ? 'notifications'
            : 'camera_documents';
      markOnboardingDismissed('driver', policyKey);
    }
  };

  const handleContinue = async () => {
    setLoading(true);
    try {
      await onContinue();
    } finally {
      setLoading(false);
    }
  };

  const btnClass = (variant: 'filled' | 'outline', granted: boolean) => {
    if (granted) return 'border border-[#30c88f] bg-[#30c88f]/10 text-[#56e5a9] px-6';
    if (variant === 'outline') {
      return 'border border-[#ffc174] bg-transparent text-[#ffc174] hover:bg-[#ffc174]/10 px-6';
    }
    return 'bg-[#ffc174] text-[#0b1326] hover:bg-[#ffddb8] px-6';
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#0b1326] p-4 text-[#dae2fd] antialiased md:p-12">
      <header className="mb-8 w-full max-w-lg">
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[#334155] bg-[#131b2e] text-[#dae2fd] transition-colors hover:text-[#ffc174]"
          aria-label="Go back"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
      </header>

      <main className="flex w-full max-w-lg flex-1 flex-col">
        <div className="mb-8 text-center md:text-left">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-[#334155] bg-[#222a3d] text-[#ffc174]">
            <span className="material-symbols-outlined text-[32px]">admin_panel_settings</span>
          </div>
          <h1 className="mb-2 text-[28px] leading-9 font-bold md:text-[32px]">Enable permissions</h1>
          <p className="text-base text-[#d8c3ad]">
            RoamHaul needs access to a few things to optimize your routing and document management.
          </p>
        </div>

        <div className="mb-8 flex-grow space-y-4">
          {CARDS.map((card) => {
            const granted = states[card.key] === 'granted';
            return (
              <div
                key={card.key}
                className="group flex items-start gap-4 rounded-xl border border-[#334155] bg-[#171f33] p-4 transition-all hover:border-[#534434]"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#334155] bg-[#060e20] text-[#dae2fd] transition-colors group-hover:border-[#ffc174]/50">
                  <span className="material-symbols-outlined">{card.icon}</span>
                </div>
                <div className="min-w-0 flex-grow">
                  <h3 className="mb-1 text-lg font-semibold">{card.title}</h3>
                  <p className="text-base leading-tight text-[#d8c3ad]">{card.description}</p>
                </div>
                <div className="shrink-0 self-center">
                  <button
                    type="button"
                    disabled={granted}
                    onClick={() => void request(card.key)}
                    className={`flex h-11 items-center justify-center rounded-lg text-sm font-medium transition-colors ${btnClass(card.variant, granted)}`}
                  >
                    {granted ? 'Granted' : card.actionLabel}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-auto pt-6">
          <button type="button" disabled={loading} onClick={() => void handleContinue()} className={haulPrimaryBtn}>
            Continue
          </button>
          <p className="mt-2 text-center text-sm text-[#d8c3ad]">
            You can change these later in settings.
          </p>
        </div>
      </main>
    </div>
  );
}
