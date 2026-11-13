import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../ui/alert-dialog';
import { Textarea } from '../../../ui/textarea';
import { Label } from '../../../ui/label';
import { TollV2DangerOutlineButton, TollV2SecondaryButton } from './TollV2Buttons';

export function TollV2ReopenDialog({
  open,
  onOpenChange,
  busy,
  onConfirm,
  reopenInsteadMessage,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  busy: boolean;
  onConfirm: (reason: string) => void;
  reopenInsteadMessage?: string | null;
}) {
  const [reason, setReason] = useState('');

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reopen tolls for this week?</AlertDialogTitle>
        </AlertDialogHeader>
        <p className="text-sm text-[#47464c]">
          Reopening lets you change this week&apos;s tolls again.
        </p>
        {reopenInsteadMessage ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {reopenInsteadMessage}
          </p>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="reopen-reason">Reason</Label>
            <Textarea
              id="reopen-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why reopen?"
            />
          </div>
        )}
        <AlertDialogFooter>
          <TollV2SecondaryButton type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </TollV2SecondaryButton>
          {!reopenInsteadMessage ? (
            <TollV2DangerOutlineButton
              type="button"
              disabled={busy || !reason.trim()}
              onClick={() => onConfirm(reason.trim())}
            >
              Reopen tolls
            </TollV2DangerOutlineButton>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
