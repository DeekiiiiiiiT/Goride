import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
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
import { runBackgroundJobToast } from '../../shared/runBackgroundJobToast';

interface FuelPeriodResetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  period: FuelReconciliationPeriod;
  /** @deprecated preview comes from server dry-run — kept for call-site compat */
  finalizedReports?: unknown;
  fuelEntries?: unknown;
  onComplete: () => void;
}

type ServerPreview = {
  snapshots: number;
  resetFuelEntries: number;
  deletedTransactions: number;
  driverIds: string[];
  vehicleIds: string[];
};

export function FuelPeriodResetDialog({
  open,
  onOpenChange,
  period,
  onComplete,
}: FuelPeriodResetDialogProps) {
  const queryClient = useQueryClient();
  const { runExclusive, busy: fleetBusy } = useFuelReconBusy();
  const [confirmText, setConfirmText] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [executing, setExecuting] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<ServerPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const lockBusy = executing || fleetBusy;
  const {
    onOpenChange: lockedOpenChange,
    contentProps: lockedContentProps,
  } = useLockedDialog(open, onOpenChange, lockBusy);

  const labelOk = periodConfirmLabelsMatch(confirmText, period.label);
  const reasonOk = reopenReason.trim().length >= 3;

  useEffect(() => {
    if (!open) {
      setConfirmText('');
      setReopenReason('');
      setPreview(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    const weekKey = period.startDate || period.id;
    void api
      .resetFuelPeriod(weekKey, { dryRun: true })
      .then((data) => {
        if (cancelled) return;
        setPreview({
          snapshots: Number(data.snapshots ?? data.snapshotsDeleted ?? 0),
          resetFuelEntries: Number(data.resetFuelEntries ?? 0),
          deletedTransactions: Number(data.deletedTransactions ?? 0),
          driverIds: Array.isArray(data.driverIds) ? data.driverIds : [],
          vehicleIds: Array.isArray(data.vehicleIds) ? data.vehicleIds : [],
        });
      })
      .catch((e: any) => {
        if (cancelled) return;
        setPreviewError(e?.message || 'Could not load reopen preview');
        setPreview(null);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, period.startDate, period.id]);

  const handleExecute = async () => {
    if (!labelOk) {
      toast.error('Week label does not match — use the Fill button or copy it exactly');
      return;
    }
    if (!reasonOk) {
      toast.error('Add a short reason for reopening this week');
      return;
    }
    setExecuting(true);
    const toastId = toast.loading('Reopening week…');
    try {
      const result = await runExclusive('Reopening week…', async () => {
        const weekKey = period.startDate || period.id;
        // Single org-scoped server path — no client fallback (M9/M10)
        return await api.resetFuelPeriod(weekKey, {
          reopenReason: reopenReason.trim(),
        });
      });
      if (result === undefined) {
        toast.dismiss(toastId);
        toast.info('Another action is already running');
        return;
      }
      const snaps = result.snapshotsDeleted ?? 0;
      const entries = result.resetFuelEntries ?? 0;
      const txs = result.deletedTransactions ?? 0;
      toast.success(
        `Reset ${period.label}: ${entries} log(s), ${txs} settlement row(s), ${snaps} snapshot(s) — back to Data quality`,
        { id: toastId },
      );
      void queryClient.invalidateQueries({ queryKey: [DRIVER_FINANCIAL_PERIODS_KEY] });
      const driverIds = preview?.driverIds?.length
        ? preview.driverIds
        : [];
      if (driverIds.length > 0) {
        const weekKey = period.startDate || period.id;
        void runBackgroundJobToast(
          async () => {
            for (const id of driverIds) {
              await api.rebuildDriverFinancialPeriods(id, weekKey);
            }
            await api.processDriverFinancialOutbox(50).catch(() => undefined);
            return driverIds.length;
          },
          {
            loading: `Updating Expenses for ${driverIds.length} driver${driverIds.length === 1 ? '' : 's'}…`,
            success: (n) => `Expenses refreshed for ${n} driver${Number(n) === 1 ? '' : 's'}`,
            error: 'Could not refresh Driver Expenses — try again from Admin if needed',
          },
        );
      }
      lockedOpenChange(false);
      onComplete();
    } catch (e: any) {
      toast.error(e?.message || 'Reset failed', { id: toastId });
    } finally {
      setExecuting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={lockedOpenChange}>
      <DialogContent className="max-w-lg" hideCloseButton={lockBusy} {...lockedContentProps}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-700">
            <RotateCcw className="h-5 w-5" />
            Reopen week
          </DialogTitle>
          <DialogDescription>
            Re-open <strong>{period.label}</strong> by removing finalized snapshots and reversing
            linked settlements for <em>your organization only</em>. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Will reverse (server preview)</p>
              {previewLoading ? (
                <p className="mt-1 flex items-center gap-2 text-xs">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading exact inventory…
                </p>
              ) : previewError ? (
                <p className="mt-1 text-xs text-rose-700">{previewError}</p>
              ) : preview ? (
                <ul className="mt-1 list-inside list-disc text-xs">
                  <li>{preview.snapshots} finalized snapshot(s)</li>
                  <li>{preview.resetFuelEntries} posted fuel log(s) returned to Pending</li>
                  <li>{preview.deletedTransactions} settlement transaction(s)</li>
                  <li>
                    {preview.driverIds.length} driver(s) · {preview.vehicleIds.length} vehicle(s)
                  </li>
                </ul>
              ) : (
                <p className="mt-1 text-xs">No preview available.</p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="reopen-reason">Reason for reopen</Label>
          <Textarea
            id="reopen-reason"
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
            placeholder="e.g. Corrected odometer gap for plate 5179KZ"
            className="min-h-[72px]"
            disabled={lockBusy}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm-week">Type the week label to confirm</Label>
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
            variant="destructive"
            disabled={lockBusy || !labelOk || !reasonOk || !!previewError || previewLoading}
            onClick={() => void handleExecute()}
          >
            {executing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Reopen week
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
