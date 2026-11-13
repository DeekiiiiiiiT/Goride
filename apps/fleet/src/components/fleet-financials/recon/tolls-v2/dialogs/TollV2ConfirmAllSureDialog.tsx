import React from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../../ui/alert-dialog';
import { TollV2PrimaryButton } from '../TollV2Buttons';
import { fmtTollMinor, tripPill } from '../tollV2Format';
import type { TollV2Charge, TollV2Suggestion } from '../types';
import { chargeWhen } from '../tollV2Format';

type Row = { charge: TollV2Charge; suggestion: TollV2Suggestion };

export function TollV2ConfirmAllSureDialog({
  open,
  onOpenChange,
  rows,
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  rows: Row[];
  onConfirm: () => void;
  busy: boolean;
}) {
  const total = rows.reduce((n, r) => n + (r.suggestion.paidBackMinor || 0), 0);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm all sure matches ({rows.length})</AlertDialogTitle>
          <p className="text-sm text-[#47464c]">You can undo any of them afterwards.</p>
        </AlertDialogHeader>
        <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
          {rows.map(({ charge, suggestion }) => (
            <li key={suggestion.suggestionId} className="rounded-lg border border-[#e5eeff] px-3 py-2">
              <p className="font-medium">
                {chargeWhen(charge.occurredAt)} {charge.plazaName || 'toll'} → {tripPill(suggestion.trip)}
              </p>
              <span className="text-xs font-semibold text-[#069669]">Sure match</span>
            </li>
          ))}
        </ul>
        <p className="text-sm font-semibold tabular-nums">
          Total paid back by Uber {fmtTollMinor(total)}
        </p>
        <AlertDialogFooter>
          <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
          <TollV2PrimaryButton type="button" disabled={busy} onClick={onConfirm} data-testid="toll-v2-confirm-all">
            Confirm {rows.length}
          </TollV2PrimaryButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
