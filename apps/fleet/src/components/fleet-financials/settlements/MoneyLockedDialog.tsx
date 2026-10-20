/**
 * Informational dialog when residual settle-up is provisional (fuel/tolls not clear).
 * Log Cash is receipt-first and must NOT use this as a hard block — callers should
 * only open this for Pay residual or legacy paths, never to refuse a cash receipt.
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

export type MoneyLockedDialogState = {
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

export function MoneyLockedDialog({
  state,
  onOpenChange,
  onOpenCloseWeek,
}: {
  state: MoneyLockedDialogState;
  onOpenChange: (open: boolean) => void;
  onOpenCloseWeek: (weekKey: string) => void;
}) {
  const weekKey = state?.weekKey?.slice(0, 10) || '';
  const driver = state?.driverName?.trim();

  return (
    <AlertDialog open={!!state} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Settlement residual still provisional</AlertDialogTitle>
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
              Fuel and toll reconciliation for this week is not finished yet, so who-owes figures
              may still change. You can still Log cash (tagged to this week) — finish recon when
              ready so residual settles cleanly.
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
