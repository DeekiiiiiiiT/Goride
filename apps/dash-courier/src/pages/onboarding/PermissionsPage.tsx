import React, { useEffect, useState } from 'react';
import { OnboardingHeader } from '@/components/layout/OnboardingHeader';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import {
  checkCourierPermission,
  requestCourierPermission,
  type CourierPermissionId,
  type PermissionGrantState,
} from '@/lib/courierPermissions';
import { ensureCourierProfile } from '@/lib/ensureCourierProfile';

type PermissionCard = {
  id: CourierPermissionId;
  icon: string;
  title: string;
  description: React.ReactNode;
};

const PERMISSIONS: PermissionCard[] = [
  {
    id: 'location',
    icon: 'location_on',
    title: 'Location',
    description: (
      <>
        Crucial for routing and finding drop-offs.{' '}
        <span className="font-semibold text-on-surface">Please select &apos;Always allow&apos;.</span>
      </>
    ),
  },
  {
    id: 'notifications',
    icon: 'notifications_active',
    title: 'Notifications',
    description: 'Get instant alerts for new orders and important updates.',
  },
  {
    id: 'camera',
    icon: 'photo_camera',
    title: 'Camera',
    description: 'Needed to take photos of successful drop-offs.',
  },
];

type PermissionsPageProps = {
  onBack: () => void;
  onContinue: () => void;
};

export function PermissionsPage({ onBack, onContinue }: PermissionsPageProps) {
  const [granted, setGranted] = useState<Record<CourierPermissionId, PermissionGrantState>>({
    location: 'prompt',
    notifications: 'prompt',
    camera: 'prompt',
  });

  useEffect(() => {
    void Promise.all(
      PERMISSIONS.map(async (perm) => {
        const state = await checkCourierPermission(perm.id);
        return [perm.id, state] as const;
      }),
    ).then((results) => {
      setGranted((prev) => {
        const next = { ...prev };
        results.forEach(([id, state]) => {
          next[id] = state;
        });
        return next;
      });
    });
  }, []);

  const requestPermission = async (id: CourierPermissionId) => {
    const result = await requestCourierPermission(id);
    setGranted((prev) => ({ ...prev, [id]: result }));
  };

  const canContinue =
    granted.location === 'granted' && granted.notifications === 'granted';

  return (
    <div className="bg-background text-on-background min-h-full flex flex-col items-center">
      <div className="w-full max-w-[400px] min-h-full bg-background relative flex flex-col mx-auto">
        <OnboardingHeader title="Roam Dash Courier" onBack={onBack} variant="centered" />

        <div className="flex-1 flex flex-col px-[var(--spacing-edge)] py-6 overflow-y-auto pb-[100px]">
          <div className="mb-8">
            <h1 className="text-[28px] leading-9 font-bold tracking-tight mb-2">Enable permissions</h1>
            <p className="text-sm text-muted">
              We need a few permissions to ensure smooth deliveries and accurate earnings tracking.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {PERMISSIONS.map((perm) => {
              const state = granted[perm.id];
              const isGranted = state === 'granted';
              return (
                <div
                  key={perm.id}
                  className={`permission-card bg-surface rounded-xl p-4 border shadow-soft relative overflow-hidden transition-all ${
                    isGranted ? 'border-primary-container bg-primary-container/5' : 'border-outline-variant'
                  }`}
                >
                  {isGranted && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary-container" />
                  )}
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center shrink-0 text-primary">
                      <MaterialIcon name={perm.icon} filled />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold mb-1">{perm.title}</h3>
                      <p className="text-sm text-muted mb-3">{perm.description}</p>
                      <button
                        type="button"
                        onClick={() => void requestPermission(perm.id)}
                        disabled={isGranted || state === 'unsupported'}
                        className={`text-xs font-semibold uppercase tracking-wide px-4 py-2 rounded-full transition-colors active:scale-95 disabled:opacity-60 ${
                          isGranted
                            ? 'bg-primary-container text-on-primary-container'
                            : 'text-primary-container bg-surface-container-high hover:bg-primary-container hover:text-on-primary-container'
                        }`}
                      >
                        {isGranted ? 'Granted' : state === 'unsupported' ? 'Unsupported' : 'Allow Access'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[400px] bg-surface p-[var(--spacing-edge)] pb-safe shadow-[0_-8px_24px_rgba(0,0,0,0.06)] border-t border-surface-variant z-40">
          <button
            type="button"
            disabled={!canContinue}
            onClick={() => {
              void ensureCourierProfile().finally(onContinue);
            }}
            className="w-full bg-primary-container text-on-primary-container font-semibold text-xl py-4 rounded-xl shadow-[0_6px_12px_rgba(16,185,129,0.1)] hover:bg-primary-container/90 transition-all active:scale-[0.98] flex items-center justify-center gap-2 min-h-[56px] disabled:opacity-50"
          >
            Continue
            <MaterialIcon name="arrow_forward" className="text-[20px]" />
          </button>
        </div>
      </div>
    </div>
  );
}
