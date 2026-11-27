import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { formatFuelMoney } from '../../utils/formatFuelMoney';
import type { FinancialTransaction } from '../../types/data';
import {
  splitReconTolerance,
  describeSplitCashRehome,
  describeSplitCashRehomeBlocked,
} from '@roam/fuel-core';

export type SplitCashResolveChoice = 'accept_derived' | 'enter_cash' | 'void';

/**
 * Money decision for split variance / awaiting cash — never flag-only dismiss.
 */
export function SplitCashResolveDialog({
  open,
  tx,
  busy,
  onOpenChange,
  onResolve,
}: {
  open: boolean;
  tx: FinancialTransaction | null;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onResolve: (args: {
    tx: FinancialTransaction;
    action: SplitCashResolveChoice;
    cashAmount?: number;
    reason?: string;
  }) => void | Promise<void>;
}) {
  const [choice, setChoice] = useState<SplitCashResolveChoice | null>(null);
  const [manualCash, setManualCash] = useState('');
  const [reason, setReason] = useState('');

  // Reset form whenever a different row opens — avoid carrying prior money decision.
  useEffect(() => {
    if (!open) return;
    setChoice(null);
    setManualCash('');
    setReason('');
  }, [open, tx?.id]);

  if (!tx) return null;

  const m = (tx.metadata || {}) as Record<string, unknown>;
  const pump = Number(m.splitPumpTotal) || 0;
  const statement = Number(m.splitStatementAmount);
  const derived = Number(m.splitDerivedCashAmount);
  const delta = Number(m.splitVarianceDelta);
  const tol = splitReconTolerance(pump);
  const priceOutlier = m.splitPumpPriceOutlier === true;
  const rehomeLine = describeSplitCashRehome(m);
  const blockedLine = describeSplitCashRehomeBlocked(m);
  const reasonOk = reason.trim().length >= 8;
  const derivedOk = Number.isFinite(derived) && derived >= 0;
  const manualOk =
    choice !== 'enter_cash' ||
    (Number.isFinite(parseFloat(manualCash)) && parseFloat(manualCash) >= 0);
  const needsReason = choice === 'enter_cash' || choice === 'void';
  const canSubmit =
    choice != null &&
    (!needsReason || reasonOk) &&
    (choice !== 'accept_derived' || derivedOk) &&
    manualOk;

  const reset = () => {
    setChoice(null);
    setManualCash('');
    setReason('');
  };

  // Stitch: docs/stitch/fuel-logs-details-and-pay-fleet/decide_what_to_pay
  const acceptDisabled = !derivedOk || derived <= 0;
  const when = (() => {
    const d = String(tx.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return tx.date || '';
    const [y, mo, dd] = d.split('-').map(Number);
    const dt = new Date(y, mo - 1, dd);
    const t = String((tx as { time?: string }).time || '').match(/^(\d{1,2}):(\d{2})/);
    const day = dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    if (!t) return day;
    dt.setHours(Number(t[1]), Number(t[2]));
    return `${day}, ${dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
  })();
  const radio = (on: boolean) => (
    <span
      className={
        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ' +
        (on ? 'bg-black ring-4 ring-black/10 dark:bg-zinc-50' : 'bg-[#e6eeff] dark:bg-zinc-800')
      }
    >
      <span className={'h-2 w-2 rounded-full ' + (on ? 'bg-white dark:bg-zinc-900' : 'bg-[#c9c5cd]')} />
    </span>
  );
  const cardClass = (on: boolean, disabled?: boolean) =>
    'flex w-full items-start gap-3 rounded-xl p-4 text-left transition-all ' +
    (disabled
      ? 'cursor-not-allowed bg-[#eff4ff]/70 opacity-60 dark:bg-zinc-900/60'
      : on
        ? 'bg-white shadow-sm ring-2 ring-black dark:bg-zinc-900 dark:ring-zinc-50'
        : 'bg-white shadow-sm ring-1 ring-[#e6eeff] hover:bg-[#f8f9ff] dark:bg-zinc-900 dark:ring-zinc-800');
  const row = 'flex items-center justify-between gap-4 text-[15px]';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl border-0 bg-white p-6 sm:max-w-[560px] sm:p-8 dark:bg-[#2a2a2d]">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2 text-[24px] font-semibold tracking-tight text-[#0d1c2e] dark:text-zinc-50">
            <span className="material-symbols-outlined text-[24px]">balance</span>
            Decide what to pay
          </DialogTitle>
          <DialogDescription className="text-left text-[15px] text-[#47464c] dark:text-zinc-400">
            {when}
            {tx.driverName ? (
              <>
                {' · '}
                <span className="font-semibold text-[#0d1c2e] dark:text-zinc-100">{tx.driverName}</span>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 rounded-2xl bg-[#eff4ff] p-5 dark:bg-zinc-900/50">
          <div className={row}>
            <span className="text-[#47464c] dark:text-zinc-400">Pump total</span>
            <span className="font-semibold tabular-nums text-[#0d1c2e] dark:text-zinc-50">{formatFuelMoney(pump)}</span>
          </div>
          <div className={row}>
            <span className="text-[#47464c] dark:text-zinc-400">Gas card charge</span>
            <span className="font-semibold tabular-nums text-[#0d1c2e] dark:text-zinc-50">
              {Number.isFinite(statement) ? formatFuelMoney(statement) : '—'}
            </span>
          </div>
          <div className={row}>
            <span className="text-[#47464c] dark:text-zinc-400">Worked-out cash</span>
            <span className="tabular-nums text-[#0d1c2e] dark:text-zinc-50">
              {Number.isFinite(derived) ? (
                <span className="font-semibold">{formatFuelMoney(derived)}</span>
              ) : (
                <span className="italic text-[#47464c]">— (can&apos;t be worked out)</span>
              )}
            </span>
          </div>
          {Number.isFinite(delta) ? (
            <div className={`${row} mt-1 border-t border-[#dce9ff] pt-3 dark:border-zinc-800`}>
              <span className="flex items-center gap-1.5 font-medium text-[#ba1a1a]">
                <span className="material-symbols-outlined text-[18px]">priority_high</span>
                Difference
              </span>
              <span className="font-semibold tabular-nums text-[#ba1a1a]">{formatFuelMoney(Math.abs(delta))}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between text-[13px] text-[#47464c] dark:text-zinc-400">
            <span>Allowed difference</span>
            <span className="tabular-nums">{formatFuelMoney(tol)}</span>
          </div>
          {priceOutlier ? (
            <div className="mt-1 rounded-xl bg-[#fffbeb] px-3 py-2 text-[13px] text-[#92400e]">
              The price a litre at the pump looks high — double-check before paying a large cash amount.
            </div>
          ) : null}
          {rehomeLine ? <div className="mt-1 text-[13px] text-[#47464c]">{rehomeLine}</div> : null}
          {blockedLine ? (
            <div className="mt-1 rounded-xl bg-[#fffbeb] px-3 py-2 text-[13px] text-[#92400e]">{blockedLine}</div>
          ) : null}
        </div>

        <div role="radiogroup" aria-label="What to pay" className="flex flex-col gap-3">
          <button
            type="button"
            role="radio"
            aria-checked={choice === 'accept_derived'}
            disabled={acceptDisabled}
            onClick={() => setChoice('accept_derived')}
            className={cardClass(choice === 'accept_derived', acceptDisabled)}
          >
            {radio(choice === 'accept_derived')}
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="text-[15px] font-semibold text-[#0d1c2e] dark:text-zinc-50">Pay the worked-out cash</span>
                {acceptDisabled ? (
                  <span className="rounded bg-[#e6eeff] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#47464c]">Unavailable</span>
                ) : (
                  <span className="text-[15px] font-semibold tabular-nums text-[#0d1c2e] dark:text-zinc-50">{formatFuelMoney(derived)}</span>
                )}
              </span>
              <span className="mt-0.5 block text-[13px] text-[#47464c] dark:text-zinc-400">
                Pay what the statement says the cash part was, then approve it in Review Queue.
              </span>
              {acceptDisabled ? (
                <span className="mt-2 flex items-center gap-1 text-[13px] text-[#ba1a1a]">
                  <span className="material-symbols-outlined text-[14px]">error_outline</span>
                  Not possible: the statement doesn&apos;t give a cash amount.
                </span>
              ) : null}
            </span>
          </button>

          <div
            role="radio"
            aria-checked={choice === 'enter_cash'}
            tabIndex={0}
            onClick={() => setChoice('enter_cash')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setChoice('enter_cash');
              }
            }}
            className={cardClass(choice === 'enter_cash') + ' cursor-pointer'}
          >
            {radio(choice === 'enter_cash')}
            <span className="min-w-0 flex-1">
              <span className="text-[15px] font-semibold text-[#0d1c2e] dark:text-zinc-50">Pay a different cash amount</span>
              <span className="mt-0.5 block text-[13px] text-[#47464c] dark:text-zinc-400">Type the cash amount to pay the driver.</span>
              {choice === 'enter_cash' ? (
                <span className="mt-3 block rounded-lg bg-[#eff4ff] p-3 dark:bg-zinc-800">
                  <label htmlFor="split-manual-cash" className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-[#47464c]">
                    Cash to pay the driver
                  </label>
                  <span className="flex items-center rounded-md bg-white px-3 py-2 ring-1 ring-[#c9c5cd] focus-within:ring-2 focus-within:ring-black dark:bg-zinc-900">
                    <span className="mr-1 text-[15px] font-semibold text-[#47464c]">J$</span>
                    <Input
                      id="split-manual-cash"
                      type="number"
                      min={0}
                      step="0.01"
                      value={manualCash}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setManualCash(e.target.value)}
                      placeholder="0.00"
                      className="h-auto border-0 bg-transparent p-0 text-[17px] font-bold tabular-nums shadow-none focus-visible:ring-0"
                    />
                  </span>
                </span>
              ) : null}
            </span>
          </div>

          <button
            type="button"
            role="radio"
            aria-checked={choice === 'void'}
            onClick={() => setChoice('void')}
            className={cardClass(choice === 'void')}
          >
            {radio(choice === 'void')}
            <span className="min-w-0 flex-1">
              <span className="text-[15px] font-semibold text-[#ba1a1a]">Pay no cash for this fill</span>
              <span className="mt-0.5 block text-[13px] text-[#47464c] dark:text-zinc-400">The driver is not paid for the cash part.</span>
            </span>
          </button>
        </div>

        {needsReason ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="split-resolve-reason" className="flex items-center justify-between text-[15px] font-medium text-[#0d1c2e] dark:text-zinc-100">
              <span>
                Why? <span className="text-[#ba1a1a]">*</span>
              </span>
              <span className="text-[12px] font-normal text-[#47464c]">At least 8 characters</span>
            </label>
            <Textarea
              id="split-resolve-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Card charge includes a car wash, no cash was paid."
              rows={3}
              className="rounded-xl border-0 bg-[#eff4ff] dark:bg-zinc-900"
            />
          </div>
        ) : null}

        <DialogFooter className="gap-3 sm:gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
            className="min-h-[44px] rounded-xl bg-white px-5 text-[13px] font-medium text-[#0d1c2e] shadow-sm ring-1 ring-[#c9c5cd] hover:bg-[#e6eeff] disabled:opacity-40 dark:bg-zinc-900 dark:text-zinc-100"
          >
            Back
          </button>
          <button
            type="button"
            disabled={!canSubmit || busy}
            onClick={() => {
              if (!choice) return;
              void onResolve({
                tx,
                action: choice,
                cashAmount:
                  choice === 'enter_cash'
                    ? parseFloat(manualCash)
                    : choice === 'accept_derived'
                      ? derived
                      : undefined,
                reason: needsReason ? reason.trim() : undefined,
              });
            }}
            className={
              'min-h-[44px] rounded-xl px-6 text-[13px] font-medium text-white shadow-md disabled:opacity-40 ' +
              (choice === 'void' ? 'bg-[#ba1a1a] hover:bg-[#93000a]' : 'bg-black hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900')
            }
          >
            {busy ? 'Saving…' : choice === 'void' ? 'Pay no cash' : 'Save decision'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
