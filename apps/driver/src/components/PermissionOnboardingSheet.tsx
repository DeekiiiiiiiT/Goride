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
import { useDispatchConfig } from '@roam/hauler-dispatch';
import { hasAcceptedDriverBackgroundLocationDisclosure } from '../utils/driverLocationDisclosure';
import { DriverBackgroundLocationDisclosure } from './DriverBackgroundLocationDisclosure';

type Props = {
  permissions: AppPermissionPolicyRow[];
  open: boolean;
  onClose: () => void;
  /** Inline card for embedded surfaces (e.g. Roam Haul); modal overlay for driver app. */
  variant?: 'modal' | 'inline';
};

export function PermissionOnboardingSheet({
  permissions,
  open,
  onClose,
  variant = 'modal',
}: Props) {
  const { ui, dispatchMode } = useDispatchConfig();
  const surface = 'driver' as const;
  const [grantStates, setGrantStates] = useState<Record<string, PermissionGrantState>>({});
  const [locationDisclosureOpen, setLocationDisclosureOpen] = useState(false);
  const [pendingLocationKey, setPendingLocationKey] = useState<string | null>(null);

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
    () =>
      ui.showNativePermissionPlaceholders
        ? permissions.filter((p) => p.enabled && p.platform === 'native')
        : [],
    [permissions, ui.showNativePermissionPlaceholders],
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
    if (key.startsWith('location') && !hasAcceptedDriverBackgroundLocationDisclosure()) {
      setPendingLocationKey(key);
      setLocationDisclosureOpen(true);
      return;
    }
    let state: PermissionGrantState = 'unsupported';
    if (key.startsWith('location')) state = await requestGeolocationPermission();
    else if (key === 'notifications') state = await requestNotificationPermission();
    setGrantStates((prev) => ({ ...prev, [key]: state }));
    if (state === 'granted') markOnboardingDismissed(surface, key);
  };

  const completePendingLocationRequest = async () => {
    const key = pendingLocationKey;
    setPendingLocationKey(null);
    setLocationDisclosureOpen(false);
    if (!key) return;
    const state = await requestGeolocationPermission();
    setGrantStates((prev) => ({ ...prev, [key]: state }));
    if (state === 'granted') markOnboardingDismissed(surface, key);
  };

  const dismissAll = () => {
    for (const item of webItems) markOnboardingDismissed(surface, item.key);
    onClose();
  };

  const isInline = variant === 'inline';
  const panelClass = isInline
    ? 'w-full rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4'
    : 'w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-xl space-y-4 max-h-[85vh] overflow-y-auto';

  const content = (
    <div className={panelClass}>
      <div className="space-y-1">
        <h2
          className={
            isInline
              ? 'text-lg font-semibold text-slate-100'
              : 'text-lg font-semibold text-slate-900 dark:text-white'
          }
        >
          {ui.permissionTitle}
        </h2>
        <p className={isInline ? 'text-sm text-slate-400' : 'text-sm text-slate-600 dark:text-slate-400'}>
          {ui.permissionDescription}
        </p>
      </div>

      {webItems.length > 0 && (
        <ul className="space-y-3">
          {webItems.map((row) => {
            const granted = grantStates[row.key] === 'granted';
            return (
              <li
                key={row.key}
                className={
                  isInline
                    ? 'rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2'
                    : 'rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2'
                }
              >
                <p
                  className={
                    isInline
                      ? 'text-sm font-medium text-slate-100'
                      : 'font-medium text-sm text-slate-900 dark:text-white'
                  }
                >
                  {row.label}
                </p>
                <p className="text-xs text-slate-500">
                  {dispatchMode === 'haulage' && row.key === 'notifications'
                    ? 'Freight job offers and trip updates'
                    : dispatchMode === 'haulage' && row.key.startsWith('location')
                      ? 'Matching, trip GPS, and job updates'
                      : row.description}
                </p>
                <button
                  type="button"
                  disabled={granted}
                  className={
                    isInline
                      ? 'w-full rounded-lg bg-amber-500 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:cursor-default disabled:opacity-70'
                      : 'w-full rounded-lg bg-emerald-600 text-white text-sm font-semibold py-2 disabled:opacity-70'
                  }
                  onClick={() => void requestForKey(row.key)}
                >
                  {granted ? 'Allowed' : 'Allow'}
                </button>
              </li>
            );
          })}
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
        className={
          isInline
            ? 'w-full rounded-xl border border-slate-700 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800'
            : 'w-full rounded-xl border border-slate-200 dark:border-slate-700 py-2.5 text-sm font-medium'
        }
      >
        Continue
      </button>
    </div>
  );

  return (
    <>
      <DriverBackgroundLocationDisclosure
        open={locationDisclosureOpen}
        onAccept={() => void completePendingLocationRequest()}
        onDecline={() => {
          setLocationDisclosureOpen(false);
          setPendingLocationKey(null);
        }}
      />
      {isInline ? (
        content
      ) : (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4">{content}</div>
      )}
    </>
  );
}
