import React, { useEffect, useMemo, useState } from 'react';
import type { AppPermissionPolicyRow } from '@roam/types';
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
  permissions: AppPermissionPolicyRow[];
  open: boolean;
  onClose: () => void;
};

export function PermissionOnboardingSheet({ permissions, open, onClose }: Props) {
  const surface = 'driver' as const;
  const [grantStates, setGrantStates] = useState<Record<string, PermissionGrantState>>({});

  const webItems = useMemo(() => {
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
  }, [permissions, grantStates]);

  const nativeItems = useMemo(
    () => permissions.filter((p) => p.enabled && p.platform === 'native'),
    [permissions],
  );

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const next: Record<string, PermissionGrantState> = {};
      for (const row of permissions) {
        if (!isWebApplicable(row.platform)) continue;
        next[row.key] = await permissionKeyToGrantChecker(row.key)();
      }
      setGrantStates(next);
    })();
  }, [open, permissions]);

  if (!open) return null;

  const requestForKey = async (key: string) => {
    let state: PermissionGrantState = 'unsupported';
    if (key.startsWith('location')) state = await requestGeolocationPermission();
    else if (key === 'notifications') state = await requestNotificationPermission();
    setGrantStates((prev) => ({ ...prev, [key]: state }));
    if (state === 'granted') markOnboardingDismissed(surface, key);
  };

  const dismissAll = () => {
    for (const item of webItems) markOnboardingDismissed(surface, item.key);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-xl space-y-4 max-h-[85vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Driver permissions
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Keep Roam Driver open during trips. Allow location and notifications for offers and
          automatic trip updates.
        </p>

        {webItems.length > 0 && (
          <ul className="space-y-3">
            {webItems.map((row) => (
              <li
                key={row.key}
                className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2"
              >
                <p className="font-medium text-sm">{row.label}</p>
                <p className="text-xs text-slate-500">{row.description}</p>
                <button
                  type="button"
                  className="w-full rounded-lg bg-emerald-600 text-white text-sm font-semibold py-2"
                  onClick={() => void requestForKey(row.key)}
                >
                  {grantStates[row.key] === 'granted' ? 'Allowed' : 'Allow'}
                </button>
              </li>
            ))}
          </ul>
        )}

        {nativeItems.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase text-slate-500">Native app (coming)</p>
            <ul className="space-y-2">
              {nativeItems.map((row) => (
                <li
                  key={row.key}
                  className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-2.5 text-xs text-slate-600 dark:text-slate-400"
                >
                  <span className="font-medium text-slate-800 dark:text-slate-200">{row.label}</span>
                  {' — '}
                  {row.description}
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          type="button"
          onClick={dismissAll}
          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 py-2.5 text-sm font-medium"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
