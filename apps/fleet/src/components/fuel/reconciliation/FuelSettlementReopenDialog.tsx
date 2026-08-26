/**
 * Confirm dialog when fuel finalize would change leftover on a week with payouts.
 * z-[250] sits above FleetBusyLock (z-[200]) so bulk finalize can still confirm.
 */
import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
} from '../../ui/alert-dialog';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog@1.1.6';
import { cn } from '../../ui/utils';
import type { FuelSettlementReopenImpact } from '../../../utils/fuelFinalizeSettlementImpact';

const MONEY = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function FuelSettlementReopenDialog({
  open,
  impacts,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  impacts: FuelSettlementReopenImpact[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialogPortal>
        <AlertDialogOverlay className="z-[250]" />
        <AlertDialogPrimitive.Content
          data-slot="alert-dialog-content"
          className={cn(
            'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-[250] grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg',
          )}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Reopen settlement for paid week(s)?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-slate-600">
                <p>
                  You already paid the driver for {impacts.length === 1 ? 'this week' : 'these weeks'}.
                  Locking fuel again will keep those payouts, but the leftover balance will change.
                </p>
                <ul className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-amber-200 bg-amber-50/60 p-3 text-slate-800">
                  {impacts.map((row) => (
                    <li key={`${row.driverId}|${row.weekStart}`} className="text-xs leading-relaxed">
                      <span className="font-medium">{row.weekStart}</span>
                      <span className="text-slate-500"> · paid ${MONEY(row.settlementPaid)}</span>
                      <br />
                      {row.beforeLabel} → {row.afterLabel}
                    </li>
                  ))}
                </ul>
                <p>Confirm only if you accept the new leftover.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-700 hover:bg-amber-800"
              onClick={onConfirm}
            >
              Reopen settlement & finalize
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogPrimitive.Content>
      </AlertDialogPortal>
    </AlertDialog>
  );
}
