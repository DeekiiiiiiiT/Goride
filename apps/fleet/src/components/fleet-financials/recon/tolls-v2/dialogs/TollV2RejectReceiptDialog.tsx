import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../../ui/alert-dialog';
import { TollV2DangerSolidButton, TollV2SecondaryButton } from '../TollV2Buttons';
import { Textarea } from '../../../../ui/textarea';

const REASONS = [
  { code: 'photo_unreadable', label: 'Photo unreadable' },
  { code: 'not_a_toll_receipt', label: 'Not a toll receipt' },
  { code: 'already_claimed', label: 'Already claimed' },
  { code: 'other', label: 'Other' },
] as const;

export function TollV2RejectReceiptDialog({
  open,
  onOpenChange,
  onReject,
  busy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onReject: (reasonCode: string, note: string) => void;
  busy: boolean;
}) {
  const [reason, setReason] = useState<string>('photo_unreadable');
  const [note, setNote] = useState('');

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reject a receipt</AlertDialogTitle>
        </AlertDialogHeader>
        <div className="space-y-2">
          {REASONS.map((r) => (
            <label key={r.code} className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" checked={reason === r.code} onChange={() => setReason(r.code)} />
              {r.label}
            </label>
          ))}
          <Textarea
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-2"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel type="button">Go back</AlertDialogCancel>
          <TollV2DangerSolidButton
            type="button"
            disabled={busy}
            onClick={() => onReject(reason, note)}
          >
            Reject receipt
          </TollV2DangerSolidButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
