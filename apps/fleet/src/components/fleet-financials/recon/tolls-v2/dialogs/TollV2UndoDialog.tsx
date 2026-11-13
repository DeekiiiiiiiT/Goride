import React from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../../ui/alert-dialog';
import type { TollV2Charge } from '../types';
import { chargeWhen, decisionKindLabel, fmtTollMinor, formatDecidedAt } from '../tollV2Format';
import { TollV2DangerOutlineButton, TollV2SecondaryButton } from '../TollV2Buttons';

export function TollV2UndoDialog({
  open,
  onOpenChange,
  charge,
  onUndo,
  busy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  charge: TollV2Charge | null;
  onUndo: () => void;
  busy: boolean;
}) {
  if (!charge) return null;
  const d = charge.decision;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Undo this decision?</AlertDialogTitle>
        </AlertDialogHeader>
        <div className="rounded-xl border border-[#e5eeff] p-3 text-sm">
          <p className="font-medium">{charge.plazaName || 'Toll'} · {fmtTollMinor(charge.amountMinor)}</p>
          <p className="text-[#47464c]">{chargeWhen(charge.occurredAt)}</p>
          <span className="mt-2 inline-block rounded-full bg-[#eff4ff] px-2 py-0.5 text-xs font-semibold">
            {decisionKindLabel(d?.kind)}
          </span>
          <p className="mt-2 text-xs text-[#47464c]">{formatDecidedAt(d?.at, d?.by)}</p>
        </div>
        <p className="text-xs text-[#47464c]">The toll goes back to the list for you to decide again.</p>
        <AlertDialogFooter>
          <TollV2SecondaryButton type="button" onClick={() => onOpenChange(false)}>
            Keep it
          </TollV2SecondaryButton>
          <TollV2DangerOutlineButton type="button" disabled={busy} onClick={onUndo}>
            Undo
          </TollV2DangerOutlineButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
