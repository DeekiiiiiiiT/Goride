import React, { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { DelegatedRiderListItem } from '@roam/types/delegatedRide';

const STATUS_DOT_BOOKER: Record<DelegatedRiderListItem['status'], string> = {
  picked_up: 'live-ride-riders__dot--picked-up',
  arrived: 'live-ride-riders__dot--arrived',
  en_route: 'live-ride-riders__dot--en-route',
  waiting: 'live-ride-riders__dot--waiting',
};

const STATUS_DOT_DEFAULT: Record<DelegatedRiderListItem['status'], string> = {
  picked_up: 'bg-emerald-500',
  arrived: 'bg-amber-400',
  en_route: 'bg-amber-400',
  waiting: 'bg-slate-300',
};

type Props = {
  riders: DelegatedRiderListItem[];
  /** Collapsed by default on the booker trip screen. */
  defaultOpen?: boolean;
  variant?: 'booker' | 'default';
};

function ridersSummaryLine(riders: DelegatedRiderListItem[]): string {
  const total = riders.length;
  const pickedUp = riders.filter((r) => r.status === 'picked_up').length;
  if (pickedUp === total) {
    return total === 1 ? 'Rider picked up' : `All ${total} riders picked up`;
  }
  if (pickedUp > 0) {
    return `${pickedUp} of ${total} picked up`;
  }
  const enRoute = riders.some((r) => r.status === 'en_route' || r.status === 'arrived');
  if (enRoute) {
    return total === 1 ? 'Driver en route to pickup' : 'Driver en route to pickups';
  }
  return total === 1 ? '1 rider on this trip' : `${total} riders on this trip`;
}

/**
 * Collapsible rider status list for book-for-someone trips (booker live tracker).
 * One rider today; list shape supports future multi-pickup.
 */
export function DelegatedRidersPanel({
  riders,
  defaultOpen = false,
  variant = 'booker',
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const summary = useMemo(() => ridersSummaryLine(riders), [riders]);

  if (riders.length === 0) return null;

  const isBooker = variant === 'booker';

  return (
    <div
      className={
        isBooker
          ? 'live-ride-riders'
          : 'rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900'
      }
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={isBooker ? 'live-ride-riders__toggle' : 'flex w-full items-center justify-between gap-3 px-4 py-3 text-left touch-manipulation'}
        aria-expanded={open}
      >
        <span className={isBooker ? 'live-ride-riders__toggle-text' : 'text-sm font-semibold text-slate-900 dark:text-white'}>
          {isBooker ? (
            <>
              <span className="live-ride-riders__toggle-label">
                {open ? 'Hide updates' : 'View updates'}
              </span>
              {!open ? (
                <span className="live-ride-riders__toggle-summary">{summary}</span>
              ) : null}
            </>
          ) : (
            `Riders (${riders.length})`
          )}
        </span>
        <ChevronDown
          className={
            isBooker
              ? `live-ride-riders__chevron ${open ? 'live-ride-riders__chevron--open' : ''}`
              : `size-5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`
          }
          aria-hidden
        />
      </button>
      {open ? (
        <ul className={isBooker ? 'live-ride-riders__list' : 'border-t border-slate-100 px-2 pb-2 dark:border-slate-800'}>
          {riders.map((rider) => (
            <li
              key={rider.id}
              className={isBooker ? 'live-ride-riders__item' : 'flex items-center gap-3 rounded-xl px-2 py-2.5'}
            >
              <span
                className={
                  isBooker
                    ? `live-ride-riders__dot ${STATUS_DOT_BOOKER[rider.status]}`
                    : `h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT_DEFAULT[rider.status]}`
                }
                aria-hidden
              />
              <span
                className={
                  isBooker
                    ? 'live-ride-riders__name'
                    : 'min-w-0 flex-1 truncate text-sm font-medium text-slate-900 dark:text-white'
                }
              >
                {rider.name}
              </span>
              <span
                className={
                  isBooker
                    ? 'live-ride-riders__status'
                    : 'shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400'
                }
              >
                {rider.statusLabel}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
