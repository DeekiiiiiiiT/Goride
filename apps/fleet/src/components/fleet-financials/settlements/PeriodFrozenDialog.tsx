/**
 * Operator-facing gate when Pay/Collect hits a Close Week freeze.
 * Sends them to Close Week instead of a raw PERIOD_FROZEN toast.
 */
import React from 'react';
import { addDays, format, parseISO } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../ui/alert-dialog';

export type PeriodFrozenDialogState = {
  weekKey: string;
  driverName?: string;
} | null;

function weekLabel(weekKey: string): string {
  try {
    const start = parseISO(`${weekKey.slice(0, 10)}T12:00:00`);
    const end = addDays(start, 6);
    return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
  } catch {
    return weekKey.slice(0, 10);
  }
}

export function PeriodFrozenDialog({
  state,
  onOpenChange,
  onOpenCloseWeek,
}: {
  state: PeriodFrozenDialogState;
  onOpenChange: (open: boolean) => void;
  onOpenCloseWeek: (weekKey: string) => void;
}) {
  const weekKey = state?.weekKey?.slice(0, 10) || '';
  const driver = state?.driverName?.trim();

  return (
    <AlertDialog open={!!state} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>This week is closed</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2 text-left">
            <span className="block">
              {driver ? (
                <>
                  <span className="font-medium text-slate-800">{driver}</span>
                  {' · '}
                </>
              ) : null}
              <span className="font-medium text-slate-800">{weekLabel(weekKey)}</span>
            </span>
            <span className="block">
              Pay and Collect are locked. Open Close Week and use <strong>Re-open week</strong> if you
              still need to move money, then close again when the desk is clear.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (weekKey) onOpenCloseWeek(weekKey);
            }}
          >
            Open Close Week
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
