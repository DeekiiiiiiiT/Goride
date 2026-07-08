import type { TollCrossingDto } from '@roam/types/tollCrossings';
import { ExternalLink, MapPin, X } from 'lucide-react';
import React from 'react';

function formatMinor(minor: number, currency: string): string {
  return `${currency} ${(minor / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export interface AdminTripTollDrawerProps {
  rideId: string | null;
  crossings: TollCrossingDto[];
  actualTollsMinor: number;
  currency?: string;
  onOpenPlaza?: (plazaId: string) => void;
  onClose: () => void;
}

export function AdminTripTollDrawer({
  rideId,
  crossings,
  actualTollsMinor,
  currency = 'JMD',
  onOpenPlaza,
  onClose,
}: AdminTripTollDrawerProps) {
  if (!rideId) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md">
      <button type="button" className="flex-1 bg-black/30" aria-label="Close" onClick={onClose} />
      <aside className="w-full max-w-md bg-white dark:bg-slate-900 shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-4 py-3">
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">Trip tolls</h2>
            <p className="text-xs text-slate-500 truncate max-w-[240px]">{rideId}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 min-h-[44px] min-w-[44px]" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
          <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {formatMinor(actualTollsMinor, currency)}
          </p>
          <p className="text-xs text-slate-500">{crossings.length} crossing(s)</p>
        </div>
        <ul className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {crossings.length === 0 && (
            <li className="p-6 text-center text-sm text-slate-500">No toll crossings recorded.</li>
          )}
          {crossings.map((c, i) => (
            <li key={`${c.toll_plaza_id}-${i}`} className="px-4 py-3 flex gap-3">
              <MapPin className="h-4 w-4 text-slate-400 mt-1 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900 dark:text-white">{c.toll_plaza_name}</p>
                <p className="text-sm tabular-nums text-slate-600 dark:text-slate-400">
                  {formatMinor(c.toll_amount_minor, c.currency ?? currency)}
                </p>
                {c.crossed_at && (
                  <p className="text-xs text-slate-400">{new Date(c.crossed_at).toLocaleString()}</p>
                )}
              </div>
              {onOpenPlaza && (
                <button
                  type="button"
                  className="p-2 text-emerald-600"
                  aria-label="Open in Toll Database"
                  onClick={() => onOpenPlaza(c.toll_plaza_id)}
                >
                  <ExternalLink className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
