import React from 'react';

function formatMinor(minor: number, currency: string): string {
  return `${currency} ${(minor / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export interface TripTollReceiptSectionProps {
  baseMinor: number;
  actualTollsMinor: number;
  estimatedTollsMinor?: number;
  waitTimeMinor?: number;
  totalMinor: number;
  currency?: string;
}

export function TripTollReceiptSection({
  baseMinor,
  actualTollsMinor,
  estimatedTollsMinor = 0,
  waitTimeMinor = 0,
  totalMinor,
  currency = 'JMD',
}: TripTollReceiptSectionProps) {
  const tollCredit = Math.max(0, estimatedTollsMinor - actualTollsMinor);

  return (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between text-slate-600 dark:text-slate-400">
        <span>Base fare</span>
        <span className="tabular-nums">{formatMinor(baseMinor, currency)}</span>
      </div>
      {actualTollsMinor > 0 && (
        <div className="flex justify-between text-slate-600 dark:text-slate-400">
          <span>Tolls</span>
          <span className="tabular-nums">+{formatMinor(actualTollsMinor, currency)}</span>
        </div>
      )}
      {waitTimeMinor > 0 && (
        <div className="flex justify-between text-slate-600 dark:text-slate-400">
          <span>Wait time</span>
          <span className="tabular-nums">+{formatMinor(waitTimeMinor, currency)}</span>
        </div>
      )}
      {tollCredit > 0 && (
        <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
          <span>Toll adjustment</span>
          <span className="tabular-nums">−{formatMinor(tollCredit, currency)}</span>
        </div>
      )}
      <div className="flex justify-between font-semibold text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-700">
        <span>Total</span>
        <span className="tabular-nums">{formatMinor(totalMinor, currency)}</span>
      </div>
    </div>
  );
}
