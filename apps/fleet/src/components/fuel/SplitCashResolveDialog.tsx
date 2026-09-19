import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Pencil, Ban } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
            Decide the driver&apos;s cash reimbursement
          </DialogTitle>
          <DialogDescription className="text-left text-slate-600">
            This decides whether the driver gets paid — not just clearing a mismatch flag.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Pump total</span>
            <span className="font-medium">{formatFuelMoney(pump)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Statement card</span>
            <span className="font-medium">
              {Number.isFinite(statement) ? formatFuelMoney(statement) : '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Derived cash</span>
            <span className="font-medium">
              {Number.isFinite(derived) ? formatFuelMoney(derived) : '—'}
            </span>
          </div>
          {Number.isFinite(delta) && (
            <div className="flex justify-between">
              <span className="text-slate-500">Over pump</span>
              <span className="font-medium text-rose-700">{formatFuelMoney(Math.abs(delta))}</span>
            </div>
          )}
          <div className="flex justify-between text-xs text-slate-400">
            <span>Tolerance</span>
            <span>{formatFuelMoney(tol)}</span>
          </div>
          {priceOutlier && (
            <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
              Pump implied $/L looks high vs retail estimate — double-check before paying a large cash amount.
            </div>
          )}
          {rehomeLine && (
            <div className="mt-2 text-xs text-slate-600">{rehomeLine}</div>
          )}
          {blockedLine && (
            <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
              {blockedLine}
            </div>
          )}
        </div>

        <div className="grid gap-2">
          <Button
            type="button"
            variant={choice === 'accept_derived' ? 'default' : 'outline'}
            className="h-auto justify-start gap-2 py-3 text-left"
            disabled={!derivedOk || derived <= 0}
            onClick={() => setChoice('accept_derived')}
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              <span className="block font-medium">Accept derived cash</span>
              <span className="block text-xs font-normal opacity-80">
                {derivedOk ? formatFuelMoney(derived) : 'No derived amount'} — then approve in Pending
              </span>
            </span>
          </Button>
          <Button
            type="button"
            variant={choice === 'enter_cash' ? 'default' : 'outline'}
            className="h-auto justify-start gap-2 py-3 text-left"
            onClick={() => setChoice('enter_cash')}
          >
            <Pencil className="h-4 w-4 shrink-0" />
            <span>
              <span className="block font-medium">Enter cash amount</span>
              <span className="block text-xs font-normal opacity-80">Override with a reason</span>
            </span>
          </Button>
          <Button
            type="button"
            variant={choice === 'void' ? 'destructive' : 'outline'}
            className="h-auto justify-start gap-2 py-3 text-left"
            onClick={() => setChoice('void')}
          >
            <Ban className="h-4 w-4 shrink-0" />
            <span>
              <span className="block font-medium">Void reimbursement</span>
              <span className="block text-xs font-normal opacity-80">Driver is not paid for this cash half</span>
            </span>
          </Button>
        </div>

        {choice === 'enter_cash' && (
          <div className="space-y-2">
            <Label htmlFor="split-manual-cash">Cash amount (JMD)</Label>
            <Input
              id="split-manual-cash"
              type="number"
              min={0}
              step="0.01"
              value={manualCash}
              onChange={(e) => setManualCash(e.target.value)}
              placeholder="0.00"
            />
          </div>
        )}

        {needsReason && (
          <div className="space-y-2">
            <Label htmlFor="split-resolve-reason">Reason (required)</Label>
            <Textarea
              id="split-resolve-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain the money decision (min 8 characters)"
              rows={3}
            />
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
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
          >
            {busy ? 'Saving…' : 'Confirm decision'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
