import { MapPin, X } from 'lucide-react';
import React from 'react';

function formatMinor(minor: number, currency: string): string {
  return `${currency} ${(minor / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export interface DriverTollToastProps {
  plazaName: string;
  amountMinor: number;
  currency?: string;
  tripTotalMinor?: number;
  onDismiss?: () => void;
  persistent?: boolean;
}

export function DriverTollToast({
  plazaName,
  amountMinor,
  currency = 'JMD',
  tripTotalMinor,
  onDismiss,
  persistent = true,
}: DriverTollToastProps) {
  if (!plazaName) return null;

  return (
    <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/50">
      <MapPin className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
          Toll added: {plazaName}
        </p>
        <p className="text-xs text-emerald-700 dark:text-emerald-300 tabular-nums">
          {formatMinor(amountMinor, currency)}
          {tripTotalMinor != null && tripTotalMinor > amountMinor && (
            <> · Trip tolls {formatMinor(tripTotalMinor, currency)}</>
          )}
        </p>
      </div>
      {persistent && onDismiss && (
        <button type="button" onClick={onDismiss} className="p-1 min-h-[44px] min-w-[44px]" aria-label="Dismiss">
          <X className="h-4 w-4 text-emerald-600" />
        </button>
      )}
    </div>
  );
}
