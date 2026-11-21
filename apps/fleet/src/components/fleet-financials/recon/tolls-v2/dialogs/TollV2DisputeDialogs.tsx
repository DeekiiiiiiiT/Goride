import React, { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../../ui/alert-dialog';
import { Textarea } from '../../../../ui/textarea';
import { Label } from '../../../../ui/label';
import type { TollV2DisputeRow, TollV2RefundCandidate, TollV2CommandIntent } from '../types';
import { chargeWhen, fmtTollMinor, formatTimeJm } from '../tollV2Format';
import { disputeMoneyLine, disputeTitle, disputeTripPill, refundKindLabel } from '../tollV2Parts';
import { TollV2DangerOutlineButton, TollV2PrimaryButton, TollV2SecondaryButton } from '../TollV2Buttons';

function DisputeSummary({ d }: { d: TollV2DisputeRow }) {
  return (
    <div className="rounded-xl border border-[#e5eeff] p-3 text-sm">
      <p className="font-medium text-[#0b1c30]">{disputeTitle(d)}</p>
      <p className="text-[#47464c]">{disputeMoneyLine(d)}</p>
      <p className="mt-1 font-semibold text-[#0b1c30]">{fmtTollMinor(d.leftMinor)} still owed by Uber</p>
    </div>
  );
}

/** Refund received → pick the Uber payback that paid this dispute. It links to the dispute, never to the charge (R6). */
export function TollV2RefundReceivedDialog({
  dispute,
  busy,
  onOpenChange,
  onConfirm,
}: {
  dispute: TollV2DisputeRow | null;
  busy: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: (candidate: TollV2RefundCandidate) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const candidates = dispute?.refundCandidates ?? [];
  useEffect(() => {
    setPicked(candidates.find((c) => c.suggested)?.paybackId ?? (candidates.length === 1 ? candidates[0].paybackId : null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispute?.id]);
  if (!dispute) return null;
  const chosen = candidates.find((c) => c.paybackId === picked) ?? null;
  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="toll-v2-refund-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Which Uber payment is the refund?</AlertDialogTitle>
        </AlertDialogHeader>
        <DisputeSummary d={dispute} />
        {candidates.length === 0 ? (
          <p className="text-sm text-[#47464c]" data-testid="toll-v2-refund-none">
            No Uber payment for this driver near the trip date is open yet. When Uber&apos;s refund is in an uploaded
            report, it shows here.
          </p>
        ) : (
          <ul className="space-y-2" role="radiogroup" aria-label="Uber payments">
            {candidates.map((c) => {
              const on = c.paybackId === picked;
              return (
                <li key={c.paybackId}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setPicked(c.paybackId)}
                    className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm ${
                      on ? 'border-[#030213] bg-[#eff4ff]' : 'border-[#e5eeff] bg-white'
                    }`}
                    data-testid={`toll-v2-refund-option-${c.paybackId}`}
                  >
                    <span>
                      <span className="font-medium text-[#0b1c30]">{refundKindLabel(c.kind)}</span>
                      <span className="text-[#47464c]">
                        {' '}
                        · paid {c.paidOn ? chargeWhen(`${c.paidOn}T12:00:00-05:00`).split(',')[0] : '—'}
                        {c.reference ? ` · ${c.reference}` : ''}
                      </span>
                      {c.suggested ? (
                        <span className="ml-2 rounded-full bg-[#ecfdf5] px-2 py-0.5 text-xs font-semibold text-[#069669]">
                          Best fit
                        </span>
                      ) : null}
                      {c.inRefundWindow === false ? (
                        <span className="ml-2 text-xs text-[#47464c]">Paid before the dispute was sent</span>
                      ) : null}
                    </span>
                    <span className="font-semibold tabular-nums text-[#0b1c30]">{fmtTollMinor(c.openMinor)} open</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {chosen && chosen.openMinor < dispute.leftMinor ? (
          <p className="text-xs text-[#47464c]">
            This pays {fmtTollMinor(chosen.openMinor)} of {fmtTollMinor(dispute.leftMinor)}. The rest stays open.
          </p>
        ) : null}
        <AlertDialogFooter>
          <TollV2SecondaryButton type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </TollV2SecondaryButton>
          <TollV2PrimaryButton
            type="button"
            disabled={busy || !chosen}
            onClick={() => chosen && onConfirm(chosen)}
            data-testid="toll-v2-refund-confirm"
          >
            Link refund
          </TollV2PrimaryButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Driver Settlements: mark as sent for a driver who sent it in Uber but didn't tap it in the app. */
export function TollV2MarkSentDialog({
  dispute,
  busy,
  onOpenChange,
  onConfirm,
}: {
  dispute: TollV2DisputeRow | null;
  busy: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: () => void;
}) {
  if (!dispute) return null;
  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="toll-v2-mark-sent-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Mark this dispute as sent?</AlertDialogTitle>
        </AlertDialogHeader>
        <div className="rounded-xl border border-[#e5eeff] bg-[#f8f9ff] p-3 text-sm">
          <p className="font-medium text-[#0b1c30]">
            {disputeTitle(dispute)} · {fmtTollMinor(dispute.leftMinor)} to dispute
          </p>
          <p className="mt-1 flex items-center gap-2 text-[#47464c]">
            {dispute.driverName ?? 'Driver'}
            {dispute.plate ? (
              <span className="rounded bg-[#dce9ff] px-2 py-0.5 text-[11px] font-semibold text-[#0b1c30]">{dispute.plate}</span>
            ) : null}
          </p>
        </div>
        <p className="text-sm text-[#47464c]">
          Use this when the driver sent it in Uber but didn&apos;t tap Mark as sent in the Roam Driver app.
        </p>
        <AlertDialogFooter>
          <TollV2SecondaryButton type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </TollV2SecondaryButton>
          <TollV2PrimaryButton type="button" disabled={busy} onClick={onConfirm} data-testid="toll-v2-mark-sent-confirm">
            Mark as sent
          </TollV2PrimaryButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Lost: Uber will not pay the rest. Who pays it follows Fleet Policy → Tolls. */
export function TollV2LostDialog({
  dispute,
  busy,
  onOpenChange,
  onConfirm,
}: {
  dispute: TollV2DisputeRow | null;
  busy: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: () => void;
}) {
  if (!dispute) return null;
  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="toll-v2-lost-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Close this dispute as lost?</AlertDialogTitle>
        </AlertDialogHeader>
        <DisputeSummary d={dispute} />
        <p className="text-sm text-[#47464c]">
          Uber won&apos;t be asked for the {fmtTollMinor(dispute.leftMinor)} any more. Who pays it follows your toll
          policy. A refund can still come in the next pay period, so only close it if you know Uber said no.
        </p>
        <AlertDialogFooter>
          <TollV2SecondaryButton type="button" onClick={() => onOpenChange(false)}>
            Keep waiting
          </TollV2SecondaryButton>
          <TollV2DangerOutlineButton type="button" disabled={busy} onClick={onConfirm} data-testid="toll-v2-lost-confirm">
            Close as lost
          </TollV2DangerOutlineButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Open trip: the trip the toll fell in, so the driver or manager can find it in Uber. */
export function TollV2OpenTripDialog({
  dispute,
  onOpenChange,
}: {
  dispute: TollV2DisputeRow | null;
  onOpenChange: (o: boolean) => void;
}) {
  if (!dispute) return null;
  const t = dispute.trip;
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-4 py-1">
      <dt className="text-[#47464c]">{label}</dt>
      <dd className="text-right font-medium text-[#0b1c30]">{value}</dd>
    </div>
  );
  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="toll-v2-trip-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{disputeTripPill(dispute) ?? 'Trip'}</AlertDialogTitle>
        </AlertDialogHeader>
        <dl className="divide-y divide-[#eff4ff] text-sm">
          {row('Toll', disputeTitle(dispute))}
          {dispute.driverName ? row('Driver', dispute.driverName) : null}
          {dispute.plate ? row('Car', dispute.plate) : null}
          {t?.requestAt ? row('Requested', formatTimeJm(t.requestAt)) : null}
          {t?.pickupAt ? row('Picked up', formatTimeJm(t.pickupAt)) : null}
          {t?.dropoffAt ? row('Dropped off', formatTimeJm(t.dropoffAt)) : null}
          {t?.paymentMethod ? row('Paid by', t.paymentMethod) : null}
          {t?.tripId ? row('Trip ID', <span className="break-all font-mono text-xs">{t.tripId}</span>) : null}
        </dl>
        {!t ? <p className="text-sm text-[#47464c]">No trip details came with this toll.</p> : null}
        <AlertDialogFooter>
          <TollV2SecondaryButton type="button" onClick={() => onOpenChange(false)}>
            Close
          </TollV2SecondaryButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const ASK_WHAT: Partial<Record<TollV2CommandIntent, string>> = {
  close_dispute_lost: 'Closing this dispute as lost',
  undo_decision: 'This undo',
  settle_dispute: 'Linking this refund',
  reopen_week: 'Reopening the week',
  change_toll_settings: 'Changing toll settings',
};

/** B14: the only manager approves their own change with a reason (8+ characters). */
export function TollV2ApprovalReasonDialog({
  intent,
  amountMinor,
  onDone,
}: {
  intent: TollV2CommandIntent | null;
  amountMinor: number | null;
  onDone: (reason: string | null) => void;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => setReason(''), [intent]);
  if (!intent) return null;
  const ok = reason.trim().length >= 8;
  const what = ASK_WHAT[intent] ?? 'This change';
  return (
    <AlertDialog open onOpenChange={(o) => !o && onDone(null)}>
      <AlertDialogContent data-testid="toll-v2-approval-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Why are you making this change?</AlertDialogTitle>
        </AlertDialogHeader>
        <p className="text-sm text-[#47464c]">
          {what}
          {amountMinor != null ? ` (${fmtTollMinor(amountMinor)})` : ''} normally needs a second manager. You are the
          only manager, so write why. It is kept with the change.
        </p>
        <div className="space-y-1">
          <Label htmlFor="toll-v2-approval-reason">Reason</Label>
          <Textarea
            id="toll-v2-approval-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="At least 8 characters"
            data-testid="toll-v2-approval-reason"
          />
        </div>
        <AlertDialogFooter>
          <TollV2SecondaryButton type="button" onClick={() => onDone(null)}>
            Cancel
          </TollV2SecondaryButton>
          <TollV2PrimaryButton
            type="button"
            disabled={!ok}
            onClick={() => onDone(reason.trim())}
            data-testid="toll-v2-approval-confirm"
          >
            Approve and continue
          </TollV2PrimaryButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
