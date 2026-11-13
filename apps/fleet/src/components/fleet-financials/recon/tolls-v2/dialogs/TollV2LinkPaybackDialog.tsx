import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../../ui/alert-dialog';
import type { TollV2Charge, TollV2Payback } from '../types';
import { chargeWhen, fmtTollMinor } from '../tollV2Format';
import { TollV2DangerOutlineButton, TollV2PrimaryButton } from '../TollV2Buttons';
import { cn } from '../../../../ui/utils';

export function TollV2LinkPaybackDialog({
  open,
  onOpenChange,
  payback,
  charges,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  payback: TollV2Payback | null;
  charges: TollV2Charge[];
  busy: boolean;
  onConfirm: (charge: TollV2Charge) => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const picked = charges.find((c) => c.id === selected) ?? charges[0];

  if (!payback) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Which toll did Uber pay back?</AlertDialogTitle>
          <p className="text-sm text-[#47464c]">Pick the toll that matches this payback.</p>
        </AlertDialogHeader>
        <div className="max-h-[50vh] space-y-2 overflow-y-auto py-2">
          {charges.map((c) => {
            const checked = (selected ?? charges[0]?.id) === c.id;
            return (
              <label
                key={c.id}
                className={cn(
                  'flex cursor-pointer gap-3 rounded-xl border p-3',
                  checked ? 'border-[#030213] bg-[#eff4ff]' : 'border-[#e5eeff] bg-white',
                )}
              >
                <input
                  type="radio"
                  className="mt-1"
                  checked={checked}
                  onChange={() => setSelected(c.id)}
                />
                <span className="text-sm text-[#0b1c30]">
                  {chargeWhen(c.occurredAt)} · {c.plazaName || 'Toll'} · {fmtTollMinor(c.amountMinor)}
                </span>
              </label>
            );
          })}
        </div>
        <AlertDialogFooter className="flex-wrap gap-2">
          <TollV2DangerOutlineButton type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </TollV2DangerOutlineButton>
          <TollV2PrimaryButton
            type="button"
            disabled={busy || !picked}
            onClick={() => picked && void onConfirm(picked)}
          >
            Use this toll
          </TollV2PrimaryButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
