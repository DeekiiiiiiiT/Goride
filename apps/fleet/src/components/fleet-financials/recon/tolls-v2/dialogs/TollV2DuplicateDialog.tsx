import React from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../../ui/alert-dialog';
import type { TollV2Charge, TollV2ReviewPair } from '../types';
import { chargeWhen, fmtTollMinor } from '../tollV2Format';
import { TollV2DangerOutlineButton, TollV2PrimaryButton, TollV2SecondaryButton } from '../TollV2Buttons';
import { EvidenceMediaPanel } from '../../../../evidence/EvidenceMediaPanel';

export function TollV2DuplicateDialog({
  open,
  onOpenChange,
  pair,
  chargeA,
  chargeB,
  onSameToll,
  onBoth,
  busy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pair: TollV2ReviewPair | null;
  chargeA: TollV2Charge | null;
  chargeB: TollV2Charge | null;
  onSameToll: (copyId: string, keepId: string) => void;
  onBoth: () => void;
  busy: boolean;
}) {
  if (!pair || !chargeA || !chargeB) return null;
  const tag = chargeA.paidBy === 'tag' ? chargeA : chargeB.paidBy === 'tag' ? chargeB : chargeA;
  const cash = tag.id === chargeA.id ? chargeB : chargeA;
  const receipt = (cash.receipt ?? {}) as Record<string, unknown>;
  const url = String(receipt.receipt_url || '');

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Possible duplicate</AlertDialogTitle>
          <p className="text-sm text-[#47464c]">Same car, same plaza, close together — are these one crossing or two?</p>
        </AlertDialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <ChargeCard title="Tag" charge={tag} />
          <div className="space-y-2">
            <ChargeCard title="Cash" charge={cash} />
            {url ? <EvidenceMediaPanel compact imageUrl={url} /> : null}
          </div>
        </div>
        <AlertDialogFooter className="flex-wrap gap-2">
          <TollV2DangerOutlineButton type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </TollV2DangerOutlineButton>
          <TollV2SecondaryButton type="button" disabled={busy} onClick={onBoth}>
            Different tolls — keep both
          </TollV2SecondaryButton>
          <TollV2PrimaryButton
            type="button"
            disabled={busy}
            onClick={() => onSameToll(cash.id, tag.id)}
          >
            Same toll — keep the tag one
          </TollV2PrimaryButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ChargeCard({ title, charge }: { title: string; charge: TollV2Charge }) {
  return (
    <div className="rounded-xl border border-[#e5eeff] bg-white p-3 text-sm">
      <p className="text-xs font-semibold uppercase text-[#47464c]">{title}</p>
      <p className="mt-1 font-medium">{charge.plazaName || 'Plaza'}</p>
      <p className="text-[#47464c]">{chargeWhen(charge.occurredAt)}</p>
      <p className="mt-2 font-mono tabular-nums">{fmtTollMinor(charge.amountMinor)}</p>
      {charge.driverName ? <p className="text-[#47464c]">Driver: {charge.driverName}</p> : null}
    </div>
  );
}
