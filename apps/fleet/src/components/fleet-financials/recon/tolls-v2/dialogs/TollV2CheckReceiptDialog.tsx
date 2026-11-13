import React, { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../../ui/alert-dialog';
import { EvidenceMediaPanel } from '../../../../evidence/EvidenceMediaPanel';
import type { TollV2Charge } from '../types';
import { chargeWhen, fmtTollMinor } from '../tollV2Format';
import { TollV2DangerOutlineButton, TollV2PrimaryButton } from '../TollV2Buttons';
import { Input } from '../../../../ui/input';

export function TollV2CheckReceiptDialog({
  open,
  onOpenChange,
  charge,
  onFine,
  onReject,
  busy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  charge: TollV2Charge | null;
  onFine: (amountMinor: number, amountChanged: boolean) => void;
  onReject: () => void;
  busy: boolean;
}) {
  const receipt = (charge?.receipt ?? {}) as Record<string, unknown>;
  const url = String(receipt.receipt_url || receipt.receiptUrl || '');
  const [amountMajor, setAmountMajor] = useState('');

  useEffect(() => {
    if (!charge) return;
    setAmountMajor((charge.amountMinor / 100).toFixed(2));
  }, [charge]);

  if (!charge) return null;

  const enteredMinor = Math.round(parseFloat(amountMajor || '0') * 100);
  const amountValid = /^\s*\d+(\.\d{1,2})?\s*$/.test(amountMajor) && enteredMinor > 0;
  const amountChanged = enteredMinor !== charge.amountMinor;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Check a cash receipt</AlertDialogTitle>
          <p className="text-sm text-[#47464c]">
            {charge.driverName || 'Driver'} · {chargeWhen(charge.occurredAt)}
          </p>
        </AlertDialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <EvidenceMediaPanel imageUrl={url || null} alt="Cash toll receipt" />
          <dl className="space-y-3 text-sm">
            <ReadOnly label="Plaza" value={String(receipt.plaza || charge.plazaName || '—')} />
            <ReadOnly label="Lane" value={String(receipt.lane || '—')} />
            <ReadOnly label="Receipt number" value={receiptNumberLabel(receipt)} />
            <div>
              <dt className="text-xs font-semibold uppercase text-[#47464c]">Amount</dt>
              <dd className="mt-1">
                <Input
                  value={amountMajor}
                  onChange={(e) => setAmountMajor(e.target.value)}
                  className="tabular-nums"
                  inputMode="decimal"
                  aria-label="Amount"
                  aria-invalid={!amountValid}
                />
                {!amountValid ? (
                  <p className="mt-1 text-xs text-rose-700">Enter the amount on the receipt, like 370.00.</p>
                ) : null}
              </dd>
            </div>
            <p className="text-xs text-[#47464c]">
              Once checked, this toll can be matched or assigned to driver or fleet.
            </p>
          </dl>
        </div>
        <AlertDialogFooter className="flex-wrap gap-2">
          <TollV2DangerOutlineButton type="button" onClick={onReject}>
            Reject receipt
          </TollV2DangerOutlineButton>
          <AlertDialogCancel type="button">Go back</AlertDialogCancel>
          <TollV2PrimaryButton
            type="button"
            disabled={busy || !amountValid}
            onClick={() => onFine(enteredMinor, amountChanged)}
          >
            Receipt is fine
          </TollV2PrimaryButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The number printed on the receipt. Older receipts only have it inside the internal reference
 *  (`receipt:<plaza>:<driver>:<number>`); never show that reference itself. */
export function receiptNumberLabel(receipt: Record<string, unknown>): string {
  const direct = String(receipt.receipt_number ?? receipt.receiptNumber ?? '').trim();
  if (direct) return direct;
  const ref = String(receipt.sourceRef ?? '');
  if (ref.startsWith('receipt:')) {
    const last = ref.split(':').slice(3).join(':').trim();
    if (last) return last;
  }
  return '—';
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-[#47464c]">{label}</dt>
      <dd className="mt-0.5 text-[#0b1c30]">{value}</dd>
    </div>
  );
}
