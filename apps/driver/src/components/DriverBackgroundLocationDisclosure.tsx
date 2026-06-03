import React from 'react';
import { MapPin } from 'lucide-react';
import { ROAM_LEGAL } from '@roam/business-config/legalUrls';
import { isNativeCapacitorPlatform } from '@roam/types';
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
        className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-xl space-y-4"
        role="dialog"
        aria-labelledby="driver-location-disclosure-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400">
            <MapPin className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 space-y-2">
            <h2
              id="driver-location-disclosure-title"
              className="text-lg font-semibold text-slate-900 dark:text-white"
            >
              Location access required
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Roam Driver collects your <strong>precise location</strong>, including when the app is
              in the background or your screen is off, so we can:
            </p>
            <ul className="text-sm text-slate-600 dark:text-slate-300 list-disc pl-5 space-y-1">
              <li>Send you nearby ride requests while you are online</li>
              <li>Show passengers your live approach during active trips</li>
              <li>Calculate trip distance and fares accurately</li>
            </ul>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Passengers see your location only during assigned trips. Details are in our{' '}
              <a
                href={ROAM_LEGAL.privacyPolicyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-emerald-700 dark:text-emerald-400 underline underline-offset-2"
              >
                Privacy Policy
              </a>
              .
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            onClick={handleAccept}
            className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white"
          >
            {isNativeCapacitorPlatform()
              ? 'Continue — allow location'
              : 'I understand — continue'}
          </button>
          <button
            type="button"
            onClick={onDecline}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 py-3 text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
