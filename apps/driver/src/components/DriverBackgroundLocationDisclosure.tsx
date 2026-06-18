import React from 'react';
import { createPortal } from 'react-dom';
import { MapPin } from 'lucide-react';
import { useDispatchConfig } from '@roam/hauler-dispatch';
import { acceptDriverBackgroundLocationDisclosure } from '../utils/driverLocationDisclosure';

type Props = {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
};

export function DriverBackgroundLocationDisclosure({ open, onAccept, onDecline }: Props) {
  const { ui, dispatchMode } = useDispatchConfig();
  const isHaul = dispatchMode === 'haulage';

  if (!open || typeof document === 'undefined') return null;

  const handleAccept = () => {
    acceptDriverBackgroundLocationDisclosure();
    onAccept();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onDecline}
    >
      <div
        className={
          isHaul
            ? 'w-full max-w-sm space-y-5 rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl'
            : 'w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-2xl dark:border dark:border-slate-700 dark:bg-slate-900'
        }
        role="dialog"
        aria-labelledby="driver-location-disclosure-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            className={
              isHaul
                ? 'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400'
                : 'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
            }
          >
            <MapPin className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 space-y-1">
            <h2
              id="driver-location-disclosure-title"
              className={
                isHaul
                  ? 'text-lg font-semibold text-slate-100'
                  : 'text-lg font-semibold text-slate-900 dark:text-white'
              }
            >
              Location required
            </h2>
            <p className={isHaul ? 'text-sm leading-relaxed text-slate-400' : 'text-sm leading-relaxed text-slate-600 dark:text-slate-300'}>
              {ui.appName} needs your location to match you with nearby{' '}
              {isHaul ? 'freight jobs' : 'ride offers'} and update trips while you are online.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={handleAccept}
            className={
              isHaul
                ? 'w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-400'
                : 'w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-500'
            }
          >
            Continue
          </button>
          <button
            type="button"
            onClick={onDecline}
            className={
              isHaul
                ? 'w-full rounded-xl border border-slate-600 py-3 text-sm font-medium text-slate-200 hover:bg-slate-800'
                : 'w-full rounded-xl border border-slate-200 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'
            }
          >
            Not now
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
