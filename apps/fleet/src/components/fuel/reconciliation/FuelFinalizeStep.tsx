/**
 * Finalize step panel — extracted from FuelPeriodWizard (Wave I hygiene).
 */
import React, { useState } from 'react';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { FuelExceptionBlockersPanel } from './FuelExceptionBlockersPanel';
import { FuelUnapprovedTxBlockersPanel } from './FuelUnapprovedTxBlockersPanel';
import { FuelSettlementTable, type FuelSettlementRow } from './FuelSettlementTable';
import type {
  FuelExceptionBlocker,
  FuelUnapprovedTxBlocker,
} from '../../../utils/fuelFinalizeGating';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';

export type ImplausibleFillStop = {
  date: string;
  amount: number;
  liters: number;
  odometer: number | null;
  reasons: string[];
  ids?: string[];
};

export type FuelFinalizeStepProps = {
  /**
   * Week Reconciliation slides (Stitch part 5): the fill blockers live in Part 1 and the
   * "Still open" list jumps there, so this card does not repeat them.
   */
  desk?: boolean;
  periodLocked: boolean;
  exceptionBlockers: FuelExceptionBlocker[];
  unapprovedFuelTxBlockers?: FuelUnapprovedTxBlocker[];
  onOpenReviewQueue?: () => void;
  plateByVehicleId: Record<string, string>;
  exceptionBusyId: string | null;
  onAcceptException: (blocker: FuelExceptionBlocker, note: string) => Promise<void>;
  onEditFill?: (blocker: FuelExceptionBlocker) => void;
  hasBlockingWarnings: boolean;
  hasExceptionBlockers: boolean;
  hasUnapprovedFuelTxBlockers?: boolean;
  financeWarningAcknowledged: boolean;
  onFinanceWarningChange: (v: boolean) => void;
  needsSecondApprover: boolean;
  secondApproverThreshold: number;
  secondApproverConfirmed: boolean;
  secondApproveBusy: boolean;
  onRecordSecondApproval: () => void;
  /** human = distinct admin CTA; service_only = system stamps approve on Finalize. */
  dualApprovalUiMode?: 'human' | 'service_only';
  settlementRows: FuelSettlementRow[];
  /** Hard closable-gate reasons shown when Finalize is locked. */
  closableBlockMessages?: string[];
  /** Flagged unusual fills that still need a week-level accept. */
  implausibleFills?: ImplausibleFillStop[];
  /** Accept unusual fills for this week (reason ≥ 8 chars). */
  onAcceptImplausibleFills?: (note: string) => Promise<void>;
  /** Plain-English stop-to-stop summary above the Fix CTA. */
  stopToStopSummary?: string;
  /** Primary: open in-wizard Fix stop-to-stop remediation sheet. */
  onFixStopToStop?: () => void;
  /** @deprecated Prefer onFixStopToStop — kept for older callers. */
  onOpenStopToStopGapDetail?: () => void;
  /** Secondary: Open Fuel Integrity desk Stop-to-stop tab. */
  onOpenIntegrityStopToStop?: () => void;
  /** U-9: data provenance shown where the operator signs. */
  provenance?: {
    tripCount: number;
    tripsTimedOut?: boolean;
    deadheadTimedOut?: boolean;
    personalAllowanceTimedOut?: boolean;
    brainTimedOut?: boolean;
    fuelCardsLoaded: number;
    fuelCardsMissing?: boolean;
    vehicleCount: number;
  };
};

