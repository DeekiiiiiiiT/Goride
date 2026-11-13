import React, { useMemo, useState } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../../ui/alert-dialog';
import type { TollV2Charge, TollV2Suggestion } from '../types';
import {
  chargeWhen,
  confidenceLabel,
  fmtTollMinor,
  formatTimeJm,
  minutesBetween,
  tripPill,
} from '../tollV2Format';
import { TollV2DangerOutlineButton, TollV2PrimaryButton, TollV2SecondaryButton } from '../TollV2Buttons';
import { cn } from '../../../../ui/utils';
import { TollV2PickTripTimeline } from './TollV2PickTripTimeline';

export function TollV2PickTripDialog({
  open,
  onOpenChange,
  charge,
  pickQueue,
  onConfirm,
  onNone,
  busy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  charge: TollV2Charge | null;
  pickQueue: { current: number; total: number };
  onConfirm: (suggestion: TollV2Suggestion) => void;
  onNone: () => void;
  busy: boolean;
}) {
  const suggestions = charge?.suggestions ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const selectedSug = suggestions.find((s) => s.suggestionId === selected) ?? suggestions[0];

  const note = useMemo(() => {
    if (!selectedSug?.alsoFits?.length) return null;
    const first = selectedSug.alsoFits[0];
    return `This trip also fits the ${chargeWhen(first.occurredAt)} ${first.plazaName || 'toll'}`;
  }, [selectedSug, charge]);

  if (!charge) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Pick the right trip</AlertDialogTitle>
          <p className="text-sm text-[#47464c]">
            {charge.plazaName || 'Toll'} · {chargeWhen(charge.occurredAt)} · {fmtTollMinor(charge.amountMinor)}
          </p>
          {pickQueue.total > 1 ? (
            <p className="text-xs text-[#47464c]">
              {pickQueue.current} of {pickQueue.total} tolls to resolve
            </p>
          ) : null}
        </AlertDialogHeader>
        <TollV2PickTripTimeline charge={charge} suggestions={suggestions} />
        <div className="max-h-[50vh] space-y-3 overflow-y-auto py-2">
          {suggestions.map((s) => {
            const trip = s.trip;
            const drop = trip?.dropoffAt;
            const pickup = trip?.pickupAt || trip?.requestAt;
            const minsDrop = minutesBetween(charge.occurredAt, drop);
            const minsPickup = minutesBetween(charge.occurredAt, pickup);
            const timing =
              minsDrop != null && minsDrop >= 0 && minsDrop < 120
                ? `Toll happened at ${formatTimeJm(charge.occurredAt)}, ${minsDrop} min${minsDrop === 1 ? '' : 's'} before dropoff.`
                : minsPickup != null && minsPickup < 0
                  ? `Toll happened ${Math.abs(minsPickup)} min${Math.abs(minsPickup) === 1 ? '' : 's'} before the trip started, while driving to the pickup.`
                  : minsPickup != null
                    ? `Toll occurred ${Math.abs(minsPickup)} min${Math.abs(minsPickup) === 1 ? '' : 's'} after trip started.`
                    : null;
            const checked = (selected ?? suggestions[0]?.suggestionId) === s.suggestionId;
            return (
              <label
                key={s.suggestionId}
                className={cn(
                  'flex cursor-pointer gap-3 rounded-xl border p-3',
                  checked ? 'border-[#030213] bg-[#eff4ff]' : 'border-[#e5eeff] bg-white',
                )}
              >
                <input
                  type="radio"
                  className="mt-1"
                  checked={checked}
                  onChange={() => setSelected(s.suggestionId)}
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-medium text-[#0b1c30]">{tripPill(trip, s.paidBackMinor)}</p>
                  {timing ? <p className="text-xs text-[#47464c]">{timing}</p> : null}
                  {confidenceLabel(s.confidence) ? (
                    <span className="text-xs font-semibold text-[#1d4ed8]">{confidenceLabel(s.confidence)}</span>
                  ) : null}
                </div>
              </label>
            );
          })}
          {note ? (
            <p className="rounded-lg bg-[#fffbeb] px-3 py-2 text-xs text-[#b45309]">{note}</p>
          ) : null}
        </div>
        <AlertDialogFooter className="flex-wrap gap-2">
          <TollV2DangerOutlineButton type="button" onClick={() => { onNone(); onOpenChange(false); }}>
            None of these
          </TollV2DangerOutlineButton>
          <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
          <TollV2PrimaryButton
            type="button"
            disabled={busy || !selectedSug}
            onClick={() => selectedSug && onConfirm(selectedSug)}
          >
            Use this trip
          </TollV2PrimaryButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
