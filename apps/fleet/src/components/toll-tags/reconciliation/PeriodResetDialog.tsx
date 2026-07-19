import React, { useMemo, useState } from 'react';
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
import { Checkbox } from '../../ui/checkbox';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { api } from '../../../services/api';
import { toast } from 'sonner@2.0.3';
import type { ReconciliationPeriod } from '../../../hooks/useTollReconciliationPeriods';
import { periodConfirmLabelsMatch } from '../../../utils/tollWeekPeriod';
import { useLockedDialog } from '../../shared/useLockedDialog';
import { useTollReconBusy } from './tollReconBusyLock';

interface PeriodResetInventory {
  unlinkedApplyTripIds: string[];
  disputeRefundIds: string[];
  claimIds: string[];
  tollIds: string[];
  refundResolutionTripIds: string[];
  chargeDriverClaimIds: string[];
}

interface PeriodResetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  period: ReconciliationPeriod;
  drivers: Array<{ id: string; name: string }>;
  preselectedDriverId?: string;
  onComplete: () => void;
}

export function PeriodResetDialog({
  open,
  onOpenChange,
  period,
  drivers,
  preselectedDriverId,
  onComplete,
}: PeriodResetDialogProps) {
  const { runExclusive, busy: fleetBusy } = useTollReconBusy();
  const [allDrivers, setAllDrivers] = useState(!preselectedDriverId);
  const [selectedDriverIds, setSelectedDriverIds] = useState<Set<string>>(
    () => new Set(preselectedDriverId ? [preselectedDriverId] : []),
  );
  const [preview, setPreview] = useState<PeriodResetInventory | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const lockBusy = executing || fleetBusy;
  const {
    onOpenChange: lockedOpenChange,
    contentProps: lockedContentProps,
  } = useLockedDialog(open, onOpenChange, lockBusy);

  const driverIdsForRequest = useMemo(
    () => (allDrivers ? undefined : [...selectedDriverIds]),
    [allDrivers, selectedDriverIds],
  );

  const totalItems = preview
    ? preview.unlinkedApplyTripIds.length +
      preview.disputeRefundIds.length +
      preview.claimIds.length +
      preview.tollIds.length +
      preview.refundResolutionTripIds.length
    : 0;

  const toggleDriver = (id: string) => {
    setAllDrivers(false);
    setSelectedDriverIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPreview(null);
  };

  const handlePreview = async () => {
    if (!allDrivers && selectedDriverIds.size === 0) {
      toast.error('Select at least one driver, or choose All drivers');
      return;
    }
    setPreviewLoading(true);
    try {
      const res = await api.previewPeriodReset(
        period.startDate,
        period.endDate,
        period.label,
        driverIdsForRequest,
      );
      setPreview(res.inventory);
      if (
        res.inventory.unlinkedApplyTripIds.length === 0 &&
        res.inventory.claimIds.length === 0 &&
        res.inventory.tollIds.length === 0
      ) {
        toast.info('Nothing to reset for this scope');
      }
    } catch (e: any) {
      const msg = e?.message || 'Preview failed';
      toast.error(msg.includes('reset') ? msg : `Preview failed: ${msg}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!periodConfirmLabelsMatch(confirmText, period.label)) {
      toast.error('Period label does not match — copy it from the line above (use – not - if typing manually)');
      return;
    }
    setExecuting(true);
    const toastId = toast.loading('Resetting period…');
    try {
      const res = await runExclusive('Resetting period…', () =>
        api.executePeriodReset(
          period.startDate,
          period.endDate,
          period.label,
          driverIdsForRequest,
        ),
      );
      toast.dismiss(toastId);
      if (!res) {
        toast.message('Another action is still running — try again when it finishes.');
        return;
      }
      if (res.errors?.length) {
        toast.warning('Reset completed with some errors', {
          description: res.errors.slice(0, 3).join('; '),
        });
      } else {
        toast.success('Period reset complete — back to period list');
      }
      lockedOpenChange(false);
      onComplete();
    } catch (e: any) {
      toast.dismiss(toastId);
      toast.error(e?.message || 'Reset failed');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={lockedOpenChange}>
      <DialogContent className="max-w-lg" hideCloseButton={lockBusy} {...lockedContentProps}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-red-600" />
            Reset this period
          </DialogTitle>
          <DialogDescription>
            Undo all reconciliation work for <strong>{period.label}</strong> and send tolls back to
            Needs Review. Toll charges and trips are not deleted. Tolls will be re-classified using
            current Automation settings (including personal-use detection).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              This reverses claims, dispute matches, unlinked applies, and driver charges for the
              selected scope. Other weeks are not affected.
            </span>
          </div>

          <div>
            <Label className="text-sm font-medium">Drivers to reset</Label>
            <div className="mt-2 space-y-2 max-h-40 overflow-y-auto border rounded-md p-3">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <Checkbox
                  checked={allDrivers}
                  onCheckedChange={(v) => {
                    setAllDrivers(!!v);
                    if (v) setSelectedDriverIds(new Set());
                    setPreview(null);
                  }}
                />
                All drivers
              </label>
              {drivers.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={!allDrivers && selectedDriverIds.has(d.id)}
                    disabled={allDrivers}
                    onCheckedChange={() => toggleDriver(d.id)}
                  />
                  {d.name}
                </label>
              ))}
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={previewLoading || lockBusy}
            onClick={handlePreview}
          >
            {previewLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading preview…
              </>
            ) : (
              'Preview what will be reset'
            )}
          </Button>

          {preview && (
            <div className="rounded-md border bg-slate-50 p-3 text-sm space-y-1">
              <p className="font-medium text-slate-800">Preview ({totalItems} items)</p>
              <ul className="text-slate-600 space-y-0.5">
                <li>Unlinked applies: {preview.unlinkedApplyTripIds.length}</li>
                <li>Dispute matches: {preview.disputeRefundIds.length}</li>
                <li>Claims: {preview.claimIds.length}</li>
                <li>Tolls to reset: {preview.tollIds.length}</li>
                <li>Refund resolutions: {preview.refundResolutionTripIds.length}</li>
                {preview.chargeDriverClaimIds.length > 0 && (
                  <li className="text-orange-700">
                    Charge-driver reversals: {preview.chargeDriverClaimIds.length}
                  </li>
                )}
              </ul>
            </div>
          )}

          {preview && totalItems > 0 && (
            <div>
              <Label htmlFor="period-reset-confirm" className="text-sm">
                Type <span className="font-mono font-medium">{period.label}</span> to confirm
              </Label>
              <Input
                id="period-reset-confirm"
                className="mt-1.5"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={period.label}
                disabled={lockBusy}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => lockedOpenChange(false)} disabled={lockBusy}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={
              lockBusy ||
              !preview ||
              totalItems === 0 ||
              !periodConfirmLabelsMatch(confirmText, period.label)
            }
            onClick={handleExecute}
          >
            {executing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Resetting…
              </>
            ) : (
              'Reset period'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
