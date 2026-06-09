import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { DelegatedRiderListItem } from '@roam/types/delegatedRide';

const STATUS_DOT: Record<DelegatedRiderListItem['status'], string> = {
  picked_up: 'bg-emerald-500',
  arrived: 'bg-amber-400',
  en_route: 'bg-amber-400',
  waiting: 'bg-slate-300',
};

type Props = {
  riders: DelegatedRiderListItem[];
  defaultOpen?: boolean;
};

export function DelegatedRidersPanel({ riders, defaultOpen = true }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  if (riders.length === 0) return null;

  return (
    <div className="mb-3 rounded-2xl border border-slate-200/90 bg-white dark:border-slate-700 dark:bg-slate-900">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left touch-manipulation"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-slate-900 dark:text-white">
          Riders ({riders.length})
        </span>
        <ChevronDown
          className={`size-5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open ? (
        <ul className="border-t border-slate-100 px-2 pb-2 dark:border-slate-800">
          {riders.map((rider) => (
            <li key={rider.id} className="flex items-center gap-3 rounded-xl px-2 py-2.5">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[rider.status]}`}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 dark:text-white">
                {rider.name}
              </span>
              <span className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">
                {rider.statusLabel}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
