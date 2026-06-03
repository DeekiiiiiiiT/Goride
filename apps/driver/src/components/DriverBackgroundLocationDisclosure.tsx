import React from 'react';
import { MapPin } from 'lucide-react';
import { acceptDriverBackgroundLocationDisclosure } from '../utils/driverLocationDisclosure';

type Props = {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
};

export function DriverBackgroundLocationDisclosure({ open, onAccept, onDecline }: Props) {
  if (!open) return null;

  const handleAccept = () => {
    acceptDriverBackgroundLocationDisclosure();
    onAccept();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 p-4 sm:items-center"
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-xl space-y-3"
        role="dialog"
        aria-labelledby="driver-location-disclosure-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400">
            <MapPin className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2
              id="driver-location-disclosure-title"
              className="text-base font-semibold text-slate-900 dark:text-white"
            >
              Location required
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Roam Driver needs your location for this feature.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleAccept}
            className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white"
          >
            Continue
          </button>
          <button
            type="button"
            onClick={onDecline}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
