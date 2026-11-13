import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../../ui/alert-dialog';
import type { TollV2Charge, TollV2Suggestion, TollV2Trip } from '../types';
import {
  chargeWhen,
  fmtTollMinor,
  formatTimeJm,
  formatTripChoiceLabel,
  uberPaidBackLabel,
} from '../tollV2Format';
import { TollV2DangerOutlineButton, TollV2PrimaryButton } from '../TollV2Buttons';
import { cn } from '../../../../ui/utils';
import { TollV2PickTripTimeline } from './TollV2PickTripTimeline';

const NONE_ID = '__none__';

function msOf(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

const minsWord = (n: number) => `${n} min${n === 1 ? '' : 's'}`;

/** Where the toll sits against the trip: before it started, during it, or after dropoff (P3-R4 check: compare with the start first). */
export function tollTimingNote(chargeAt: string, trip: TollV2Trip | null | undefined): string | null {
  if (!trip) return null;
  const toll = msOf(chargeAt);
  const start = msOf(trip.pickupAt) ?? msOf(trip.requestAt);
  const drop = msOf(trip.dropoffAt);
  if (toll == null) return null;
  if (start != null && toll < start) {
    const n = Math.max(1, Math.round((start - toll) / 60_000));
    return `Toll happened ${minsWord(n)} before the trip started, while driving to the pickup.`;
  }
  if (drop != null && toll <= drop) {
    const n = Math.round((drop - toll) / 60_000);
    return n === 0
      ? `Toll happened at ${formatTimeJm(chargeAt)}, at dropoff.`
      : `Toll happened at ${formatTimeJm(chargeAt)}, ${minsWord(n)} before dropoff.`;
  }
  if (drop != null && toll > drop) {
    const n = Math.max(1, Math.round((toll - drop) / 60_000));
    return `Toll happened ${minsWord(n)} after dropoff.`;
  }
  return null;
}

export function TollV2PickTripDialog({
  open,
  onOpenChange,
  charge,
  pickQueue,
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  charge: TollV2Charge | null;
  pickQueue: { current: number; total: number };
  onConfirm: (suggestion: TollV2Suggestion) => void;
  onNone?: () => void;
  busy: boolean;
}) {
  const suggestions = charge?.suggestions ?? [];
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelected(suggestions[0]?.suggestionId ?? null);
    }
  }, [open, charge?.id, suggestions]);

  const selectedSug = suggestions.find((s) => s.suggestionId === selected) ?? suggestions[0];
  const noneSelected = selected === NONE_ID;

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
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <AlertDialogTitle>Which trip was this toll on?</AlertDialogTitle>
              <p className="text-sm text-[#47464c]">
                {charge.plazaName || 'Toll'} · {chargeWhen(charge.occurredAt)} · {fmtTollMinor(charge.amountMinor)}
              </p>
              {pickQueue.total > 1 ? (
                <p className="text-xs text-[#47464c]">
                  {pickQueue.current} of {pickQueue.total} tolls to resolve
                </p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Close dialog"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#47464c] hover:bg-[#eff4ff]"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </AlertDialogHeader>
        <TollV2PickTripTimeline charge={charge} suggestions={suggestions} />
        <div className="max-h-[50vh] space-y-3 overflow-y-auto py-2">
          {suggestions.map((s) => {
            const trip = s.trip;
            const timing = tollTimingNote(charge.occurredAt ?? '', trip);
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
                  name="toll-v2-pick-trip"
                  checked={checked}
                  onChange={() => setSelected(s.suggestionId)}
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-[#0b1c30]">
                      Uber trip {formatTripChoiceLabel(trip)}
                    </p>
                    <span className="shrink-0 rounded-full bg-[#ecfdf5] px-2.5 py-0.5 text-xs font-semibold text-[#069669]">
                      {uberPaidBackLabel(s.paidBackMinor)}
                    </span>
                  </div>
                  {timing ? <p className="text-xs text-[#47464c]">{timing}</p> : null}
                </div>
              </label>
            );
          })}
          <label
            className={cn(
              'flex cursor-pointer gap-3 rounded-xl border p-3',
              noneSelected ? 'border-[#030213] bg-[#eff4ff]' : 'border-[#e5eeff] bg-white',
            )}
            data-testid="toll-v2-pick-none"
          >
            <input
              type="radio"
              className="mt-1"
              name="toll-v2-pick-trip"
              checked={noneSelected}
              onChange={() => setSelected(NONE_ID)}
            />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium text-[#0b1c30]">None of these — decide who pays instead</p>
              <p className="text-xs text-[#47464c]">Leave this toll in Pick the right trip until you choose driver or fleet.</p>
            </div>
          </label>
          {note && !noneSelected ? (
            <p className="rounded-lg bg-[#fffbeb] px-3 py-2 text-xs text-[#b45309]">{note}</p>
          ) : null}
        </div>
        <AlertDialogFooter className="flex-wrap gap-2 sm:justify-between">
          <TollV2DangerOutlineButton type="button" data-testid="toll-v2-pick-cancel" onClick={() => onOpenChange(false)}>
            Cancel
          </TollV2DangerOutlineButton>
          <TollV2PrimaryButton
            type="button"
            disabled={busy || (!noneSelected && !selectedSug)}
            onClick={() => {
              if (noneSelected) {
                onOpenChange(false);
                return;
              }
              if (selectedSug) onConfirm(selectedSug);
            }}
          >
            {noneSelected ? 'Close' : 'Use this trip'}
          </TollV2PrimaryButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
