import React from 'react';
import { Banknote, Car, Check, Tag } from 'lucide-react';
import type { TollV2Charge, TollV2Suggestion } from './types';
import {
  chargeWhen,
  confidenceChipClass,
  confidenceLabel,
  decisionChipClass,
  decisionKindLabel,
  fmtTollMinor,
  formatDecidedAt,
  formatTripChoiceLabel,
  formatTimeJm,
  paidByChipLabel,
  rejectReasonLabel,
  tripPill,
  decisionUndoPayload,
} from './tollV2Format';
import { TollV2DangerOutlineButton, TollV2PrimaryButton, TollV2SecondaryButton } from './TollV2Buttons';

export type TollV2RowActions = {
  onConfirm?: (c: TollV2Charge) => void;
  onPickTrip?: (c: TollV2Charge) => void;
  onPickSuggestion?: (c: TollV2Charge, s: TollV2Suggestion) => void;
  onCompareTimeline?: (c: TollV2Charge) => void;
  onDriverPays?: (c: TollV2Charge) => void;
  onFleetPays?: (c: TollV2Charge) => void;
  onCheckReceipt?: (c: TollV2Charge) => void;
  onReviewDuplicate?: (c: TollV2Charge) => void;
  onUndo?: (c: TollV2Charge) => void;
  readOnly?: boolean;
};

function TollRowIcon({ charge }: { charge: TollV2Charge }) {
  const cash = charge.paidBy?.toLowerCase() === 'cash';
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#e5eeff]">
      {cash ? (
        <Banknote className="h-[18px] w-[18px] text-[#47464c]" aria-hidden />
      ) : (
        <Tag className="h-[18px] w-[18px] text-[#47464c]" aria-hidden />
      )}
    </div>
  );
}

function ChargeMeta({ charge }: { charge: TollV2Charge }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-sm font-medium tabular-nums text-[#0b1c30]">{chargeWhen(charge.occurredAt)}</span>
      <span className="text-[#cbd5e1]">·</span>
      <span className="text-sm font-medium text-[#0b1c30]">{charge.plazaName || 'Toll'}</span>
      {charge.plate ? (
        <span className="rounded bg-[#dce9ff] px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wide text-[#0b1c30]">
          {charge.plate}
        </span>
      ) : null}
      {charge.driverName ? <span className="text-sm text-[#47464c]">{charge.driverName}</span> : null}
      <span className="font-mono text-base font-bold tabular-nums text-[#0b1c30]">{fmtTollMinor(charge.amountMinor)}</span>
      <span className="rounded-full bg-[#eff4ff] px-2 py-0.5 text-[11px] font-semibold text-[#47464c]">
        {paidByChipLabel(charge.paidBy)}
      </span>
    </div>
  );
}

