import type { FareBreakdown } from '@roam/types/rides';
import type { EstimatedTollPlazaDto, TollUiState } from '@roam/types/tollCrossings';
import { Info, X } from 'lucide-react';
import React from 'react';

function formatMinor(minor: number, currency: string): string {
  const major = minor / 100;
  return `${currency} ${major.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export interface TollFareBreakdownSheetProps {
  open: boolean;
  onClose: () => void;
  currency: string;
  breakdown: FareBreakdown | null;
  plazas?: EstimatedTollPlazaDto[];
  state?: TollUiState;
  errorMessage?: string;
}

export function TollFareBreakdownSheet({
  open,
  onClose,
  currency,
  breakdown,
  plazas,
  state = 'data',
  errorMessage,
}: TollFareBreakdownSheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-xl max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Fare breakdown</h2>
          <button type="button" onClick={onClose} className="p-2 min-h-[44px] min-w-[44px]" aria-label="Close">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        {state === 'loading' && (
          <p className="text-sm text-slate-500 py-8 text-center">Loading fare details…</p>
        )}
        {state === 'error' && (
          <p className="text-sm text-red-600 py-8 text-center">{errorMessage ?? 'Could not load fare.'}</p>
        )}
        {state === 'empty' && (
          <p className="text-sm text-slate-500 py-8 text-center">No fare quote yet.</p>
        )}

        {state === 'data' && breakdown && (
          <div className="space-y-3">
            <Row label="Base fare" value={formatMinor(breakdown.base_minor, currency)} />
            <Row label="Distance" value={formatMinor(breakdown.distance_component_minor, currency)} />
            <Row label="Time" value={formatMinor(breakdown.time_component_minor, currency)} />
            {(breakdown.booking_fee_minor ?? 0) > 0 && (
              <Row label="Booking fee" value={formatMinor(breakdown.booking_fee_minor, currency)} />
            )}
            {(breakdown.estimated_tolls_minor ?? 0) > 0 && (
              <Row
                label="Estimated tolls"
                value={formatMinor(breakdown.estimated_tolls_minor ?? 0, currency)}
                hint
              />
            )}
            {breakdown.surge_multiplier > 1 && (
              <Row label={`Surge ×${breakdown.surge_multiplier}`} value="" />
            )}
            <div className="border-t border-slate-200 dark:border-slate-700 pt-3 flex justify-between font-semibold">
              <span className="text-slate-900 dark:text-white">Total estimate</span>
              <span className="tabular-nums text-slate-900 dark:text-white">
                {formatMinor(breakdown.fare_estimate_minor, currency)}
              </span>
            </div>
            {(plazas?.length ?? breakdown.estimated_tolls_plazas?.length) ? (
              <ul className="text-xs text-slate-500 space-y-1 pt-1">
                {(plazas ?? breakdown.estimated_tolls_plazas ?? []).map((p) => (
                  <li key={p.toll_plaza_id}>• {p.toll_plaza_name}</li>
                ))}
              </ul>
            ) : null}
            <p className="flex gap-2 text-xs text-slate-500 bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
              <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
              Final toll depends on the route taken. You won&apos;t be charged if the highway isn&apos;t used.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1">
        {label}
        {hint && <Info className="h-3.5 w-3.5" aria-label="Estimate only" />}
      </span>
      <span className="tabular-nums text-slate-900 dark:text-slate-200">{value}</span>
    </div>
  );
}
