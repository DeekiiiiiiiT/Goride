import React, { useEffect, useMemo, useState } from 'react';
import type { AppPermissionPolicyRow, AppPermissionSurface } from '@roam/types';
import {
  isWebApplicable,
  markOnboardingDismissed,
  permissionKeyToGrantChecker,
  readOnboardingDismissed,
  requestGeolocationPermission,
  requestNotificationPermission,
  shouldShowOnboardingPrompt,
  type PermissionGrantState,
} from '@roam/types';

type Props = {
  surface: AppPermissionSurface;
  permissions: AppPermissionPolicyRow[];
  open: boolean;
  onClose: () => void;
};

export function PermissionOnboardingSheet({ surface, permissions, open, onClose }: Props) {
  const [grantStates, setGrantStates] = useState<Record<string, PermissionGrantState>>({});

  const items = useMemo(() => {
    return permissions.filter(
      (p) =>
        p.enabled &&
        p.prompt_onboarding &&
        isWebApplicable(p.platform) &&
        shouldShowOnboardingPrompt(
          p,
          grantStates[p.key] ?? 'prompt',
          readOnboardingDismissed(surface, p.key),
        ),
    );
  }, [permissions, grantStates, surface]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const next: Record<string, PermissionGrantState> = {};
      for (const row of permissions) {
        if (!isWebApplicable(row.platform)) continue;
        const check = permissionKeyToGrantChecker(row.key);
        next[row.key] = await check();
      }
      setGrantStates(next);
    })();
  }, [open, permissions]);

  if (!open || items.length === 0) return null;

  const requestForKey = async (key: string) => {
    let state: PermissionGrantState = 'unsupported';
    if (key.startsWith('location')) state = await requestGeolocationPermission();
    else if (key === 'notifications') state = await requestNotificationPermission();
    setGrantStates((prev) => ({ ...prev, [key]: state }));
    if (state === 'granted') markOnboardingDismissed(surface, key);
  };

  const dismissAll = () => {
    for (const item of items) markOnboardingDismissed(surface, item.key);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl space-y-4"
        role="dialog"
        aria-labelledby="perm-onboarding-title"
      >
        <h2 id="perm-onboarding-title" className="text-lg font-semibold text-zinc-900">
          Permissions for the best ride experience
        </h2>
        <p className="text-sm text-zinc-600">
          Roam needs a few device permissions. You can change these anytime in your browser or phone
          settings.
        </p>
        <ul className="space-y-3">
          {items.map((row) => (
            <li
              key={row.key}
              className="rounded-2xl border border-zinc-200 p-3 flex flex-col gap-2"
            >
              <div>
                <p className="font-medium text-sm text-zinc-900">{row.label}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{row.description}</p>
              </div>
              <button
                type="button"
                className="rounded-xl bg-emerald-600 text-white text-sm font-semibold py-2.5"
                onClick={() => void requestForKey(row.key)}
              >
                {grantStates[row.key] === 'granted' ? 'Allowed' : 'Allow'}
              </button>
            </li>
          ))}
          {permissions
            .filter((p) => p.enabled && p.platform === 'native')
            .slice(0, 4)
            .map((row) => (
              <li
                key={row.key}
                className="rounded-2xl border border-dashed border-zinc-200 p-3 opacity-80"
              >
                <p className="font-medium text-sm text-zinc-700">{row.label}</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Native app only — required when Roam Driver/Rides native ships.
                </p>
              </li>
            ))}
        </ul>
        <button
          type="button"
          onClick={dismissAll}
          className="w-full rounded-2xl border border-zinc-200 py-2.5 text-sm font-medium text-zinc-700"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