export function TollV2ChargeRow({ charge, actions }: { charge: TollV2Charge; actions: TollV2RowActions }) {
  const sealed = actions.readOnly;
  const conf = confidenceLabel(charge.confidence);
  const topSug = charge.suggestions?.find((x) => x.top !== false) ?? charge.suggestions?.[0];

  if (charge.section === 'decided') {
    const kind = charge.decision?.kind;
    const trip = charge.decision?.trip ?? topSug?.trip;
    return (
      <li className="flex flex-col gap-3 border-t border-[#eff4ff] px-4 py-3 first:border-t-0 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${decisionChipClass(kind)}`}
          >
            {kind === 'matched' ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
            {decisionKindLabel(kind)}
          </span>
          <span className="text-sm font-medium tabular-nums text-[#0b1c30]">{chargeWhen(charge.occurredAt)}</span>
          <span className="text-sm text-[#0b1c30]">{charge.plazaName || 'Toll'}</span>
          <span className="font-mono text-sm font-bold tabular-nums">{fmtTollMinor(charge.amountMinor)}</span>
          {trip ? (
            <span className="rounded-lg border border-[#cbd5e1] bg-white px-2 py-1 text-xs text-[#0b1c30]">
              Uber trip {formatTimeJm(trip.requestAt)}–{formatTimeJm(trip.dropoffAt || trip.pickupAt)}
            </span>
          ) : null}
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          <span className="text-xs text-[#47464c]">
            {formatDecidedAt(charge.decision?.at, charge.decision?.by)}
          </span>
          {!sealed && decisionUndoPayload(charge.decision) && actions.onUndo ? (
            <TollV2DangerOutlineButton type="button" onClick={() => actions.onUndo!(charge)}>
              Undo
            </TollV2DangerOutlineButton>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-3 border-t border-[#eff4ff] px-4 py-3 first:border-t-0 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex min-w-0 flex-1 gap-3">
        <TollRowIcon charge={charge} />
        <div className="min-w-0 flex-1 space-y-2">
          <ChargeMeta charge={charge} />
          {charge.section === 'awaiting_cash' ? (
            <p className="text-xs font-medium text-amber-800">Waiting for the rider&apos;s cash</p>
          ) : null}
          {topSug && (charge.section === 'suggested' || charge.section === 'no_trip') ? (
            <div className="flex max-w-lg items-start gap-2 rounded-lg border border-[#cbd5e1] bg-[#f8f9ff] px-2.5 py-2 text-xs text-[#0b1c30]">
              <Car className="mt-0.5 h-4 w-4 shrink-0 text-[#47464c]" aria-hidden />
              <span>
                Uber trip {tripPill(topSug.trip, topSug.paidBackMinor)}
              </span>
            </div>
          ) : null}
          {charge.decision?.kind === 'receipt_rejected' && charge.decision.reasonCode ? (
            <p className="text-xs text-[#47464c]">{rejectReasonLabel(charge.decision.reasonCode)}</p>
          ) : null}
        </div>
      </div>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
        {conf && charge.section !== 'decided' ? (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${confidenceChipClass(charge.confidence)}`}>
            {conf}
          </span>
        ) : null}
        {!sealed && charge.section === 'suggested' && actions.onConfirm ? (
          <>
            <TollV2PrimaryButton type="button" onClick={() => actions.onConfirm!(charge)}>
              Confirm
            </TollV2PrimaryButton>
            {actions.onCompareTimeline ?? actions.onPickTrip ? (
              <TollV2SecondaryButton
                type="button"
                onClick={() =>
                  actions.onCompareTimeline ? actions.onCompareTimeline(charge) : actions.onPickTrip!(charge)
                }
              >
                Pick another trip
              </TollV2SecondaryButton>
            ) : null}
          </>
        ) : null}
        {!sealed && charge.section === 'pick' ? (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            <span className="text-xs font-medium text-[#47464c]">Choose trip:</span>
            {(charge.suggestions ?? []).map((s) => (
              <TollV2SecondaryButton
                key={s.suggestionId}
                type="button"
                className="text-left"
                onClick={() => actions.onPickSuggestion?.(charge, s)}
              >
                <span className="inline-flex items-center gap-1">
                  <Check className="h-3.5 w-3.5 text-[#47464c]" aria-hidden />
                  {formatTripChoiceLabel(s.trip)}
                </span>
              </TollV2SecondaryButton>
            ))}
            {actions.onCompareTimeline || actions.onPickTrip ? (
              <TollV2SecondaryButton
                type="button"
                onClick={() =>
                  actions.onCompareTimeline ? actions.onCompareTimeline(charge) : actions.onPickTrip!(charge)
                }
              >
                Compare on a timeline
              </TollV2SecondaryButton>
            ) : null}
          </div>
        ) : null}
        {!sealed && charge.section === 'no_trip' ? (
          <>
            {actions.onDriverPays ? (
              <TollV2SecondaryButton type="button" onClick={() => actions.onDriverPays!(charge)}>
                Driver pays
              </TollV2SecondaryButton>
            ) : null}
            {actions.onFleetPays ? (
              <TollV2SecondaryButton type="button" onClick={() => actions.onFleetPays!(charge)}>
                Fleet pays
              </TollV2SecondaryButton>
            ) : null}
          </>
        ) : null}
        {!sealed && charge.section === 'receipts' && actions.onCheckReceipt ? (
          <TollV2PrimaryButton type="button" onClick={() => actions.onCheckReceipt!(charge)}>
            Check receipt
          </TollV2PrimaryButton>
        ) : null}
        {!sealed && charge.section === 'duplicates' && actions.onReviewDuplicate ? (
          <TollV2PrimaryButton type="button" onClick={() => actions.onReviewDuplicate!(charge)}>
            Review
          </TollV2PrimaryButton>
        ) : null}
      </div>
    </li>
  );
}
