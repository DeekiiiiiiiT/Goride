import React, { useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { settleLocationConsent, subscribeLocationConsent } from '@/lib/locationConsent';

/**
 * Play requires this screen immediately before the system location prompt.
 * Wording must cover background use because the app declares background location.
 */
export function LocationConsentDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => subscribeLocationConsent(setOpen), []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 px-4 pb-safe sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-consent-title"
        className="w-full max-w-md rounded-3xl bg-surface p-6 shadow-xl"
      >
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MaterialIcon name="location_on" className="text-[28px]" filled />
        </div>
        <h2 id="location-consent-title" className="mb-3 text-2xl font-semibold text-on-surface">
          Allow location access
        </h2>
        <p className="text-base text-on-surface-variant">
          Roam Rush Courier collects location data to match you with nearby deliveries and guide
          you to the pickup and drop-off even when the app is closed or not in use.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => settleLocationConsent(true)}
            className="flex h-14 w-full items-center justify-center rounded-xl bg-primary text-xl font-semibold text-on-primary active:scale-[0.98]"
          >
            Continue
          </button>
          <button
            type="button"
            onClick={() => settleLocationConsent(false)}
            className="flex h-14 w-full items-center justify-center rounded-xl border border-outline-variant text-xl font-semibold text-on-surface-variant"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
