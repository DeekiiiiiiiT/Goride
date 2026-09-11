/**
 * Close Week confirm / reopen / orphan / ineligible / cash-ack dialogs (P-5).
 */
import React from 'react';
import { addDays, format, parseISO } from 'date-fns';
import { Loader2, Lock, Unlock } from 'lucide-react';
import { MONEY_EPS } from '@roam/finance-core';
import { Button } from '../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Textarea } from '../../ui/textarea';
import type { WeekCloseCashSourceMismatch } from '../../../services/weekCloseApi';

const MONEY = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const body = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? '-' : ''}$${body}`;
};

const CLOSE_CONFIRM_DRIVER_CAP = 20;

function weekLabel(weekKey: string): string {
  try {
    const start = parseISO(`${weekKey}T12:00:00`);
    const end = addDays(start, 6);
    return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
  } catch {
    return weekKey;
  }
}

export type CloseWeekConfirmDriver = {
  driverId: string;
  name: string;
  owed: number;
  fleet: number;
};

export type CloseWeekIneligibleSample = {
  count: number;
  amountMajor: number;
  tagAmountMajor: number;
  cashAmountMajor: number;
  rows: Array<{
    sourceId: string;
    reason: string;
    eventAmountMajor: number;
    paymentBucket: string;
    quarantineReason: string | null;
    plaza: string | null;
    date: string | null;
  }>;
};

export function CloseWeekDialogs({
  weekKey,
  weekAlreadyClosed,
  hasPendingRestatements,
  // Close confirm
  closeConfirmOpen,
  setCloseConfirmOpen,
  closing,
  confirmNeedsReconfirm,
  setConfirmNeedsReconfirm,
  previewDriversReady,
  settlement,
  closeConfirmDrivers,
  pnlUnavailable = false,
  onConfirmClose,
  // Reopen
  reopenOpen,
  setReopenOpen,
  reopening,
  reopenReason,
  setReopenReason,
  settlementRiskPrompt,
  setSettlementRiskPrompt,
  acknowledgeSettlementRisk,
  setAcknowledgeSettlementRisk,
  onReopen,
  // Orphan
  orphanRepairOpen,
  setOrphanRepairOpen,
  orphanRepairing,
  orphanImpact,
  onRepairOrphans,
  // Ineligible
  ineligibleRepairOpen,
  setIneligibleRepairOpen,
  ineligibleRepairing,
  ineligibleSample,
  setIneligibleSample,
  onRepairIneligible,
  // Cash ack
  cashAckTarget,
  setCashAckTarget,
  cashAckReason,
  setCashAckReason,
  cashAckBusy,
  onAcknowledgeCashSource,
}: {
  weekKey: string;
  weekAlreadyClosed: boolean;
  hasPendingRestatements: boolean;
  closeConfirmOpen: boolean;
  setCloseConfirmOpen: (open: boolean) => void;
  closing: boolean;
  confirmNeedsReconfirm: boolean;
  setConfirmNeedsReconfirm: (v: boolean) => void;
  previewDriversReady: number;
  settlement: { fleetOwes: number; driversOwe: number; cashHeld: number };
  closeConfirmDrivers: CloseWeekConfirmDriver[];
  /** M-2: Business Finance P&L feed unavailable — tie did not run. */
  pnlUnavailable?: boolean;
  onConfirmClose: () => void;
  reopenOpen: boolean;
  setReopenOpen: (open: boolean) => void;
  reopening: boolean;
  reopenReason: string;
  setReopenReason: (v: string) => void;
  settlementRiskPrompt: boolean;
  setSettlementRiskPrompt: (v: boolean) => void;
  acknowledgeSettlementRisk: boolean;
  setAcknowledgeSettlementRisk: (v: boolean) => void;
  onReopen: (ackRisk: boolean) => void;
  orphanRepairOpen: boolean;
  setOrphanRepairOpen: (open: boolean) => void;
  orphanRepairing: boolean;
  orphanImpact: number;
  onRepairOrphans: () => void;
  ineligibleRepairOpen: boolean;
  setIneligibleRepairOpen: (open: boolean) => void;
  ineligibleRepairing: boolean;
  ineligibleSample: CloseWeekIneligibleSample | null;
  setIneligibleSample: (v: CloseWeekIneligibleSample | null) => void;
  onRepairIneligible: () => void;
  cashAckTarget: WeekCloseCashSourceMismatch | null;
  setCashAckTarget: (v: WeekCloseCashSourceMismatch | null) => void;
  cashAckReason: string;
  setCashAckReason: (v: string) => void;
  cashAckBusy: boolean;
  onAcknowledgeCashSource: () => void;
}) {
  return (
    <>
      <Dialog
        open={closeConfirmOpen}
        onOpenChange={(open) => {
          if (closing) return;
          setCloseConfirmOpen(open);
          if (!open) {
            setConfirmNeedsReconfirm(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {hasPendingRestatements
                ? `Sign restatements for ${weekLabel(weekKey)}?`
                : `Close week of ${weekLabel(weekKey)}?`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-slate-700">
            {confirmNeedsReconfirm ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
                Books were refreshed — confirm these numbers before closing.
              </p>
            ) : null}
            <p>
              This will freeze <strong>{previewDriversReady}</strong> driver-period
              {previewDriversReady === 1 ? '' : 's'} and lock Pay/Collect for the week.
            </p>
            <ul className="list-disc pl-5 text-slate-600 space-y-1">
              <li>Fleet owes (after share): {MONEY(settlement.fleetOwes)}</li>
              <li>Drivers owe (after share): {MONEY(settlement.driversOwe)}</li>
              <li>Cash held (before share): {MONEY(settlement.cashHeld)}</li>
            </ul>
            {settlement.cashHeld > MONEY_EPS ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
                {MONEY(settlement.cashHeld)} of passenger cash will remain in driver custody after
                this close and will carry forward to the next open week for Collect — it is not
                written off by closing.
              </p>
            ) : null}
            {pnlUnavailable ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
                Business Finance P&amp;L is unavailable — the week P&amp;L tie did not run. You can
                still close, but treat identity as unchecked until P&amp;L is back.
              </p>
            ) : null}
            {closeConfirmDrivers.length > 0 ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 max-h-40 overflow-y-auto">
                <ul className="divide-y divide-slate-200 text-xs">
                  {closeConfirmDrivers.slice(0, CLOSE_CONFIRM_DRIVER_CAP).map((d) => (
                    <li
                      key={d.driverId}
                      className="flex items-start justify-between gap-2 px-2.5 py-1.5"
                    >
                      <span className="font-medium text-slate-800 truncate">{d.name}</span>
                      <span className="shrink-0 tabular-nums text-slate-600 text-right">
                        {d.owed > MONEY_EPS ? `owed ${MONEY(d.owed)}` : null}
                        {d.owed > MONEY_EPS && d.fleet > MONEY_EPS ? ' · ' : null}
                        {d.fleet > MONEY_EPS ? `fleet ${MONEY(d.fleet)}` : null}
                        {d.owed <= MONEY_EPS && d.fleet <= MONEY_EPS ? '—' : null}
                      </span>
                    </li>
                  ))}
                </ul>
                {closeConfirmDrivers.length > CLOSE_CONFIRM_DRIVER_CAP ? (
                  <p className="px-2.5 py-1.5 text-[11px] text-slate-500 border-t border-slate-200">
                    and {closeConfirmDrivers.length - CLOSE_CONFIRM_DRIVER_CAP} more
                  </p>
                ) : null}
              </div>
            ) : null}
            <p className="text-xs text-slate-500">
              After close, open Restatements if a sealed fact needs a new version — do not re-open
              casually when money has already moved.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={closing}
              onClick={() => setCloseConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-indigo-700 hover:bg-indigo-800"
              disabled={closing}
              onClick={() => {
                void onConfirmClose();
              }}
            >
              {closing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
              {hasPendingRestatements ? 'Sign restatements' : 'Close week'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={reopenOpen}
        onOpenChange={(open) => {
          if (reopening) return;
          setReopenOpen(open);
          if (!open) {
            setSettlementRiskPrompt(false);
            setAcknowledgeSettlementRisk(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Re-open week of {weekLabel(weekKey)}?</DialogTitle>
            <DialogDescription>
              Unlocks this week so Fuel, Tolls, and Settlement can be edited again. Does not reopen
              fuel Consumption recon — use that screen separately if needed. You must re-close when
              done. Prefer Restatement Queue for money-only corrections.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700" htmlFor="reopen-reason">
              Reason (required)
            </label>
            <Textarea
              id="reopen-reason"
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              placeholder="Why is this week being re-opened?"
              rows={3}
              className="resize-none"
            />
            {settlementRiskPrompt ? (
              <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={acknowledgeSettlementRisk}
                  onChange={(e) => setAcknowledgeSettlementRisk(e.target.checked)}
                />
                <span>
                  <span className="font-medium">Required to continue:</span> Settlement money was
                  already moved for one or more drivers. I understand re-opening can allow duplicate
                  collect/pay and I will re-close carefully.
                </span>
              </label>
            ) : null}
            <p className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-600">
              If this week carried passenger cash to a later week, reopening pulls that amount back
              so Collect does not show the same cash twice. If that later week is still closed, reopen
              it first.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={reopening}
              onClick={() => setReopenOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-indigo-700 hover:bg-indigo-800"
              disabled={
                reopening ||
                !reopenReason.trim() ||
                (settlementRiskPrompt && !acknowledgeSettlementRisk)
              }
              onClick={() => void onReopen(settlementRiskPrompt && acknowledgeSettlementRisk)}
            >
              {reopening ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Unlock className="mr-2 h-4 w-4" />
              )}
              {reopening ? 'Re-opening…' : 'Re-open week'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={orphanRepairOpen} onOpenChange={(open) => !orphanRepairing && setOrphanRepairOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Repair orphan toll events?</DialogTitle>
            <DialogDescription>
              Week of {weekLabel(weekKey)}. About {MONEY(orphanImpact)} of toll spend has no live
              toll row. This reverses those money events and force-reseals the toll lane. Driver
              settlement should not change for tag-only orphans — stop if it does.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={orphanRepairing}
              onClick={() => setOrphanRepairOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-indigo-700 hover:bg-indigo-800"
              disabled={orphanRepairing || weekAlreadyClosed}
              onClick={() => void onRepairOrphans()}
            >
              {orphanRepairing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {weekAlreadyClosed
                ? 'Re-open week first'
                : orphanRepairing
                  ? 'Repairing…'
                  : 'Repair and re-seal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={ineligibleRepairOpen}
        onOpenChange={(open) => {
          if (ineligibleRepairing) return;
          setIneligibleRepairOpen(open);
          if (!open) setIneligibleSample(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Review ineligible toll events</DialogTitle>
            <DialogDescription>
              Week of {weekLabel(weekKey)}. Spot-check the sample below, then reverse so Expenses
              matches Toll Recon. Tag {MONEY(ineligibleSample?.tagAmountMajor)} · Cash{' '}
              {MONEY(ineligibleSample?.cashAmountMajor)} · Total{' '}
              {MONEY(ineligibleSample?.amountMajor)} ({ineligibleSample?.count ?? 0} events).
            </DialogDescription>
          </DialogHeader>
          {ineligibleSample?.rows?.length ? (
            <ul className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              {ineligibleSample.rows.map((r, idx) => (
                <li key={`${r.sourceId}-${idx}`} className="leading-snug">
                  <span className="font-medium">{r.reason}</span>
                  {r.quarantineReason ? ` · ${r.quarantineReason}` : ''}
                  {' · '}
                  {MONEY(r.eventAmountMajor)} {r.paymentBucket}
                  {r.date ? ` · ${r.date}` : ''}
                  {r.plaza ? ` · ${r.plaza}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-600">No sample rows returned for this week.</p>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={ineligibleRepairing}
              onClick={() => {
                setIneligibleRepairOpen(false);
                setIneligibleSample(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-indigo-700 hover:bg-indigo-800"
              disabled={ineligibleRepairing || weekAlreadyClosed || !(ineligibleSample?.count)}
              onClick={() => void onRepairIneligible()}
            >
              {ineligibleRepairing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {weekAlreadyClosed
                ? 'Re-open week first'
                : ineligibleRepairing
                  ? 'Repairing…'
                  : 'Reverse and re-seal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!cashAckTarget}
        onOpenChange={(open) => {
          if (cashAckBusy) return;
          if (!open) {
            setCashAckTarget(null);
            setCashAckReason('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Accept statement cash?</DialogTitle>
            <DialogDescription>
              Week of {weekLabel(weekKey)}
              {cashAckTarget?.driverName ? ` · ${cashAckTarget.driverName}` : ''}. Settlement already
              uses statement cash ({MONEY(cashAckTarget?.uberCash)}); trip sum is{' '}
              {MONEY(cashAckTarget?.uberTripCash)} (difference {MONEY(cashAckTarget?.mismatch)}).
              This does not change what was collected — it only clears the Close Week block.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={cashAckReason}
            onChange={(e) => setCashAckReason(e.target.value)}
            placeholder="Why statement cash is correct (required)…"
            rows={3}
            className="text-sm"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={cashAckBusy}
              onClick={() => {
                setCashAckTarget(null);
                setCashAckReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-indigo-700 hover:bg-indigo-800"
              disabled={cashAckBusy || cashAckReason.trim().length < 8 || weekAlreadyClosed}
              onClick={() => void onAcknowledgeCashSource()}
            >
              {cashAckBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {weekAlreadyClosed ? 'Re-open week first' : cashAckBusy ? 'Saving…' : 'Accept statement cash'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
