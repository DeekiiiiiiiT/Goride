import React, { useEffect, useMemo, useState } from 'react';
import type { AppPermissionPolicyRow, AppPermissionSurface } from '@roam/types';
import {
  isWebApplicable,
  markOnboardingDismissed,
  permissionKeyToGrantChecker,
  readOnboardingDismissed,
  requestGeolocationPermission,
  requestNotificationPermission,
  requestContactsPermission,
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
        const check = permissionKeyToGrantChecker(row.key);
        next[row.key] = await check();
      }
      setGrantStates(next);
    })();
  }, [open, permissions]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || items.length === 0) return null;

  const requestForKey = async (key: string) => {
    let state: PermissionGrantState = 'unsupported';
    if (key.startsWith('location')) state = await requestGeolocationPermission();
    else if (key === 'notifications') state = await requestNotificationPermission();
    else if (key === 'contacts_split_fare') state = await requestContactsPermission();
    setGrantStates((prev) => ({ ...prev, [key]: state }));
    if (state === 'granted') markOnboardingDismissed(surface, key);
  };

  const dismissAll = () => {
    for (const item of items) markOnboardingDismissed(surface, item.key);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col justify-end bg-black/40 sm:justify-center sm:p-4"
      role="presentation"
      onClick={dismissAll}
    >
      <div
        className="mx-auto flex w-full max-w-md max-h-[min(92dvh,100%)] flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl sm:max-h-[85dvh] sm:rounded-3xl"
        style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom, 0px))' }}
        role="dialog"
        aria-labelledby="perm-onboarding-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 pb-3 pt-5">
          <h2 id="perm-onboarding-title" className="text-lg font-semibold text-zinc-900">
            Permissions for the best ride experience
          </h2>
          <p className="mt-2 text-sm text-zinc-600">
            Roam needs a few device permissions. You can change these anytime in your browser or
            phone settings.
          </p>
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-2"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <ul className="space-y-3">
            {items.map((row) => (
              <li
                key={row.key}
                className="flex flex-col gap-2 rounded-2xl border border-zinc-200 p-3"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-900">{row.label}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{row.description}</p>
                </div>
                <button
                  type="button"
                  className="rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white"
                  onClick={() => void requestForKey(row.key)}
                >
                  {grantStates[row.key] === 'granted' ? 'Allowed' : 'Allow'}
                </button>
              </li>
            ))}
          </ul>

          {nativeItems.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Native app (coming soon)
              </p>
              <ul className="space-y-2">
                {nativeItems.map((row) => (
                  <li
                    key={row.key}
                    className="rounded-xl border border-dashed border-zinc-200 p-2.5 text-xs text-zinc-600"
                  >
                    <span className="font-medium text-zinc-800">{row.label}</span>
                    {' — '}
                    {row.description}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-zinc-100 bg-white px-5 py-4">
          <button
            type="button"
            onClick={dismissAll}
            className="btn-touch w-full rounded-2xl border border-zinc-200 py-3 text-sm font-semibold text-zinc-800"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
