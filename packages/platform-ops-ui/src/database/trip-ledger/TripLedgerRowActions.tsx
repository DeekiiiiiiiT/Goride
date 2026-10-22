import type { MouseEvent } from 'react';
import type { Trip } from '@roam/types';
import { Map, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@roam/ui';

export interface TripLedgerRowActions {
  onEdit: (trip: Trip) => void;
  onDelete: (trip: Trip) => void;
  onViewRoute: (trip: Trip) => void;
}

/** Trips logged in the app. Platform CSV imports stay read-only. */
export function isAppLoggedTrip(trip: { id?: string; isManual?: unknown; batchId?: string | null }): boolean {
  if (trip.isManual === true || trip.isManual === 'true') return true;
  const id = String(trip.id || '');
  if (id.startsWith('manual_')) return true;
  const batch = String(trip.batchId || '');
  return batch === 'live_driver_app' || batch === 'manual_entry';
}

export function TripLedgerDesktopMenu({
  trip,
  actions,
}: {
  trip: Trip;
  actions: TripLedgerRowActions;
}) {
  if (!isAppLoggedTrip(trip)) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="hidden md:inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          title="Trip actions"
          aria-label="Trip actions"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-slate-400">
          Trip actions
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => actions.onEdit(trip)}>
          <Pencil className="h-3.5 w-3.5" />
          Edit trip
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => actions.onViewRoute(trip)}>
          <Map className="h-3.5 w-3.5" />
          View route
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer gap-2 text-rose-700 focus:text-rose-700"
          onClick={() => actions.onDelete(trip)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete trip
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TripLedgerPhoneActions({
  trip,
  actions,
}: {
  trip: Trip;
  actions: TripLedgerRowActions;
}) {
  if (!isAppLoggedTrip(trip)) return null;
  const stop = (e: MouseEvent) => e.stopPropagation();
  return (
    <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-slate-700" onClick={stop}>
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        onClick={() => actions.onEdit(trip)}
      >
        <Pencil className="h-4 w-4" />
        Edit trip
      </button>
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        onClick={() => actions.onViewRoute(trip)}
      >
        <Map className="h-4 w-4" />
        View route
      </button>
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 text-sm font-medium text-rose-700 dark:border-rose-900 dark:bg-slate-900"
        onClick={() => actions.onDelete(trip)}
      >
        <Trash2 className="h-4 w-4" />
        Delete trip
      </button>
    </div>
  );
}
