import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../../ui/dialog';
import { Input } from '../../../../ui/input';
import { Label } from '../../../../ui/label';
import { TollV2DangerOutlineButton, TollV2PrimaryButton } from '../TollV2Buttons';
import { fmtTollMinor, formatTimeJm } from '../tollV2Format';
import { formatWeekTitle } from '../../weekListFormat';
import type { TollV2TakeBack, TollV2TakeBackCandidate } from '../types';

export function TollV2RecordTakeBackDialog({
  open,
  onOpenChange,
  takeBack,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  takeBack: TollV2TakeBack | null;
  busy: boolean;
  onSubmit: (opts: {
    candidate: TollV2TakeBackCandidate;
    bearer: 'driver' | 'fleet';
    reference: string;
    paidOn: string;
  }) => void;
}) {
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [bearer, setBearer] = useState<'driver' | 'fleet' | null>(null);
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState('');

  useEffect(() => {
    if (!open || !takeBack) return;
    setReference(takeBack.reference ?? '');
    setPaidOn(takeBack.paidOn?.slice(0, 10) ?? '');
    setCandidateId(null);
    setBearer(null);
  }, [open, takeBack]);

  const candidate = useMemo(
    () => takeBack?.candidates.find((c) => c.paybackId === candidateId) ?? null,
    [candidateId, takeBack],
  );

  const disabledReason = useMemo(() => {
    if (!candidate) return null;
    if (candidate.weekSealed && candidate.weekPaid) return null;
    if (candidate.weekSealed && !candidate.weekPaid) return 'Reopen that week\'s tolls first';
    return null;
  }, [candidate]);

  if (!takeBack) return null;

  const canSubmit = Boolean(
    candidate && bearer && reference.trim() && paidOn && !disabledReason && !busy,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Uber took back {fmtTollMinor(takeBack.amountMinor)}</DialogTitle>
          <p className="text-sm text-[#47464c]">Choose the payback Uber reversed, then who bears it.</p>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#47464c]">Which payback?</p>
          {(takeBack.candidates ?? []).map((c) => (
            <label
              key={c.paybackId}
              className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 ${
                candidateId === c.paybackId ? 'border-[#030213] bg-[#eff4ff]' : 'border-[#e5eeff]'
              }`}
            >
              <input
                type="radio"
                name="takeback-payback"
                checked={candidateId === c.paybackId}
                onChange={() => setCandidateId(c.paybackId)}
              />
              <span className="text-sm">
                <span className="font-medium">{fmtTollMinor(c.amountMinor)}</span>
                <span className="text-[#47464c]">
                  {' '}
                  · {formatWeekTitle(c.weekKey)} · trip {formatTimeJm(c.trip?.pickupAt)}
                </span>
              </span>
            </label>
          ))}
        </div>

        {candidate ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ['driver', 'The driver pays it back', takeBack.driverName ? `Charged to ${takeBack.driverName}` : ''],
                ['fleet', 'The fleet absorbs it', 'Counted as fleet cost'],
              ] as const
            ).map(([id, title, sub]) => (
              <button
                key={id}
                type="button"
                disabled={!!disabledReason}
                onClick={() => setBearer(id)}
                className={`rounded-xl border p-3 text-left ${
                  bearer === id ? 'border-[#030213] bg-[#eff4ff]' : 'border-[#e5eeff]'
                }`}
              >
                <p className="text-sm font-semibold">{title}</p>
                {sub ? <p className="mt-1 text-xs text-[#47464c]">{sub}</p> : null}
              </button>
            ))}
          </div>
        ) : null}

        {disabledReason ? (
          <p className="text-sm font-medium text-amber-800">{disabledReason}</p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="tb-ref">Uber reference</Label>
            <Input id="tb-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="tb-date">Taken back date</Label>
            <Input id="tb-date" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <TollV2DangerOutlineButton type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </TollV2DangerOutlineButton>
          <TollV2PrimaryButton
            type="button"
            disabled={!canSubmit}
            onClick={() => {
              if (!candidate || !bearer) return;
              onSubmit({ candidate, bearer, reference: reference.trim(), paidOn });
            }}
          >
            Record the take-back
          </TollV2PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
