import React from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../ui/alert-dialog";
import { Trip } from "../../types/data";

interface DeleteConfirmationDialogProps {
  trip: Trip | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isDeleting?: boolean;
  /** When false, the pay week is already locked and the payout will not change. */
  weekOpen?: boolean;
}

function money(amount: number | null | undefined): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-JM', { style: 'currency', currency: 'JMD' }).format(n);
}

function when(value: string | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toLocaleString('en-JM', { dateStyle: 'medium', timeStyle: 'short' });
}

export function DeleteConfirmationDialog({ trip, open, onOpenChange, onConfirm, isDeleting, weekOpen = true }: DeleteConfirmationDialogProps) {
  if (!trip) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-rose-600">Delete this trip?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-muted-foreground text-sm">
              <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-md border border-slate-100 dark:border-slate-800 text-sm space-y-1">
                <p><strong>Date:</strong> {when(trip.requestTime || trip.date)}</p>
                <p><strong>Amount:</strong> {money(trip.amount)}</p>
                <p><strong>Driver:</strong> {trip.driverName || '—'}</p>
              </div>
              <p className="mt-3">
                {weekOpen
                  ? 'This fare and its cash will come off that driver’s open pay week.'
                  : 'This trip will leave analytics. That pay week is already locked, so the payout stays as it was.'}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            className="bg-rose-600 hover:bg-rose-700 text-white"
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete trip'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