export function FuelFinalizeStep(props: FuelFinalizeStepProps) {
  const {
    desk = false,
    periodLocked,
    exceptionBlockers,
    unapprovedFuelTxBlockers = [],
    onOpenReviewQueue,
    plateByVehicleId,
    exceptionBusyId,
    onAcceptException,
    onEditFill,
    hasBlockingWarnings,
    hasExceptionBlockers,
    hasUnapprovedFuelTxBlockers = false,
    financeWarningAcknowledged,
    onFinanceWarningChange,
    needsSecondApprover,
    secondApproverThreshold,
    secondApproverConfirmed,
    secondApproveBusy,
    onRecordSecondApproval,
    dualApprovalUiMode = 'human',
    settlementRows,
    closableBlockMessages = [],
    implausibleFills = [],
    onAcceptImplausibleFills,
    stopToStopSummary,
    onFixStopToStop,
    onOpenStopToStopGapDetail,
    onOpenIntegrityStopToStop,
    provenance,
  } = props;
  const [implausibleNote, setImplausibleNote] = useState('');
  const [implausibleBusy, setImplausibleBusy] = useState(false);
  const serviceOnly = dualApprovalUiMode === 'service_only';
  const hasStopToStopBlock = closableBlockMessages.some((m) => {
    const lower = m.toLowerCase();
    return (
      lower.includes('stop-to-stop') ||
      lower.includes('over-log') ||
      lower.includes('trip/adjustment km') ||
      lower.includes('odometer readings between fills') ||
      lower.includes('fuel litres do not match')
    );
  });
  const hasImplausibleBlock = closableBlockMessages.some((m) =>
    /unusual price|repeated odometer|looks wrong/i.test(m),
  );
  const showImplausibleAccept =
    Boolean(onAcceptImplausibleFills) &&
    (implausibleFills.length > 0 || hasImplausibleBlock);
  const fixStopToStop = onFixStopToStop || onOpenStopToStopGapDetail;

  return (
    <div className="space-y-3">
      {/* Desk: the "Still open" list (with Go to) and the Fuel seal reason already say what blocks. */}
      {closableBlockMessages.length > 0 && !desk && (
        <div className="space-y-2 text-sm text-[#0b1c30]" role="alert">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-[#ba1a1a]">Finalize is blocked</p>
          {stopToStopSummary &&
          hasStopToStopBlock &&
          !/is clear/i.test(stopToStopSummary) ? (
            <p className="text-[#47464c]">{stopToStopSummary}</p>
          ) : null}
          <ul className="space-y-2">
            {closableBlockMessages.map((m) => (
              <li key={m} className="flex items-start gap-3 rounded-2xl bg-[#eff4ff] px-4 py-3 text-[15px]">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#ba1a1a]" aria-hidden />
                {m}
              </li>
            ))}
          </ul>
          {hasStopToStopBlock && (fixStopToStop || onOpenIntegrityStopToStop) ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {fixStopToStop ? (
                <Button
                  type="button"
                  className="min-h-11 bg-rose-700 text-white hover:bg-rose-800"
                  onClick={fixStopToStop}
                >
                  Fix stop-to-stop blockers
                </Button>
              ) : null}
              {onOpenIntegrityStopToStop ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11 text-rose-950 hover:bg-rose-100"
                  onClick={onOpenIntegrityStopToStop}
                >
                  Open in Fuel Integrity (advanced)
                </Button>
              ) : null}
            </div>
          ) : null}
          {showImplausibleAccept ? (
            <div className="mt-3 space-y-2 rounded-md border border-rose-300 bg-white px-3 py-3 text-slate-900">
              <p className="font-semibold">Accept unusual fills</p>
              {implausibleFills.length > 0 ? (
                <ul className="list-inside list-disc space-y-1 text-sm text-slate-800">
                  {implausibleFills.map((fill) => (
                    <li key={`${fill.date}-${fill.amount}-${fill.odometer}-${fill.ids?.join(',') || ''}`}>
                      {fill.date || '—'} · {formatFuelMoney(fill.amount)}
                      {fill.odometer != null && Number(fill.odometer) > 0
                        ? ` · odo ${Number(fill.odometer).toLocaleString()}`
                        : ''}
                      {fill.reasons?.[0] ? ` — ${fill.reasons[0]}` : ''}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-700">
                  A fill looks unusual (price or repeated odometer). Accept it to continue.
                </p>
              )}
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Accept reason{' '}
                  <span className="font-normal normal-case text-slate-400">(required, 8+ characters)</span>
                </span>
                <textarea
                  className="min-h-[72px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  value={implausibleNote}
                  disabled={periodLocked || implausibleBusy}
                  onChange={(e) => setImplausibleNote(e.target.value)}
                  placeholder="Why is this fill acceptable for this week?"
                  aria-required
                />
              </label>
              <Button
                type="button"
                className="min-h-11 w-full sm:w-auto bg-rose-700 text-white hover:bg-rose-800"
                disabled={
                  periodLocked ||
                  implausibleBusy ||
                  implausibleNote.trim().length < 8 ||
                  !onAcceptImplausibleFills
                }
                onClick={() => {
                  if (!onAcceptImplausibleFills) return;
                  setImplausibleBusy(true);
                  void onAcceptImplausibleFills(implausibleNote.trim())
                    .then(() => setImplausibleNote(''))
                    .finally(() => setImplausibleBusy(false));
                }}
              >
                {implausibleBusy ? 'Saving…' : 'Accept unusual fills'}
              </Button>
            </div>
          ) : null}
        </div>
      )}
      {provenance && (
        <div className="space-y-2" role="status" aria-live="polite">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-[#47464c]">What this week used</p>
          <ul className="flex flex-wrap gap-2 text-[13px]">
            {[
              {
                label: 'Trips',
                state: provenance.tripsTimedOut ? 'failed' : provenance.tripCount ? `${provenance.tripCount} loaded` : 'loading',
              },
              { label: 'Distances', state: provenance.deadheadTimedOut ? 'failed' : 'loaded' },
              { label: 'Allowance', state: provenance.personalAllowanceTimedOut ? 'failed' : 'loaded' },
              { label: 'Cards', state: provenance.fuelCardsMissing ? 'failed' : 'loaded' },
            ].map((item) => (
              <li
                key={item.label}
                className={`rounded-full px-3 py-1 ${
                  item.state === 'failed'
                    ? 'bg-[#fff1f2] text-[#ba1a1a]'
                    : item.state === 'loading'
                      ? 'bg-[#f1f5f9] text-[#475569]'
                      : 'bg-[#ecfdf5] text-[#069669]'
                }`}
              >
                {item.state === 'failed' || item.state === 'loading' ? '' : '✓ '}
                {item.label}: {item.state}
              </li>
            ))}
          </ul>
        </div>
      )}
      {desk ? null : (
        <>
          <FuelUnapprovedTxBlockersPanel
            blockers={unapprovedFuelTxBlockers}
            onOpenReviewQueue={onOpenReviewQueue}
          />
          <FuelExceptionBlockersPanel
            blockers={exceptionBlockers}
            plateByVehicleId={plateByVehicleId}
            busyId={exceptionBusyId}
            onAcceptException={onAcceptException}
            onEditFill={onEditFill}
          />
        </>
      )}
      {hasBlockingWarnings && !hasExceptionBlockers && !hasUnapprovedFuelTxBlockers && (
        <label className="flex items-center gap-3 rounded-2xl bg-[#f8f9ff] px-4 py-4 text-[15px] text-[#0b1c30]">
          <Checkbox
            checked={financeWarningAcknowledged}
            onCheckedChange={(v) => onFinanceWarningChange(!!v)}
          />
          I checked the warnings for this week.
        </label>
      )}
      {needsSecondApprover && !periodLocked ? (
        serviceOnly ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
            Spend is above {formatFuelMoney(secondApproverThreshold)}. This organization uses{' '}
            <strong>system second approval</strong> on Finalize (you stay the finalizer).
          </div>
        ) : (
          <div className="space-y-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-950">
            <p>
              Spend is above {formatFuelMoney(secondApproverThreshold)}. A{' '}
              <strong>different</strong> admin must record second approval before lock.
            </p>
            {secondApproverConfirmed ? (
              <p className="text-emerald-800">Distinct second approval is on file.</p>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={secondApproveBusy}
                onClick={onRecordSecondApproval}
              >
                {secondApproveBusy ? 'Recording…' : 'Record my second approval'}
              </Button>
            )}
          </div>
        )
      ) : null}
      {settlementRows.length > 0 && desk ? (
        <ul className="space-y-2" data-testid="fuel-finalize-cars">
          {settlementRows.map((r) => (
            <li key={r.id} className="grid grid-cols-2 gap-3 rounded-2xl bg-[#eff4ff] px-4 py-3 md:grid-cols-4 md:items-center">
              <span className="w-fit rounded-xl bg-white px-3 py-1 text-[15px] font-semibold text-[#0b1c30]">{r.plate}</span>
              <span className="text-sm text-[#47464c]">
                Cash from earnings
                <span className="block text-[15px] font-semibold tabular-nums text-[#0b1c30]">{formatFuelMoney(r.cashFromEarnings)}</span>
              </span>
              <span className="text-sm text-[#0051d5]">
                Driver pays
                <span className="block text-[15px] font-semibold tabular-nums">{formatFuelMoney(r.driverShare)}</span>
              </span>
              <span className="text-sm text-[#47464c]">
                Net
                <span className="block text-[15px] font-semibold tabular-nums text-[#0b1c30]">{formatFuelMoney(r.netPay)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : settlementRows.length > 0 ? (
        <FuelSettlementTable rows={settlementRows} showStatus />
      ) : null}
    </div>
  );
}
