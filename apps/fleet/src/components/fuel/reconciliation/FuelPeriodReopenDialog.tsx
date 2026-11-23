/**
 * F-32b: the one way to reopen a locked fuel week. It reverses the week's money with
 * offsetting rows (nothing is deleted), marks its fuel lines reversed, puts its fills back to
 * Pending and reinstates the fuel P&L offsets — all on the server (POST /fuel/periods/:id/reopen).
 * The old "Reset period" (which deleted the money) is gone.
 */
import React, { useEffect, useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import { toast } from 'sonner';
import { api } from '../../../services/api';
import { periodConfirmLabelsMatch } from '../../../utils/fuelWeekPeriod';
import type { FuelReconciliationPeriod } from '../../../utils/fuelPeriodStatus';
import { useLockedDialog } from '../../shared/useLockedDialog';
import { useFuelReconBusy } from './fuelReconBusyLock';
import { useQueryClient } from '@tanstack/react-query';
import { DRIVER_FINANCIAL_PERIODS_KEY } from '../../../hooks/useDriverFinancialPeriods';
import { FUEL_PERIODS_KEY, FUEL_PERIOD_KEY } from '../../../hooks/useFuelPeriods';
import { clearFuelLeakageReview } from '../../../utils/fuelLeakageReviewStore';
import { FUEL_REOPEN_REASON_MIN } from '../../../utils/fuelReopenReason';
import { fuelPeriodReopenIdempotencyKey } from '../../../utils/fuelPeriodIdempotency';

interface FuelPeriodReopenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  period: FuelReconciliationPeriod;
  onComplete: () => void;
}

/** Plain words for the server's refusals. */
export function reopenErrorMessage(code: string, fallback?: string): string {
  switch (code) {
    case 'week_settled':
      return "This week's settlement is closed, so its fuel can't be reopened.";
    case 'reason_too_short':
      return `Give a reason of at least ${FUEL_REOPEN_REASON_MIN} characters.`;
    case 'version_conflict':
      return 'The week changed while this was open. Close this window and try again.';
    case 'reopen_reverse_failure':
    case 'lines_reverse_failed':
      return 'The week could not be reversed, so it stays locked. Nothing was changed. Try again.';
    default:
      return fallback || 'Reopen failed. Nothing was changed.';
  }
}

export function FuelPeriodReopenDialog({
  open,
  onOpenChange,
  period,
  onComplete,
}: FuelPeriodReopenDialogProps) {
  const queryClient = useQueryClient();
  const { runExclusive, busy: fleetBusy } = useFuelReconBusy();
  const [confirmText, setConfirmText] = useState('');
  const [reason, setReason] = useState('');
  const [executing, setExecuting] = useState(false);
  const lockBusy = executing || fleetBusy;
  const {
    onOpenChange: lockedOpenChange,
    contentProps: lockedContentProps,
  } = useLockedDialog(open, onOpenChange, lockBusy);

  const labelOk = periodConfirmLabelsMatch(confirmText, period.label);
  const reasonOk = reason.trim().length >= FUEL_REOPEN_REASON_MIN;

  useEffect(() => {
    if (!open) {
      setConfirmText('');
      setReason('');
    }
  }, [open]);

  const handleReopen = async () => {
    if (!labelOk || !reasonOk) return;
    setExecuting(true);
    const toastId = toast.loading('Reopening week…');
    try {
      const result = await runExclusive('Reopening week…', async () => {
        const ensured = (await api.ensureFuelReconciliationPeriod({
          weekStart: period.startDate,
          weekEnd: period.endDate,
        })) as { id?: string; version?: number };
        const periodId = String(ensured?.id || '');
        if (!periodId) throw new Error("This week's record could not be found.");
        const version = Number(ensured?.version) || Number(period.version) || 1;
        return (await api.enqueueFuelPeriodReopen({
          periodId,
          version,
          reason: reason.trim(),
          idempotencyKey: fuelPeriodReopenIdempotencyKey(periodId, version),
        })) as { state?: string; error?: string };
      });
      if (result === undefined) {
        toast.dismiss(toastId);
        toast.info('Another action is already running');
        return;
      }
      if (result?.state === 'failed') {
        toast.error(reopenErrorMessage(String(result.error || '')), { id: toastId });
        return;
      }
      toast.success(`${period.label} reopened. Its fuel money was reversed; nothing was deleted.`, {
        id: toastId,
      });
      clearFuelLeakageReview(period.startDate);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [FUEL_PERIODS_KEY] }),
        queryClient.invalidateQueries({ queryKey: [FUEL_PERIOD_KEY] }),
        queryClient.invalidateQueries({ queryKey: ['finalizedReports'] }),
        queryClient.invalidateQueries({ queryKey: [DRIVER_FINANCIAL_PERIODS_KEY] }),
      ]);
      lockedOpenChange(false);
      onComplete();
    } catch (e) {
      const err = e as Error & { body?: { error?: string; message?: string } };
      const code = String(err?.body?.error || err?.message || '');
      toast.error(reopenErrorMessage(code, err?.body?.message || err?.message), { id: toastId });
    } finally {
      setExecuting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={lockedOpenChange}>
      <DialogContent className="max-w-lg" hideCloseButton={lockBusy} {...lockedContentProps}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Reopen week
          </DialogTitle>
          <DialogDescription>
            Reopening <strong>{period.label}</strong> reverses its fuel money with offsetting
            entries. Nothing is deleted: the original entries and the reversal both stay on record.
            The week's fills go back to Pending, and you can lock it again after your fix.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="reopen-reason">Why are you reopening it?</Label>
          <Textarea
            id="reopen-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Corrected odometer gap for plate 5179KZ"
            className="min-h-[72px]"
            disabled={lockBusy}
          />
          <p className="text-xs text-slate-500">At least {FUEL_REOPEN_REASON_MIN} characters.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm-week">Type the week to confirm</Label>
          <div className="flex gap-2">
            <Input
              id="confirm-week"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={period.label}
              disabled={lockBusy}
            />
            <Button
              type="button"
              variant="outline"
              disabled={lockBusy}
              onClick={() => setConfirmText(period.label)}
            >
              Fill
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" disabled={lockBusy} onClick={() => lockedOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={lockBusy || !labelOk || !reasonOk}
            onClick={() => void handleReopen()}
          >
            {executing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Reopen week
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
